import { assert, assertSQL, type SharedState } from "@e2e/engine";
import type { ContractAddress } from "@midnight-ntwrk/compact-runtime";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "@e2e/midnight-contracts/counter";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type {
  FinalizedTxData,
  ImpureCircuitId,
  MidnightProvider,
  MidnightProviders,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import { blockWatcher } from "@e2e/engine";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { Client } from "pg";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import {
  buildWalletFacade,
  getInitialShieldedState,
  syncAndWaitForFunds,
  type NetworkUrls as MidnightNetworkUrls,
  type WalletResult,
} from "@effectstream/midnight-contracts/wallet-info";
import {
  midnightNetworkConfig,
} from "@effectstream/midnight-contracts/midnight-env";
import { dirname, resolve } from "node:path";
import { AddressType } from "@effectstream/utils";
import { WebSocket } from "ws";


const BATCHER_URL = "http://localhost:3334";
globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type CounterCircuits = ImpureCircuitId<any>;

const CounterPrivateStateId = "counterPrivateState";

type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof CounterPrivateStateId,
  CounterPrivateState
>;

const contractConfig = {
  privateStateStoreName: "counter-private-state",
  zkConfigPath: resolve(
    dirname(new URL(import.meta.url).pathname),
    "../../../shared/contracts/midnight/contract-counter/src/managed",
  ),
};

const TTL_DURATION_MS = 60 * 60 * 1000;
const createTtl = () => new Date(Date.now() + TTL_DURATION_MS);

interface Config {
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  logDir = "logs/standalone";
  indexer = midnightNetworkConfig.indexer;
  indexerWS = midnightNetworkConfig.indexerWS;
  node = midnightNetworkConfig.node;
  proofServer = midnightNetworkConfig.proofServer;
  constructor() {
    setNetworkId(midnightNetworkConfig.id as any);
  }
}

const assertIndexerHealthy = async (
  config: Config,
): Promise<void> => {
  const blockQuery = `query { block { height } }`;
  const res = await fetch(config.indexer, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: blockQuery }),
  });
  if (!res.ok) {
    throw new Error(`Indexer unhealthy: HTTP ${res.status}`);
  }
  const data = await res.json();
  const height = data?.data?.block?.height;
  console.log(`✅ Indexer healthy. Current height: ${height ?? "unknown"}`);
};

/**
 * Default wallet seed. 
 * For the undeployed (local) network, this is the genesis seed that has initial funds.
 */
const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;

// Standalone helper functions
const counterContractInstance: any = new Counter.Contract(
  witnesses,
);

const getCounterLedgerState = async (
  providers: CounterProviders,
  contractAddress: ContractAddress,
): Promise<bigint | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state = contractState != null
      ? Counter.ledger(contractState.data).round
      : null;
    console.log(`📊 Ledger state: ${state}`);
    return state;
  } catch (error) {
    console.error("❌ Error getting counter ledger state:", error);
    throw error;
  }
};

const joinContract = async (
  providers: CounterProviders,
  contractAddress: string,
): Promise<any> => {
  const counterContract = await findDeployedContract(providers, {
    contractAddress,
    contract: counterContractInstance,
    privateStateId: "counterPrivateState",
    initialPrivateState: { privateCounter: 0 },
  });
  console.log(
    `Joined contract at address: ${counterContract.deployTxData.public.contractAddress}`,
  );
  return counterContract;
};

const increment = async (
  counterContract: any,
): Promise<FinalizedTxData> => {
  console.log("Incrementing...");
  const finalizedTxData = await counterContract.callTx.increment();
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  return finalizedTxData.public;
};

const displayCounterValue = async (
  providers: CounterProviders,
  counterContract: any,
): Promise<{ counterValue: bigint | null; contractAddress: string }> => {
  const contractAddress = counterContract.deployTxData.public.contractAddress;
  const counterValue = await getCounterLedgerState(providers, contractAddress);
  if (counterValue === null) {
    console.log(`There is no counter contract deployed at ${contractAddress}.`);
  } else {
    console.log(`Current counter value: ${Number(counterValue)}`);
  }
  return { contractAddress, counterValue };
};

const createWalletAndMidnightProvider = (
  walletResult: WalletResult,
): WalletProvider & MidnightProvider => {
  const {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys,
    walletDustSecretKey,
  } = walletResult;

  return {
    getCoinPublicKey() {
      return zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey() {
      return zswapSecretKeys.encryptionPublicKey;
    },
    balanceTx(tx, _newCoins, ttl) {
      return wallet.balanceTransaction(
        walletZswapSecretKeys,
        walletDustSecretKey,
        tx,
        ttl ?? createTtl(),
      );
    },
    submitTx(tx) {
      return wallet.submitTransaction(tx);
    },
  };
};

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string,
): Promise<WalletResult> => {
  const networkUrls: MidnightNetworkUrls = {
    indexer,
    indexerWS,
    node,
    proofServer,
  };

  const walletResult = await buildWalletFacade(
    networkUrls,
    seed,
    midnightNetworkConfig.id,
  );

  const shieldedState = await getInitialShieldedState(
    walletResult.wallet.shielded,
  );
  console.log(`Your wallet seed is: ${seed}`);
  console.log(`Your wallet address is: ${shieldedState.address.coinPublicKeyString()}`);

  await syncAndWaitForFunds(walletResult.wallet);
  return walletResult;
};

const configureProviders = (
  walletResult: WalletResult,
  config: Config,
) => {
  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    walletResult,
  );
  return {
    // Use minimal private state config with privateStateStoreName and walletProvider.
    // Omitting midnightDbName uses in-memory storage and avoids persisting/syncing
    // full historical private state which can take minutes and timeout.
    // We only need to submit transactions and read public ledger state.
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: contractConfig.privateStateStoreName,
      walletProvider: walletAndMidnightProvider,
    } as any),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider: new NodeZkConfigProvider<"increment">(
      contractConfig.zkConfigPath,
    ),
    proofProvider: httpClientProofProvider(config.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

/**
 * Get contract address from command line arguments or from a file
 */
const getContractAddress = (): string => {
  // First try to get from command line arguments
  const contractAddressFromArgs = Deno.args[0];

  if (contractAddressFromArgs) {
    console.log(
      `📋 Using contract address from arguments: ${contractAddressFromArgs}`,
    );
    return contractAddressFromArgs;
  }

  // If not provided via args, try to read from contract_address.txt file

  try {
    const contractAddressFromFile = readMidnightContract(
      "contract-counter",
      { networkId: midnightNetworkConfig.id },
    ).contractAddress;

    if (contractAddressFromFile) {
      console.log(
        `📄 Using contract address from file: ${contractAddressFromFile}`,
      );
      return contractAddressFromFile;
    } else {
      throw new Error("Contract address file is empty");
    }
  } catch (error) {
    console.error(`❌ Error reading contract address from file: ${error}`);
    console.error("❌ Error: Contract address is required");
    console.error(
      "Usage: deno run --allow-all increment.ts <CONTRACT_ADDRESS>",
    );
    console.error(
      "Or create a contract_address.txt file with the contract address",
    );
    console.error(
      "Example: deno run --allow-all increment.ts 0x1234567890abcdef1234567890abcdef12345678",
    );
    Deno.exit(1);
  }
};


async function sendMintToBatcher(
  amount: number | string,
  confirmationLevel: string = "no-wait",
): Promise<number> {
  const account = {
    is_left: true,
    left: {
      bytes: "0x00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
    },
    right: {
      bytes: "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
  };
  const input = JSON.stringify({
    circuit: "mint",
    args: [account, amount],
  });
  const body = {
    data: {
      target: "midnight_eip20",
      address: "placeholderaddress",
      addressType: AddressType.MIDNIGHT,
      input,
      timestamp: Date.now(),
    },
    confirmationLevel: confirmationLevel,
  };
  const response = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (response.ok) {
    console.log("Mint sent to batcher successfully");
  } else {
    console.error("[ERROR] Sending mint to batcher:", result);
  }
  return response.status;
}

/**
 * Standalone script that joins a counter contract with a specific address and increments its value.
 *
 * Usage:
 *   deno run --allow-all increment.ts <CONTRACT_ADDRESS>
 *   or create a contract_address.txt file with the contract address
 *
 * Example:
 *   deno run --allow-all increment.ts 0x1234567890abcdef1234567890abcdef12345678
 */
async function joinAndIncrementTest(
  db: Client,
  sharedState: SharedState,
): Promise<void> {
  // Get contract address from command line arguments or file
  const contractAddress = getContractAddress();

  console.log(
    `🚀 Starting join and increment process for contract: ${contractAddress}`,
  );

  // Initialize configuration
  const config = new StandaloneConfig();

  let walletResult: WalletResult | null = null;

  try {
    // Fail fast if indexer is down instead of waiting for join timeout
    await assertIndexerHealthy(config);

    console.log("🔗 Building wallet with default wallet seed...");

    // Build wallet using default wallet seed (genesis seed in standalone mode)
    walletResult = await buildWalletAndWaitForFunds(
      config,
      DEFAULT_WALLET_SEED,
    );

    console.log("✅ Wallet built successfully");

    // Configure providers
    console.log("⚙️ - Configuring providers...");
    const providers = configureProviders(walletResult, config);

    console.log("✅ Providers configured successfully");

    // Join the contract
    console.log(`🔗 Joining counter contract at address: ${contractAddress}`);
    const counterContract = await joinContract(providers, contractAddress);

    console.log("✅ Successfully joined the counter contract");

    // Display current counter value before increment
    console.log("📊 Displaying current counter value before increment...");
    const beforeResult = await displayCounterValue(providers, counterContract);
    console.log(`📊 Current counter value: ${beforeResult.counterValue}`);

    // Increment the counter
    console.log("🔢 Incrementing counter...");
    const incrementResult = await increment(counterContract);

    console.log(
      `✅ Counter incremented successfully! Transaction ID: ${incrementResult.txId}`,
    );
    console.log(
      `✅ Counter incremented! Transaction: ${incrementResult.txId} in block ${incrementResult.blockHeight}`,
    );

    sharedState.primitive_accounting_counter += 1;

    // Display counter value after increment
    console.log("📊 Displaying counter value after increment...");
    const afterResult = await displayCounterValue(providers, counterContract);
    console.log(`📊 New counter value: ${afterResult.counterValue}`);

    console.log("🎉 Join and increment process completed successfully!");

    console.log("🔍 Waiting for block...", incrementResult.blockHeight, '@ parallelMidnight');
    await blockWatcher.waitForBlock("parallelMidnight", incrementResult.blockHeight);


  } catch (error) {
    console.error("❌ Error during join and increment process:", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    // Deno.exit(1);
  } finally {
    // Clean up wallet
    if (walletResult) {
      try {
        console.log("🧹 Wallet closed successfully");
        await walletResult.wallet.stop();
        await assertSQL<{
          primitive_name: string;
          id: number;
          effectstream_block_height: number;
          payload_type: string;
          payload: { 
            payload: {
              round: string;
            }
          };
        }>(
          "Midnight Rows Exists",
          db,
          "SELECT * FROM effectstream.primitive_accounting WHERE primitive_name = 'MidnightContractState'",
          (res) => true,
          (res) => {
            const countOK = res.rows.length === 2;
            const row0_OK = res.rows[0].payload.payload.round === "0";
            const row1_OK = res.rows[1].payload.payload.round === "1";
            const OK = countOK && row0_OK && row1_OK;
            if (!OK) {
              console.log({countOK, row0_OK, row1_OK, row: res.rows});
            }
            return OK;
          },
        );

      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
}

async function sendMintToBatcherTest(
  db: Client,
  sharedState: SharedState,
): Promise<void> {
  const status200 = await sendMintToBatcher(20000);
  console.log("🪙 Correct input for Mint sent to batcher successfully with status:", status200);
  await assert(
    "Send Mint to Batcher Test",
    () => Promise.resolve(status200 === 200),
  );
  if (status200 === 200) {
    sharedState.primitive_accounting_counter += 1;
  }

  const statusBadInput = await sendMintToBatcher("not a number");
  console.log("🪙 Wrong input for Mint sent to batcher successfully:", statusBadInput);
  await assert(
    "Send Mint to Batcher Test Bad Input",
    () => Promise.resolve(statusBadInput === 400),
  );

  const statusBadConfirmationLevel = await sendMintToBatcher(20000, "wrong-confirmation-level");
  console.log("🪙 Wrong confirmation level for Mint sent to batcher successfully:", statusBadConfirmationLevel);
  await assert(
    "Send Mint to Batcher Test Bad Confirmation Level",
    () => Promise.resolve(statusBadConfirmationLevel === 400),
  );
}

export { joinAndIncrementTest, sendMintToBatcherTest };


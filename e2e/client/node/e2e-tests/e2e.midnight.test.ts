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
import {
  type FinalizedTxData,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type WalletProvider,
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
    "../../../shared/contracts/midnight/contract-counter/src/managed/counter",
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
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId("Undeployed" as unknown as any);
  }
}

/**
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

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
    "undeployed",
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
    privateStateProvider: levelPrivateStateProvider<
      typeof CounterPrivateStateId
    >({
      privateStateStoreName: contractConfig.privateStateStoreName,
      signingKeyStoreName: `${contractConfig.privateStateStoreName}-signing-keys`,
    }),
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
const getContractAddress = async (): Promise<string> => {
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
    const contractAddressFromFile = readMidnightContract("contract-counter", "contract-counter.json").contractAddress;

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
  const contractAddress = await getContractAddress();

  console.log(
    `🚀 Starting join and increment process for contract: ${contractAddress}`,
  );

  // Initialize configuration
  const config = new StandaloneConfig();

  let walletResult: WalletResult | null = null;

  try {
    console.log("🔗 Building wallet with genesis seed for standalone mode...");

    // Build wallet using genesis seed (which has initial funds in standalone mode)
    walletResult = await buildWalletAndWaitForFunds(
      config,
      GENESIS_MINT_WALLET_SEED,
    );

    console.log("✅ Wallet built successfully");

    // Configure providers
    console.log("⚙️ Configuring providers...");
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
  await assert("Send Mint to Batcher Test", async () => {
    return status200 === 200;
  });

  const statusBadInput = await sendMintToBatcher("not a number");
  console.log("🪙 Wrong input for Mint sent to batcher successfully:", statusBadInput);
  await assert("Send Mint to Batcher Test Bad Input", async () => {
    return statusBadInput === 400;
  });

  const statusBadConfirmationLevel = await sendMintToBatcher(20000, "wrong-confirmation-level");
  console.log("🪙 Wrong confirmation level for Mint sent to batcher successfully:", statusBadConfirmationLevel);
  await assert("Send Mint to Batcher Test Bad Confirmation Level", async () => {
    return statusBadConfirmationLevel === 400;
  });
}

export { joinAndIncrementTest, sendMintToBatcherTest };

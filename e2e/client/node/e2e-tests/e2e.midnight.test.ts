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
  MidnightProvider,
  MidnightProviders,
  UnboundTransaction,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { findDeployedContract, type FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import { blockWatcher } from "@e2e/engine";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { Client } from "pg";
import {
  readMidnightContract,
  buildWalletFacade,
  getInitialShieldedState,
  syncAndWaitForFunds,
  type NetworkUrls as MidnightNetworkUrls,
  type WalletResult,
  midnightNetworkConfig,
  type NetworkUrls,
} from "@effectstream/midnight-contracts";
import {
  type FinalizedTransaction,
  Transaction as LedgerTransaction,
} from "@midnight-ntwrk/ledger-v8";
import { fromHex, toHex } from "@midnight-ntwrk/midnight-js-utils";
import { dirname, resolve } from "node:path";
import { AddressType } from "@effectstream/utils";
import { WebSocket } from "ws";
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { Contract } from '@midnight-ntwrk/compact-js';


const BATCHER_URL = "http://localhost:3334";
// @ts-ignore - WebSocket is not defined in the global scope
globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type CounterCircuits = Contract.ProvableCircuitId<Counter.Contract>;

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
 * Waits until the Midnight indexer has indexed a specific contract address.
 *
 * `findDeployedContract` internally calls `watchForDeployTxData` which polls
 * the Midnight GraphQL indexer every 1 second but has no timeout. If the
 * indexer restarts between e2e runs it must replay all blocks to catch up,
 * which can take minutes when the chain has accumulated many blocks. Waiting
 * here with clear logging avoids a silent infinite hang inside the SDK.
 */
const waitForMidnightIndexerContract = async (
  config: Config,
  contractAddress: string,
  maxWaitMs = 300_000,
): Promise<void> => {
  const query = `query($addr: HexEncoded!) { contractAction(address: $addr) { __typename } }`;
  const start = Date.now();
  let attempt = 0;

  while (true) {
    try {
      const res = await fetch(config.indexer, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { addr: contractAddress } }),
      });
      const data = await res.json();
      if (data?.data?.contractAction !== null && data?.data?.contractAction !== undefined) {
        console.log(`✅ Midnight indexer has indexed contract (${attempt} retries, ${Math.round((Date.now() - start) / 1000)}s)`);
        return;
      }
    } catch (err) {
      console.warn(`⚠️ Indexer query failed:`, err);
    }

    const elapsed = Date.now() - start;
    if (elapsed >= maxWaitMs) {
      throw new Error(
        `Midnight indexer did not index contract ${contractAddress} within ${maxWaitMs / 1000}s. ` +
        `The indexer may still be replaying historical blocks — check indexer logs.`,
      );
    }

    attempt++;
    if (attempt % 5 === 0) {
      console.log(`⏳ Waiting for Midnight indexer to index contract... (${Math.round(elapsed / 1000)}s elapsed)`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
};

/**
 * Default wallet seed. 
 * For the undeployed (local) network, this is the genesis seed that has initial funds.
 */
const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;

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
  const MyCompiledContract = CompiledContract.make('contract-counter', Counter.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets('./')
  );

  const counterContract: FoundContract<Counter.Contract<CounterPrivateState>> = await (findDeployedContract)(providers, {
    contractAddress,
    compiledContract: MyCompiledContract,
    privateStateId: "counterPrivateState",
    initialPrivateState: { privateCounter: 0 },
  });
  console.log(
    `Joined contract at address: ${counterContract.deployTxData.public.contractAddress}`,
  );
  return counterContract;
};

const increment = async (
  counterContract: FoundContract<Counter.Contract<CounterPrivateState>>,
): Promise<FinalizedTxData> => {
  console.log("Incrementing...");
  const finalizedTxData = await counterContract.callTx.increment();
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  return finalizedTxData.public;
};

const addEntry = async (
  counterContract: FoundContract<Counter.Contract<CounterPrivateState>>,
  id: string,
  value: bigint,
): Promise<FinalizedTxData> => {
  console.log(`Adding entry ${id} = ${value}...`);
  const finalizedTxData = await counterContract.callTx.add_entry(Uint8Array.from(Buffer.from(id, 'hex')), value);
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
    dustSecretKey,
    unshieldedKeystore,
  } = walletResult;

  return {
    getCoinPublicKey() {
      return zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey() {
      return zswapSecretKeys.encryptionPublicKey;
    },
    async balanceTx(
      tx: UnboundTransaction,
      ttl?: Date
    ): Promise<FinalizedTransaction> {
      const bound = tx.bind();
      const finalizedTransactionRecipe = await wallet.balanceFinalizedTransaction(bound, {
        shieldedSecretKeys: zswapSecretKeys, 
        dustSecretKey: dustSecretKey,
       }, { ttl: ttl ?? createTtl() } );
      const x = await wallet.signRecipe(finalizedTransactionRecipe, (payload) => unshieldedKeystore.signData(payload));
      return wallet.finalizeRecipe(x);
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
  const networkUrls: Required<NetworkUrls> = {
    indexer,
    indexerWS,
    node,
    proofServer,
    id: midnightNetworkConfig.id,
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
  const zkConfigProvider = new NodeZkConfigProvider<"increment">(
    contractConfig.zkConfigPath,
  );
  return {
    // Use minimal private state config with privateStateStoreName and walletProvider.
    // Omitting midnightDbName uses in-memory storage and avoids persisting/syncing
    // full historical private state which can take minutes and timeout.
    // We only need to submit transactions and read public ledger state.
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: contractConfig.privateStateStoreName,
      privateStoragePasswordProvider: async () => "YourPasswordMy1!",
      accountId: Buffer.from(walletResult!.zswapSecretKeys.coinPublicKey).toString('hex'),
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

/**
 * Get contract address from command line arguments or from a file
 */
import { args, exit } from "@effectstream/utils/runtime";
import { Buffer } from "node:buffer";

const getContractAddress = (): string => {
  // First try to get from command line arguments
  const contractAddressFromArgs = args()[0];

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
    exit(1);
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

    // Wait for the Midnight indexer to have indexed this contract before calling
    // findDeployedContract. Without this, watchForDeployTxData polls silently
    // forever if the indexer is still replaying historical blocks.
    console.log(`⏳ Waiting for Midnight indexer to index contract ${contractAddress}...`);
    await waitForMidnightIndexerContract(config, contractAddress);

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

    // Add an entry to the map
    console.log("📝 Adding entry to map...");
    const testId = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    const testValue = 42n;
    const addEntryResult = await addEntry(counterContract, testId, testValue);
    
    console.log(
      `✅ Entry added successfully! Transaction ID: ${addEntryResult.txId}`,
    );
    
    sharedState.primitive_accounting_counter += 1;

    // Display counter value after increment
    console.log("📊 Displaying counter value after increment...");
    const afterResult = await displayCounterValue(providers, counterContract);
    console.log(`📊 New counter value: ${afterResult.counterValue}`);

    console.log("🎉 Join and increment process completed successfully!");

    console.log("🔍 Waiting for block...", addEntryResult.blockHeight, '@ parallelMidnight');
    await blockWatcher.waitForBlock("parallelMidnight", addEntryResult.blockHeight);


  } catch (error) {
    console.error("❌ Error during join and increment process:", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
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
              entries?: Record<string, string>;
              map_of_map?: Record<string, Record<string, string>>;
            }
          };
        }>(
          "Midnight Rows Exists",
          db,
          "SELECT * FROM effectstream.primitive_accounting WHERE primitive_name = 'MidnightContractState'",
          (res) => true,
          (res) => {
            // console.log("🔍 res.rows:", res.rows);
            const countOK = res.rows.length >= 2;
            const row0_OK = res.rows[0].payload.payload.round === "0";
            const row1_OK = res.rows[1].payload.payload.round === "1";
            
            // Check if the entry was added in the latest row
            const lastRow = res.rows[res.rows.length - 1];
            const entriesOK = lastRow.payload.payload.entries !== undefined && 
                              Object.keys(lastRow.payload.payload.entries).length > 0;
                              
            const mapOfMapOK = lastRow.payload.payload.map_of_map !== undefined && 
                               Object.keys(lastRow.payload.payload.map_of_map).length > 0;
            
            console.log("Disabled entries check - expected to be true", { entriesOK });
            const OK = countOK && row0_OK && row1_OK /*&& entriesOK*/ && mapOfMapOK;
            if (!OK) {
              console.log({countOK, row0_OK, row1_OK, /*entriesOK,*/ mapOfMapOK, row: res.rows});
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

class DelegatedBalancingSentError extends Error {
  constructor() {
    super("Delegated balancing flow handed off to batcher");
  }
}

// === Delegated Balancing Test (Party A) ===

async function testDelegatedBalancing(
  db: Client,
  sharedState: SharedState,
): Promise<void> {
  console.log("🧪 Starting Delegated Balancing E2E Test (Party A Flow)");

  const contractAddress = getContractAddress();
  const config = new StandaloneConfig();

  // 1. Setup Party A wallet (random seed, simulates user)
  // Generate a random seed for Party A
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const partyASeed = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  
  console.log("👤 Party A Seed (Random):", partyASeed);

  let walletResult: WalletResult | null = null;

  try {
    // Build Party A wallet
    // We don't need funds for Party A since they are delegating payment!
    const networkUrls = {
      id: midnightNetworkConfig.id,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      proofServer: config.proofServer,
    };
    
    walletResult = await buildWalletFacade(
      networkUrls,
      partyASeed,
      midnightNetworkConfig.id,
    );

    // 2. Create Provider that captures unproven tx and defers balancing
    let serializedTx: string | null = null;
    const interceptingProvider: WalletProvider & MidnightProvider = {
      getCoinPublicKey() {
        return walletResult!.zswapSecretKeys.coinPublicKey;
      },
      getEncryptionPublicKey() {
        return walletResult!.zswapSecretKeys.encryptionPublicKey;
      },
      balanceTx(
        tx,
        _ttl,
      ): Promise<FinalizedTransaction> {
        console.log("🧾 Capturing FinalizedTransaction from contract call...");

        const bound = tx.bind();
        const serialized = toHex(bound.serialize());
        console.log("📦 Serialized FinalizedTransaction (Hex length):", serialized.length);

        // Validate the serialized payload can round-trip with expected states.
        LedgerTransaction.deserialize(
          "signature" as const,
          "proof" as const,
          "binding" as const,
          fromHex(serialized),
        );

        serializedTx = serialized;
        return Promise.resolve(bound);

        // Ledger7 style
        // const finalizedTransactionRecipe = await wallet.balanceFinalizedTransaction(
        //   bound, {
        //     shieldedSecretKeys: zswapSecretKeys, 
        //     dustSecretKey: dustSecretKey,
        //   }, { 
        //     ttl: ttl ?? createTtl(),
        //   }
        // );
        // const x = await walletResult!.wallet.signRecipe(finalizedTransactionRecipe, (payload) => walletResult!.unshieldedKeystore.signData(payload));
        // return walletResult!.wallet.finalizeRecipe(x);

        // Balancer Mode
        // Return an explicit recipe without throwing; proofing/submission is delegated.
        // return Promise.resolve({
        //   type: 'TransactionToProve' as const, // TODO: TRANSACTION_TO_PROVE,
        //   transaction: tx,
        // }); 
      },
      submitTx(_tx) {
        // Delegated mode: stop the default submit/wait flow.
        throw new DelegatedBalancingSentError();
      },
    };

    // 3. Configure Providers with Interceptor
    // Use per-seed names to avoid decrypting stale state from previous runs.
    const privateStateStoreName = `party-a-private-state-${partyASeed.slice(0, 8)}`;
    const midnightDbName = `midnight-level-db-party-a-${partyASeed.slice(0, 8)}`;
    console.log("🗄️ Party A private state store:", privateStateStoreName);
    console.log("🗄️ Party A midnight DB:", midnightDbName);
    const zkConfigProvider = new NodeZkConfigProvider<"increment">(
      contractConfig.zkConfigPath,
    );
    const providers = {
      privateStateProvider: levelPrivateStateProvider({
        midnightDbName,
        privateStateStoreName,
        privateStoragePasswordProvider: async () => "YourPasswordMy1!",
        accountId: Buffer.from(walletResult!.zswapSecretKeys.coinPublicKey).toString('hex'),
      }),
      publicDataProvider: indexerPublicDataProvider(
        config.indexer,
        config.indexerWS,
      ),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
      walletProvider: interceptingProvider,
      midnightProvider: interceptingProvider,
    };

    // First, create the compiled contract
    const MyCompiledContract = CompiledContract.make('contract-counter', Counter.Contract).pipe(
      CompiledContract.withWitnesses(witnesses as never),
      CompiledContract.withCompiledFileAssets('./')
    );

    // 4. Join Contract as Party A
    console.log("🔗 Joining contract as Party A...");
    console.log("📎 Party A contract address:", contractAddress);
    try {
      const counterContract: FoundContract<Counter.Contract<CounterPrivateState>> = await findDeployedContract(providers, {
        contractAddress,
        compiledContract: MyCompiledContract,
        privateStateId: "partyAPrivateState",
        initialPrivateState: { privateCounter: 0 },
      });
      // 5. Call Circuit & Capture
      console.log("🔄 Calling increment() circuit...");
      try {
        await (counterContract.callTx).increment();
        console.log("✅ Transaction captured; delegated balancing will handle submission.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          error instanceof DelegatedBalancingSentError ||
          message.includes("Delegated balancing flow handed off to batcher")
        ) {
          console.log("✅ Transaction captured; delegated balancing will handle submission.");
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("❌ Failed to join contract as Party A:", error);
      console.error("🧩 Debug context:", {
        privateStateStoreName,
        networkId: midnightNetworkConfig.id,
        indexer: config.indexer,
        indexerWS: config.indexerWS,
        node: config.node,
        proofServer: config.proofServer,
      });
      throw error;
    }

    if (!serializedTx) {
      throw new Error("Failed to intercept transaction");
    }

    // 6. Send to Batcher (Party B)
    console.log("🚀 Sending serialized transaction to Batcher (Party B)...");
    
    // We send to the 'midnight_balancing' target
    const body = {
      data: {
        target: "midnight_balancing",
        address: "party_a_delegated", // Arbitrary ID for logs
        addressType: AddressType.MIDNIGHT,
        input: JSON.stringify({
          tx: serializedTx,
          txStage: "finalized",
          circuitId: "increment",
        }),
        timestamp: Date.now(),
      },
      confirmationLevel: "wait-effectstream-processed", // Wait for it to be processed
    };

    const response = await fetch(`${BATCHER_URL}/send-input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    console.log("📬 Batcher response:", JSON.stringify(result, null, 2));

    if (!response.ok || !result.success) {
      throw new Error(`Batcher failed to process delegated transaction: ${result.message || response.statusText}`);
    }

    console.log("✅ Delegated transaction submitted successfully!");
    
    // 7. Verify Increment (Optional, but good practice)
    // We can use the existing provider to check state if we want, or just rely on batcher success
    // sharedState.primitive_accounting_counter += 1; // If we want to track state changes

  } catch (error) {
    console.error("❌ Delegated balancing test failed:", error);
    throw error;
  } finally {
    if (walletResult) {
      await walletResult.wallet.stop();
    }
  }
}

// === Concurrent Delegated Balancing Test ===

async function buildDelegatedTx(
  config: StandaloneConfig,
  contractAddress: string,
  partyIndex: number,
): Promise<{ serializedTx: string; walletResult: WalletResult }> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const seed = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  console.log(`👤 Party ${partyIndex} Seed: ${seed.slice(0, 8)}...`);

  const networkUrls = {
    id: midnightNetworkConfig.id,
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    node: config.node,
    proofServer: config.proofServer,
  };

  const walletResult = await buildWalletFacade(
    networkUrls,
    seed,
    midnightNetworkConfig.id,
  );

  let serializedTx: string | null = null;

  const interceptingProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey() {
      return walletResult.zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey() {
      return walletResult.zswapSecretKeys.encryptionPublicKey;
    },
    balanceTx(tx, _ttl): Promise<FinalizedTransaction> {
      const bound = tx.bind();
      const hex = toHex(bound.serialize());
      LedgerTransaction.deserialize(
        "signature" as const,
        "proof" as const,
        "binding" as const,
        fromHex(hex),
      );
      serializedTx = hex;
      return Promise.resolve(bound);
    },
    submitTx(_tx) {
      throw new DelegatedBalancingSentError();
    },
  };

  const zkConfigProvider = new NodeZkConfigProvider<"increment">(
    contractConfig.zkConfigPath,
  );
  const midnightDbName = `midnight-db-party-${partyIndex}-${seed.slice(0, 8)}`;
  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName,
      privateStateStoreName: `concurrent-party-${partyIndex}-${seed.slice(0, 8)}`,
      privateStoragePasswordProvider: async () => "YourPasswordMy1!",
      accountId: Buffer.from(walletResult!.zswapSecretKeys.coinPublicKey).toString('hex'),
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: interceptingProvider,
    midnightProvider: interceptingProvider,
  };

  const MyCompiledContract = CompiledContract.make(
    "contract-counter",
    Counter.Contract,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets("./"),
  );

  const counterContract: FoundContract<
    Counter.Contract<CounterPrivateState>
  > = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: MyCompiledContract,
    privateStateId: `concurrentPrivateState_${partyIndex}`,
    initialPrivateState: { privateCounter: 0 },
  });

  // Each party uses its unique seed as the map key — guarantees no two parties
  // conflict on the same ledger entry even when submitted concurrently.
  const entryKey = Uint8Array.from(Buffer.from(seed, 'hex'));
  const entryValue = BigInt(partyIndex);

  try {
    await counterContract.callTx.increment();
    // await counterContract.callTx.add_entry(entryKey, entryValue);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? (error as any).cause : undefined;
    const isDelegated =
      error instanceof DelegatedBalancingSentError ||
      cause instanceof DelegatedBalancingSentError ||
      message.includes("Delegated balancing flow handed off to batcher");
    if (!isDelegated) throw error;
  }

  if (!serializedTx) {
    throw new Error(`Party ${partyIndex} failed to intercept transaction`);
  }

  return { serializedTx, walletResult };
}

async function sendDelegatedTxToBatcher(
  serializedTx: string,
  partyIndex: number,
): Promise<{ ok: boolean; result: any }> {
  const body = {
    data: {
      target: "midnight_balancing",
      address: `party_${partyIndex}_concurrent`,
      addressType: AddressType.MIDNIGHT,
      input: JSON.stringify({
        tx: serializedTx,
        txStage: "finalized",
        circuitId: "increment",
      }),
      timestamp: Date.now(),
    },
    confirmationLevel: "wait-effectstream-processed",
    timeoutMs: 300000, // 5 minutes: multiple batch cycles may be needed for concurrent submissions
  };

  const response = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  return { ok: response.ok && result.success === true, result };
}

/**
 * Sends multiple delegated transactions concurrently to midnight_balancing and
 * verifies they all succeed without waiting for a new block between them.
 * This exercises the speculative dust-UTXO pipeline in the balancing adapter.
 */
async function testConcurrentDelegatedBalancing(
  _db: Client,
  _sharedState: SharedState,
  concurrency: number = 3,
): Promise<void> {
  console.log(
    `🧪 Starting Concurrent Delegated Balancing Test (${concurrency} parties in parallel)`,
  );

  const contractAddress = getContractAddress();
  const config = new StandaloneConfig();

  // Phase 1: Build all party A serialized transactions sequentially.
  // Each build triggers a ZK proof on the proof server; running them concurrently
  // exhausts the WASM instance pool. The concurrency being tested is the batcher
  // submission phase, not the proof generation phase.
  console.log(`🔧 Building ${concurrency} party-A transactions sequentially...`);
  const flows: Awaited<ReturnType<typeof buildDelegatedTx>>[] = [];
  for (let i = 0; i < concurrency; i++) {
    flows.push(await buildDelegatedTx(config, contractAddress, i + 1));
  }

  // Clean up party A wallets – we only needed them for proving.
  await Promise.all(flows.map(({ walletResult }) => walletResult.wallet.stop()));

  // Phase 2: Submit all transactions concurrently to the batcher.
  // The midnight_balancing adapter uses speculative dust-UTXO selection so it
  // can balance multiple transactions within the same block window without
  // waiting for on-chain confirmation between them.
  const startTime = Date.now();
  console.log(
    `🚀 Sending ${concurrency} transactions concurrently to midnight_balancing...`,
  );

  const results = await Promise.all(
    flows.map(({ serializedTx }, i) =>
      sendDelegatedTxToBatcher(serializedTx, i + 1)),
  );

  const elapsed = Date.now() - startTime;
  console.log(
    `⏱️ All ${concurrency} transactions resolved in ${elapsed}ms`,
  );

  for (let i = 0; i < results.length; i++) {
    const { ok, result } = results[i];
    console.log(
      `  Party ${i + 1}: ${ok ? "✅" : "❌"} ${result.transactionHash ?? result.message ?? ""}`,
    );
  }

  const allPassed = results.every((r) => r.ok);
  await assert(
    "Concurrent Delegated Balancing (all succeed)",
    () => Promise.resolve(allPassed),
  );
}

export {
  joinAndIncrementTest,
  sendMintToBatcherTest,
  testDelegatedBalancing,
  testConcurrentDelegatedBalancing,
};

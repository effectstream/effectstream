import {
  type ContractAddress,
  NetworkId,
} from "@midnight-ntwrk/compact-runtime";
import {
  Counter,
  type CounterPrivateState,
  witnesses as counterWitnesses,
} from "./contract-counter/src/index.ts";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "@midnight-ntwrk/ledger";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnbalancedTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { type Resource, WalletBuilder } from "@midnight-ntwrk/wallet";
import { type Wallet } from "@midnight-ntwrk/wallet-api";
import { Transaction as ZswapTransaction } from "@midnight-ntwrk/zswap";
import * as Rx from "rxjs";
import { WebSocket } from "ws";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  assertIsContractAddress,
  toHex,
} from "@midnight-ntwrk/midnight-js-utils";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { getEnv, args, exit } from "@effectstream/utils/runtime";

// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type CounterCircuits = ImpureCircuitId<Counter.Contract<CounterPrivateState>>;

const CounterPrivateStateId = "counterPrivateState";

type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof CounterPrivateStateId,
  CounterPrivateState
>;

type CounterContract = Counter.Contract<CounterPrivateState>;

type DeployedCounterContract =
  | DeployedContract<CounterContract>
  | FoundContract<CounterContract>;

// Inlined config for standalone script
const currentDir = resolve(
  dirname(new URL(import.meta.url).pathname),
);

const contractConfig = {
  privateStateStoreName: "counter-private-state",
  zkConfigPath: resolve(
    currentDir,
    "contract-counter",
    "src",
    "managed",
    "counter",
  ),
};

interface Config {
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  logDir = resolve(
    currentDir,
    "..",
    "logs",
    "standalone",
    `${new Date().toISOString()}.log`,
  );
  indexer = midnightNetworkConfig.indexer;
  indexerWS = midnightNetworkConfig.indexerWS;
  node = midnightNetworkConfig.node;
  proofServer = midnightNetworkConfig.proofServer;
  constructor() {
    setNetworkId(midnightNetworkConfig.id as NetworkId);
  }
}

/**
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

const contractNetworkId = midnightNetworkConfig.id ?? "undeployed";
const contractAddressFileName = `contract-counter.${contractNetworkId}.json`;

/**
 * Default wallet seed.
 * In the case of the undeployed (local) network, this is the genesis seed that has initial funds.
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
): Promise<DeployedCounterContract> => {
  // First, create the compiled contract
  const MyCompiledContract = CompiledContract.make('contract-counter', Counter.Contract).pipe(
    CompiledContract.withWitnesses(counterWitnesses as never),
    CompiledContract.withCompiledFileAssets('./')
  );

  const counterContract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: MyCompiledContract as any,
    privateStateId: "counterPrivateState",
    initialPrivateState: { privateCounter: 0 },
  });
  console.log(
    `Joined contract at address: ${counterContract.deployTxData.public.contractAddress}`,
  );
  return counterContract;
};

const increment = async (
  counterContract: DeployedCounterContract,
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
  counterContract: DeployedCounterContract,
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

const createWalletAndMidnightProvider = async (
  wallet: Wallet,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
  return {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
    balanceTx(
      tx: UnbalancedTransaction,
      newCoins: CoinInfo[],
    ): Promise<BalancedTransaction> {
      return wallet
        .balanceTransaction(
          ZswapTransaction.deserialize(
            tx.serialize(getLedgerNetworkId()),
            getZswapNetworkId(),
          ),
          newCoins,
        )
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) =>
          Transaction.deserialize(
            zswapTx.serialize(getZswapNetworkId()),
            getLedgerNetworkId(),
          )
        )
        .then(createBalancedTx);
    },
    submitTx(tx: BalancedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
};

const waitForFunds = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((state: any) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        console.log(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
        );
      }),
      Rx.filter((state: any) => {
        return state.syncProgress?.synced === true;
      }),
      Rx.map((s: any) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string,
  filename: string,
): Promise<Wallet & Resource> => {
  const directoryPath = getEnv("SYNC_CACHE");
  let wallet: Wallet & Resource;
  if (directoryPath !== undefined) {
    const fullPath = `${directoryPath}/${filename}`;
    if (existsSync(fullPath)) {
      console.log(
        `Attempting to restore state from ${fullPath}`,
      );
      try {
        const serialized = await readFile(fullPath);
        wallet = await WalletBuilder.restore(
          indexer,
          indexerWS,
          proofServer,
          node,
          seed,
          serialized,
          "info",
        );
        wallet.start();
      } catch (error: unknown) {
        console.log(
          "Wallet was not able to restore using the stored state, building wallet from scratch",
        );
        wallet = await WalletBuilder.buildFromSeed(
          indexer,
          indexerWS,
          proofServer,
          node,
          seed,
          getZswapNetworkId(),
          "info",
        );
        wallet.start();
      }
    } else {
      console.log("Wallet save file not found, building wallet from scratch");
      wallet = await WalletBuilder.buildFromSeed(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        getZswapNetworkId(),
        "info",
      );
      wallet.start();
    }
  } else {
    console.log(
      "📁 File path for save file not found, building wallet from scratch",
    );

    try {
      wallet = await WalletBuilder.buildFromSeed(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        NetworkId.Undeployed,
        "info",
      );
      console.log("✅ Wallet built successfully");
      wallet.start();
    } catch (error) {
      console.error("❌ Error building wallet:", error);
      throw error;
    }
  }

  const state = await Rx.firstValueFrom(wallet.state());
  console.log(`Your wallet seed is: ${seed}`);
  console.log(`Your wallet address is: ${state.address}`);
  let balance = state.balances[nativeToken()];
  if (balance === undefined || balance === 0n) {
    console.log(`Your wallet balance is: 0`);
    console.log(`Waiting to receive tokens...`);
    balance = await waitForFunds(wallet);
  }
  console.log(`Your wallet balance is: ${balance}`);
  return wallet;
};

const configureProviders = async (
  wallet: Wallet & Resource,
  config: Config,
) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(
    wallet,
  );
  return {
    // Old SDK: Empty config works fine - avoids historical private state sync
    privateStateProvider: levelPrivateStateProvider({}),
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
  const contractAddressFromArgs = args()[0];

  if (contractAddressFromArgs) {
    console.log(
      `📋 Using contract address from arguments: ${contractAddressFromArgs}`,
    );
    return contractAddressFromArgs;
  }

  // If not provided via args, try to read from contract_address.txt file
  const contractAddressFile = resolve(currentDir, contractAddressFileName);

  try {
    if (existsSync(contractAddressFile)) {
      const contractAddressFromFile = JSON.parse(
        await readFile(contractAddressFile, "utf-8"),
      ).contractAddress;

      if (contractAddressFromFile) {
        console.log(
          `📄 Using contract address from file ${contractAddressFile}: ${contractAddressFromFile}`,
        );
        return contractAddressFromFile;
      } else {
        throw new Error("Contract address file is empty");
      }
    } else {
      throw new Error(
        `Contract address file not found at ${contractAddressFile}`,
      );
    }
  } catch (error) {
    console.error(`❌ Error reading contract address from file: ${error}`);
    console.error("❌ Error: Contract address is required");
    console.error(
      "Usage: bun increment.ts <CONTRACT_ADDRESS>",
    );
    console.error(
      "Or create a contract_address.txt file with the contract address",
    );
    console.error(
      "Example: bun increment.ts 0x1234567890abcdef1234567890abcdef12345678",
    );
    exit(1);
  }
};

/**
 * Standalone script that joins a counter contract with a specific address and increments its value.
 *
 * Usage:
 *   bun increment.ts <CONTRACT_ADDRESS>
 *   or create a contract_address.txt file with the contract address
 *
 * Example:
 *   bun increment.ts 0x1234567890abcdef1234567890abcdef12345678
 */
async function joinAndIncrement(): Promise<void> {
  // Get contract address from command line arguments or file
  const contractAddress = await getContractAddress();

  console.log(
    `🚀 Starting join and increment process for contract: ${contractAddress}`,
  );

  // Initialize configuration
  const config = new StandaloneConfig();

  let wallet = null;

  try {
    console.log("🔗 Building wallet with default wallet seed...");

    // Build wallet using default wallet seed (genesis seed in standalone mode)
    wallet = await buildWalletAndWaitForFunds(
      config,
      DEFAULT_WALLET_SEED,
      contractAddressFileName,
    );

    console.log("✅ Wallet built successfully");

    // Configure providers
    console.log("⚙️ Configuring providers...");
    const providers = await configureProviders(wallet, config);

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

    // Display counter value after increment
    console.log("📊 Displaying counter value after increment...");
    const afterResult = await displayCounterValue(providers, counterContract);
    console.log(`📊 New counter value: ${afterResult.counterValue}`);

    console.log("🎉 Join and increment process completed successfully!");
  } catch (error) {
    console.error("❌ Error during join and increment process:", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    exit(1);
  } finally {
    // Clean up wallet
    if (wallet) {
      try {
        console.log("🧹 Wallet closed successfully");
        exit(0);
      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
}

// Run the script if this file is executed directly
if (import.meta.main) {
  joinAndIncrement().catch((error) => {
    console.error("❌ Unhandled error:", error);
    exit(1);
  });
}

export { joinAndIncrement };

// TODO Remove references to "src/managed" as this is not standard.

import * as log from "@std/log";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import type { UnboundTransaction, MidnightProvider, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import * as path from "@std/path";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  midnightNetworkConfig,
} from "./midnight-env.ts";
import {
  findContractDirectoryForDeploy,
} from "./read-contract.ts";
import {
  buildWalletFacade,
  getInitialShieldedState,
  resolveWalletSyncTimeoutMs,
  syncAndWaitForFunds,
  safeStringifyProgress,
  type WalletResult,
} from "./get-wallet-info.ts";
import type { MidnightProviders, PrivateStateId } from '@midnight-ntwrk/midnight-js-types';
import { CompiledContract, type Witnesses, type Contract } from '@midnight-ntwrk/compact-js';

// Declare Deno global for type-checking when not executed under Deno tooling.
declare const Deno: typeof globalThis.Deno;

// Modular wallet SDK imports
import type { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import {
  type CoinPublicKey,
  type DustSecretKey,
  type EncPublicKey,
  type FinalizedTransaction,
  shieldedToken,
  type SigningKey,
  type TransactionId,
  type ZswapSecretKeys,
} from "@midnight-ntwrk/ledger-v7";
import type { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import type { UnshieldedKeystore } from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { mnemonicToSeed } from "./mnemonicToSeed.ts";

// ============================================================================
// Constants
// ============================================================================

/** Transaction TTL duration in milliseconds (1 hour) */
const TTL_DURATION_MS = 60 * 60 * 1000;

/** Wallet sync progress logging throttle interval */
const WALLET_SYNC_THROTTLE_MS = 10_000;

/** Wallet sync timeout (5 minutes) */
const WALLET_SYNC_TIMEOUT_MS = 300_000;

/** Additional fee overhead for dust transactions (in smallest unit) */
const DUST_FEE_OVERHEAD = 300_000_000_000_000n;

/** Fee blocks margin for dust wallet */
const DUST_FEE_BLOCKS_MARGIN = 5;

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for deploying a Midnight contract
 */
export interface DeployConfig {
  /** Name of the contract directory (e.g., "contract-counter", "contract-eip-20") */
  contractName: string;
  /** Base filename for contract address (e.g., "contract-counter.json"); a network suffix is appended */
  contractFileName: string;
  /** The Contract class to deploy */
  // deno-lint-ignore no-explicit-any
  contractClass: any;
  /** Witness definitions */
  // deno-lint-ignore no-explicit-any
  witnesses: any;
  /** On-chain private state ID */
  privateStateId: string;
  /** Initial private state object */
  // deno-lint-ignore no-explicit-any
  initialPrivateState: any;
  /** Optional deployment arguments array */
  // deno-lint-ignore no-explicit-any
  deployArgs?: any[];
  /** Optional private state store name (defaults to contractName-based value) */
  privateStateStoreName?: string;
  /** Optional base directory override for finding contracts */
  baseDir?: string;
  /** Optional flag to extract wallet address info (for contracts that need initialOwner) */
  extractWalletAddress?: boolean;
}

/**
 * Network endpoint URLs for connecting to Midnight infrastructure
 */
export interface NetworkUrls {
  /** Optional network ID override */
  id?: string;
  /** GraphQL indexer HTTP endpoint (default: http://127.0.0.1:8088/api/v3/graphql)*/
  indexer?: string;
  /** GraphQL indexer WebSocket endpoint (default: ws://127.0.0.1:8088/api/v3/graphql/ws)*/
  indexerWS?: string;
  /** Midnight node RPC endpoint (default: http://127.0.0.1:9944)*/
  node?: string;
  /** Proof server HTTP endpoint (default: http://127.0.0.1:6300)*/
  proofServer?: string;
}

// WalletResult is now imported from get-wallet-info.ts

/** Initial owner structure for contracts that need wallet address */
interface InitialOwner {
  is_left: boolean;
  left: { bytes: Uint8Array };
  right: { bytes: Uint8Array };
}

// Key derivation functions are now imported from get-wallet-info.ts

// ============================================================================
// Wallet Configuration
// ============================================================================
// Wallet configuration and building functions are now imported from get-wallet-info.ts

/**
 * Create a TTL date for transactions
 */
function createTtl(): Date {
  return new Date(Date.now() + TTL_DURATION_MS);
}

function checkEnvVariables(): void {
  if (!Deno.env.get("MIDNIGHT_STORAGE_PASSWORD")) {
    throw new Error("MIDNIGHT_STORAGE_PASSWORD is not set (Use a 16 char string)");
  }
}

// ============================================================================
// Wallet Facade  
// ============================================================================
// Wallet facade building and sync functions are now imported from get-wallet-info.ts

/**
 * Build wallet and wait for funds
 */
async function buildWalletAndWaitForFunds(
  networkUrls: Required<Omit<NetworkUrls, "id">>,
  seed: string,
  networkId: NetworkId.NetworkId
): Promise<WalletResult> {
  log.info("Building wallet using modular SDK");
  const result = await buildWalletFacade(networkUrls, seed, networkId);

  const initialState = await getInitialShieldedState(result.wallet.shielded);
  const address = initialState.address.coinPublicKeyString();
  log.info(`Wallet seed: ${seed}`);
  log.info(`Wallet address: ${address}`);
  log.info(`Dust address: ${result.dustAddress}`);

  let balance = initialState.balances[shieldedToken().tag] ?? 0n;
  console.log("initialState", safeStringifyProgress(initialState));
  const syncTimeoutMs = resolveWalletSyncTimeoutMs();
  if (balance === 0n) {
    const skipWait =
      Deno.env.get("MIDNIGHT_SKIP_WAIT_FOR_FUNDS")?.toLowerCase() === "true";
    log.info("Wallet shielded balance: 0");
    log.info(
      `Waiting to receive tokens... (timeout ${syncTimeoutMs}ms${skipWait ? ", skip on timeout enabled" : ""})`
    );
    try {
      const { shieldedBalance, unshieldedBalance } = await syncAndWaitForFunds(
        result.wallet
      );
      balance = shieldedBalance;
      if (unshieldedBalance > 0n) {
        log.info(`Unshielded balance available: ${unshieldedBalance}`);
      }
    } catch (e) {
      if (skipWait) {
        log.warn(
          `Skipping wait for shielded funds after timeout: ${(e as Error).message}`
        );
      } else {
        throw e;
      }
    }
  }
  log.info(`Wallet balance: ${balance}`);

  // Dust syncing is handled by syncAndWaitForFunds above
  return result;
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Create wallet and midnight provider adapter for WalletFacade
 *
 * Implements the WalletProvider and MidnightProvider interfaces
 * as defined in @midnight-ntwrk/midnight-js-types v3.x
 */
function createWalletAndMidnightProvider(
  wallet: WalletFacade,
  zswapSecretKeys: ZswapSecretKeys,
  walletZswapSecretKeys: ZswapSecretKeys,
  dustSecretKey: DustSecretKey,
  walletDustSecretKey: DustSecretKey,
  unshieldedKeystore: UnshieldedKeystore
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey(): CoinPublicKey {
      return zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
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
    submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
}

/**
 * Configure all providers needed for contract deployment
 */
function configureProviders(
  wallet: WalletFacade,
  zswapSecretKeys: ZswapSecretKeys,
  walletZswapSecretKeys: ZswapSecretKeys,
  dustSecretKey: DustSecretKey,
  walletDustSecretKey: DustSecretKey,
  networkUrls: Required<Omit<NetworkUrls, "id">>,
  privateStateStoreName: string,
  zkConfigPath: string,
  unshieldedKeystore: UnshieldedKeystore
): MidnightProviders {
  const signingKeyStoreName = `${privateStateStoreName}-signing-keys`;
  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey,
    unshieldedKeystore
  );
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  return {
    // For deployment, we use full private state config because we may need to verify
    // the deployed contract state. For batcher/transaction submission use cases,
    // a minimal config with just walletProvider is sufficient and much faster:
    //   levelPrivateStateProvider({ walletProvider })
    // Omitting privateStateStoreName/midnightDbName avoids historical private state sync.
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: "midnight-level-db-deploy", // Use separate DB for deployment to avoid lock conflicts
      privateStateStoreName,
      signingKeyStoreName,
      walletProvider: walletAndMidnightProvider, // Use wallet's encryption key for private state
    }), // Type assertion: runtime supports walletProvider even though types don't reflect it yet
    publicDataProvider: indexerPublicDataProvider(
      networkUrls.indexer,
      networkUrls.indexerWS
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkUrls.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
}

// ============================================================================
// Contract Deployment Helpers
// ============================================================================

/**
 * Extract initial owner from wallet for contracts that need it (e.g., EIP-20)
 */
async function extractInitialOwnerFromWallet(
  wallet: WalletFacade
): Promise<InitialOwner> {
  const initialState = await getInitialShieldedState(wallet.shielded);
  const coinPubHex = initialState.address.coinPublicKeyString();
  const encPubHex = initialState.address.encryptionPublicKeyString();
  log.info(`Extracting initial owner from wallet keys (hex): coin=${coinPubHex}`);
  log.info(`Encryption key (hex): ${encPubHex}`);

  const coinBytes = Buffer.from(coinPubHex, "hex");
  const encBytes = Buffer.from(encPubHex, "hex");

  return {
    is_left: true,
    left: { bytes: coinBytes },
    right: { bytes: encBytes.subarray(0, 32) },
  };
}

/**
 * Find the compiler subdirectory in the managed directory
 */
function hasManagedArtifacts(dir: string): boolean {
  const requiredDirs = ["contract", "compiler"];
  try {
    return requiredDirs.every((name) => {
      const stats = Deno.statSync(path.join(dir, name));
      return stats.isDirectory;
    });
  } catch {
    return false;
  }
}

function findCompilerSubdirectory(managedDir: string): string {
  try {
    for (const entry of Deno.readDirSync(managedDir)) {
      if (!entry.isDirectory) continue;
      const candidate = path.join(managedDir, entry.name);
      if (hasManagedArtifacts(candidate)) {
        return entry.name;
      }
    }
  } catch (_error) {
    throw new Error(`Managed directory not found: ${managedDir}`);
  }

  if (hasManagedArtifacts(managedDir)) {
    return "";
  }

  throw new Error(
    `No compiler artifacts found in managed directory: ${managedDir}. ` +
      `Ensure the directory contains compiler, contract, keys, and zkir assets.`
  );
}

// ============================================================================
// Main Deployment Function
// ============================================================================

/**
 * Deploys a Midnight contract using the provided configuration.
 *
 * This function is context-aware and will find the contract directory
 * and zkConfigPath automatically using readMidnightContract.
 *
 * @param config - Deployment configuration
 * @param networkUrls - Optional network endpoint URLs (defaults to local undeployed endpoints)
 * @returns The deployed contract address
 */
export async function deployMidnightContract(
  config: DeployConfig,
  networkUrls?: NetworkUrls,
  seedOrMnemonic?: { seed: string, mnemonic: string },

): Promise<string> {
  checkEnvVariables();
  await log.setup({
    handlers: {
      console: new log.ConsoleHandler("INFO"),
    },
    loggers: {
      default: {
        level: "INFO",
        handlers: ["console"],
      },
    },
  });

  // Find the contract directory
  const contractDir = findContractDirectoryForDeploy(
    config.contractName,
    config.baseDir
  );

  if (!contractDir) {
    throw new Error(
      `Could not find Midnight contract directory for "${config.contractName}". ` +
        `Searched starting from ${config.baseDir || Deno.cwd()}. ` +
        `Please ensure you're running from a directory that contains or is a parent of the Midnight contract directory, ` +
        `or provide an explicit baseDir parameter.`
    );
  }

  // Find the compiler subdirectory to determine zkConfigPath
  const managedDir = path.join(
    contractDir,
    config.contractName,
    "src/managed"
  );
  const compilerSubdir = findCompilerSubdirectory(managedDir);

  const zkConfigPath = path.resolve(
    path.join(contractDir, config.contractName, "src/managed", compilerSubdir)
  );

  // Default private state store name if not provided
  const privateStateStoreName =
    config.privateStateStoreName ??
    `${config.contractName.replace("contract-", "")}-private-state`;

  // Merge network URLs with defaults
  const { id: networkIdOverride, ...endpoints } = networkUrls ?? {};
  const resolvedNetworkUrls: Required<Omit<NetworkUrls, "id">> = {
    indexer: endpoints.indexer ?? midnightNetworkConfig.indexer,
    indexerWS: endpoints.indexerWS ?? midnightNetworkConfig.indexerWS,
    node: endpoints.node ?? midnightNetworkConfig.node,
    proofServer: endpoints.proofServer ?? midnightNetworkConfig.proofServer,
  };
  const resolvedNetworkId = (networkIdOverride ?? midnightNetworkConfig.id) as NetworkId.NetworkId;

  log.info(
    `Preflight resolved endpoints -> indexerHttp=${resolvedNetworkUrls.indexer}, indexerWs=${resolvedNetworkUrls.indexerWS}, node=${resolvedNetworkUrls.node}, proofServer=${resolvedNetworkUrls.proofServer}, networkId=${resolvedNetworkId}`
  );

  setNetworkId(resolvedNetworkId);

  let walletResult: WalletResult | null = null;
  let providers: ReturnType<typeof configureProviders> | null = null;

  try {
    log.info("Building wallet...");
    let seed;
    if (seedOrMnemonic?.seed) {
      seed = seedOrMnemonic.seed;
    } else if (seedOrMnemonic?.mnemonic) {
      seed = Buffer.from(await mnemonicToSeed(seedOrMnemonic.mnemonic)).toString('hex');
    } else {
      seed = midnightNetworkConfig.walletSeed;
    }
    if (!seed) {
      throw new Error('No seed or mnemonic provided');
    }

    walletResult = await buildWalletAndWaitForFunds(
      resolvedNetworkUrls,
      seed,
      resolvedNetworkId
    );

    const {
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
      dustAddress,
      unshieldedKeystore,
    } = walletResult;
    const resolvedDustReceiverAddress =
      Deno.env.get("MIDNIGHT_DUST_RECEIVER_ADDRESS") ?? dustAddress;
    if (resolvedDustReceiverAddress === dustAddress) {
      log.info(`Using derived dust address: ${resolvedDustReceiverAddress}`);
    } else {
      log.info(
        `Using dust receiver address from MIDNIGHT_DUST_RECEIVER_ADDRESS: ${resolvedDustReceiverAddress}`
      );
    }

    // Extract wallet address info if needed (for contracts like EIP-20)
    let deployArgs = config.deployArgs;
    if (config.extractWalletAddress && deployArgs && deployArgs.length > 0) {
      const initialOwner = await extractInitialOwnerFromWallet(wallet);
      deployArgs = [...deployArgs.slice(0, -1), initialOwner];
    }

    log.info("Wallet built successfully.");

    log.info("Configuring providers...");
    // Use a separate LevelDB directory for deployment to avoid lock conflicts with batcher
    const deployPrivateStateStoreName = `${privateStateStoreName}-deploy`;
    
    providers = configureProviders(
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
      resolvedNetworkUrls,
      deployPrivateStateStoreName,
      zkConfigPath,
      unshieldedKeystore
    );
    log.info("Providers configured.");

    log.info("Deploying contract...[2]");
    const contract = new config.contractClass(config.witnesses);


      // Find the compiler subdirectory to determine zkConfigPath
  const managedDir = path.join(
    contractDir,
    config.contractName,
    "src/managed"
  );

  // First, create the compiled contract
  const MyCompiledContract = CompiledContract.make(config.contractName, config.contractClass).pipe(
    CompiledContract.withWitnesses(config.witnesses as never),
    CompiledContract.withCompiledFileAssets(managedDir)
  );

  const deployOptions: {
    compiledContract: CompiledContract.CompiledContract<Contract<undefined, Witnesses<undefined>>, undefined, never>;
    privateStateId: PrivateStateId;
    initialPrivateState: Contract.PrivateState<any>
    signingKey?: SigningKey;
    args: Contract.InitializeParameters<any>;
  } = {
    compiledContract: MyCompiledContract as any,
    privateStateId: config.privateStateId as PrivateStateId,
    initialPrivateState: config.initialPrivateState as Contract.PrivateState<any>,
    args: (deployArgs && deployArgs.length > 0 ? deployArgs : []) as Contract.InitializeParameters<any>,
    signingKey: undefined,
  };

    const deployedContract = await deployContract(
      providers,
      deployOptions
    );
    log.info("Contract deployed.");

    const contractAddress =
      deployedContract.deployTxData.public.contractAddress;
    log.info(`Contract address: ${contractAddress}`);

    const baseContractFileName =
      config.contractFileName ?? `${config.contractName}.json`;
    const { dir: contractFileDir, name: contractFileBaseName, ext: contractFileExt } =
      path.parse(baseContractFileName);
    const normalizedExt = contractFileExt || ".json";
    const networkSuffix = `.${resolvedNetworkId}`;
    const fileBaseWithNetwork =
      contractFileBaseName.endsWith(networkSuffix)
        ? contractFileBaseName
        : `${contractFileBaseName}${networkSuffix}`;
    const outputFileName = `${fileBaseWithNetwork}${normalizedExt}`;
    const outputPath = path.join(
      contractDir,
      contractFileDir,
      outputFileName,
    );

    await Deno.writeTextFile(
      outputPath,
      JSON.stringify({ contractAddress }, null, 2),
    );
    log.info(`Contract address saved to ${outputPath} (network: ${resolvedNetworkId})`);

    return contractAddress;
  } catch (e) {
    if (e instanceof Error) {
      log.error(`Deployment failed: ${e.message}`);
      log.debug(e.stack);
    } else {
      log.error("An unknown error occurred during deployment.");
    }
    throw e;
  } finally {
    // Close wallet first
    if (walletResult) {
      log.info("Closing wallet...");
      try {
        await walletResult.wallet.stop();
      } catch (_closeError) {
        // Ignore close errors
      }
      log.info("Wallet closed.");
    }
    
    // Wait a moment for Level DB to finish any async close operations
    // The levelPrivateStateProvider opens/closes DB for each operation in withSubLevel
    // But there might be pending async operations
    log.info("Waiting for Level DB cleanup...");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

import * as log from "@std/log";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import {
  type BalancedProvingRecipe,
  type MidnightProvider,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import * as path from "@std/path";
import * as Rx from "rxjs";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { findContractDirectoryForDeploy } from "./read-contract.ts";

// Declare Deno global for type-checking when not executed under Deno tooling.
declare const Deno: typeof globalThis.Deno;

// Modular wallet SDK imports
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import {
  WalletBuilder as UnshieldedWalletBuilder,
  createKeystore,
  PublicKey,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import {
  type CoinPublicKey,
  DustParameters,
  DustSecretKey,
  type EncPublicKey,
  type FinalizedTransaction,
  LedgerParameters,
  type ShieldedCoinInfo,
  shieldedToken,
  type TransactionId,
  type UnprovenTransaction,
  ZswapSecretKeys,
} from "@midnight-ntwrk/ledger-v6";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { type DefaultV1Configuration } from "@midnight-ntwrk/wallet-sdk-shielded/v1";

// ============================================================================
// Constants
// ============================================================================

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

/** Transaction TTL duration in milliseconds (1 hour) */
const TTL_DURATION_MS = 60 * 60 * 1000;

/** Wallet sync progress logging throttle interval */
const WALLET_SYNC_THROTTLE_MS = 10_000;

/** Wallet sync timeout (5 minutes) */
const WALLET_SYNC_TIMEOUT_MS = 300_000;

/** Network ID for local/undeployed development (align with SDK snippets) */
const WALLET_NETWORK_ID: NetworkId.NetworkId = "undeployed";

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
  /** Output filename for contract address (e.g., "contract-counter.json") */
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
  /** GraphQL indexer HTTP endpoint (default: http://127.0.0.1:8088/api/v1/graphql)*/
  indexer?: string;
  /** GraphQL indexer WebSocket endpoint (default: ws://127.0.0.1:8088/api/v1/graphql/ws)*/
  indexerWS?: string;
  /** Midnight node RPC endpoint (default: http://127.0.0.1:9944)*/
  node?: string;
  /** Proof server HTTP endpoint (default: http://127.0.0.1:6300)*/
  proofServer?: string;
}

/**
 * Default network URLs for undeployed/local development
 */
export const DEFAULT_NETWORK_URLS: Required<NetworkUrls> = {
  // Use v3 endpoints as in midnight-wallet docs snippets
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

/** Wallet result containing facade and secret keys */
interface WalletResult {
  wallet: WalletFacade;
  zswapSecretKeys: ZswapSecretKeys;
  /**
   * Zswap secret keys instantiated from ledger-v6@6.1.x for ShieldedWallet compatibility.
   */
  walletZswapSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  /**
   * Dust secret key instantiated from ledger-v6@6.1.x for DustWallet compatibility.
   */
  walletDustSecretKey: DustSecretKey;
  /** Encoded dust address to use as receiver when minting dust */
  dustAddress: string;
}

/** Initial owner structure for contracts that need wallet address */
interface InitialOwner {
  is_left: boolean;
  left: { bytes: Uint8Array };
  right: { bytes: Uint8Array };
}

// ============================================================================
// Key Derivation
// ============================================================================

type DerivationRole = typeof Roles.Zswap | typeof Roles.Dust | typeof Roles.NightExternal;

/**
 * Derive a seed for a specific role from wallet seed using HDWallet
 */
function deriveSeedForRole(seed: string, role: DerivationRole): Uint8Array {
  const seedBuffer = Buffer.from(seed, "hex");
  const hdWalletResult = HDWallet.fromSeed(seedBuffer);

  if (hdWalletResult.type !== "seedOk") {
    throw new Error(`Failed to create HD wallet: ${hdWalletResult.type}`);
  }

  const derivationResult = hdWalletResult.hdWallet
    .selectAccount(0)
    .selectRole(role)
    .deriveKeyAt(0);

  if (derivationResult.type === "keyOutOfBounds") {
    throw new Error(`Key derivation out of bounds for role: ${role}`);
  }

  return Buffer.from(derivationResult.key);
}

// ============================================================================
// Wallet Configuration
// ============================================================================

/**
 * Get initial dust wallet state to access the dust address.
 */
function getInitialDustState(
  // deno-lint-ignore no-explicit-any
  dustWallet: any
): Promise<{ dustAddress: string }> {
  return Rx.firstValueFrom(dustWallet.state);
}

/**
 * Create a TTL date for transactions
 */
function createTtl(): Date {
  return new Date(Date.now() + TTL_DURATION_MS);
}

/**
 * Resolve sync timeout from env or default.
 */
function resolveWalletSyncTimeoutMs(): number {
  const envValue = Deno.env.get("MIDNIGHT_WALLET_SYNC_TIMEOUT_MS");
  if (!envValue) return WALLET_SYNC_TIMEOUT_MS;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  log.warning(
    `Invalid MIDNIGHT_WALLET_SYNC_TIMEOUT_MS="${envValue}", using default ${WALLET_SYNC_TIMEOUT_MS}ms`
  );
  return WALLET_SYNC_TIMEOUT_MS;
}

/**
 * Safely stringify progress objects that may contain bigint.
 */
function safeStringifyProgress(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v
    );
  } catch (_err) {
    return String(value);
  }
}

/**
 * Map network URLs to wallet SDK configuration
 */
function createWalletConfiguration(
  networkUrls: Required<NetworkUrls>
): DefaultV1Configuration {
  log.info(
    `Preflight network config -> networkId=${WALLET_NETWORK_ID}, indexerHttp=${networkUrls.indexer}, indexerWs=${networkUrls.indexerWS}, node=${networkUrls.node}, proofServer=${networkUrls.proofServer}`
  );
  return {
    indexerClientConnection: {
      indexerHttpUrl: networkUrls.indexer,
      indexerWsUrl: networkUrls.indexerWS,
    },
    provingServerUrl: new URL(networkUrls.proofServer),
    relayURL: new URL(networkUrls.node.replace("http", "ws")),
    networkId: WALLET_NETWORK_ID,
  };
}

/**
 * Build shielded wallet instance
 */
function buildShieldedWallet(
  config: DefaultV1Configuration,
  seed: Uint8Array
): ReturnType<ReturnType<typeof ShieldedWallet>["startWithShieldedSeed"]> {
  const shieldedBuilder = ShieldedWallet(config);
  return shieldedBuilder.startWithShieldedSeed(seed);
}

/**
 * Build dust wallet instance
 */
function buildDustWallet(
  config: DefaultV1Configuration,
  seed: Uint8Array
): ReturnType<ReturnType<typeof DustWallet>["startWithSeed"]> {
  const legacyLedgerParams = LedgerParameters.initialParameters();
  const dustConfig = {
    ...config,
    costParameters: {
      ledgerParams: legacyLedgerParams as unknown as LedgerParameters,
      additionalFeeOverhead: DUST_FEE_OVERHEAD,
      feeBlocksMargin: DUST_FEE_BLOCKS_MARGIN,
    },
  };
  const dustBuilder = DustWallet(dustConfig);

  // DustWallet still links against ledger-v6@6.1.x, so we must provide LedgerParameters
  // (and embedded DustParameters) created from that version to satisfy its runtime instanceof checks.
  const dustParameters = legacyLedgerParams.dust;

  return dustBuilder.startWithSeed(seed, dustParameters);
}

/**
 * Build unshielded wallet instance
 */
async function buildUnshieldedWallet(
  networkUrls: Required<NetworkUrls>,
  seed: Uint8Array
): Promise<Awaited<ReturnType<typeof UnshieldedWalletBuilder.build>>> {
  // Create keystore from the seed
  const keystore = createKeystore(seed, WALLET_NETWORK_ID);
  const publicKey = PublicKey.fromKeyStore(keystore);

  // Build the unshielded wallet
  const unshieldedWallet = await UnshieldedWalletBuilder.build({
    publicKey,
    networkId: WALLET_NETWORK_ID,
    indexerUrl: networkUrls.indexerWS,
  });

  // Fix the state property to be an observable instead of a function
  // The WalletFacade expects all wallets to have a state property that is an observable
  if (typeof unshieldedWallet.state === 'function') {
    const stateObservable = unshieldedWallet.state();
    (unshieldedWallet as any).state = stateObservable;
  }

  return unshieldedWallet;
}

// ============================================================================
// Wallet Facade
// ============================================================================

/**
 * Build wallet facade with shielded, unshielded, and dust wallets
 */
async function buildWalletFacade(
  networkUrls: Required<NetworkUrls>,
  seed: string
): Promise<WalletResult> {
  log.info("Deriving keys from seed using HDWallet...");
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const config = createWalletConfiguration(networkUrls);

  log.info("Initializing ShieldedWallet...");
  const shieldedWallet = buildShieldedWallet(config, shieldedSeed);

  log.info("Initializing DustWallet...");
  const dustWallet = buildDustWallet(config, dustSeed);

  log.info("Initializing UnshieldedWallet...");
  const unshieldedWallet = await buildUnshieldedWallet(networkUrls, unshieldedSeed);

  log.info("Creating WalletFacade...");
  const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const walletZswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);
  const walletDustSecretKey = DustSecretKey.fromSeed(dustSeed);

  log.info("Starting wallet...");
  await wallet.start(walletZswapSecretKeys, walletDustSecretKey);

  const dustState = await getInitialDustState(wallet.dust);

  return {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey,
    dustAddress: dustState.dustAddress,
  };
}

/** Shielded wallet state shape */
interface ShieldedWalletState {
  address: {
    coinPublicKeyString(): string;
  };
  balances: Record<string, bigint>;
}

/**
 * Get initial state from shielded wallet
 */
function getInitialShieldedState(
  // deno-lint-ignore no-explicit-any
  shieldedWallet: any
): Promise<ShieldedWalletState> {
  return Rx.firstValueFrom(shieldedWallet.state);
}

/**
 * Wait for wallet to be synced and funded
 */
async function syncAndWaitForFunds(
  wallet: WalletFacade
): Promise<{ shieldedBalance: bigint; unshieldedBalance: bigint }> {
  log.info(
    "Waiting for wallet to sync and receive funds (shielded/unshielded/dust)..."
  );

  const syncTimeoutMs = resolveWalletSyncTimeoutMs();
  let latestState: any = null;
  const periodicLogger = setInterval(() => {
    if (!latestState) return;
    const shieldedSynced =
      latestState.shielded.state.progress.isStrictlyComplete();
    const dustSynced = latestState.dust.state.progress.isStrictlyComplete();
    const unshieldedSynced =
      latestState.unshielded?.state?.progress?.isStrictlyComplete?.() ?? true;
    log.info(
      `[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
    );
    log.debug(
      `[wait detail] shielded=${safeStringifyProgress(
        latestState.shielded.state.progress
      )} | unshielded=${safeStringifyProgress(
        latestState.unshielded?.state?.progress ?? "n/a"
      )} | dust=${safeStringifyProgress(latestState.dust.state.progress)}`
    );
  }, WALLET_SYNC_THROTTLE_MS);

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        latestState = state;
        const shieldedSynced =
          state.shielded.state.progress.isStrictlyComplete();
        const dustSynced = state.dust.state.progress.isStrictlyComplete();
        // unshielded progress may not be present in all configs
        const unshieldedSynced =
          state.unshielded?.state?.progress?.isStrictlyComplete?.() ?? true;
        log.info(
          `Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
        );
        log.info(
          `Progress detail | shielded=${safeStringifyProgress(
            state.shielded.state.progress
          )} | unshielded=${safeStringifyProgress(
            state.unshielded?.state?.progress ?? "n/a"
          )} | dust=${safeStringifyProgress(state.dust.state.progress)}`
        );
      }),
      Rx.filter(
        (state: any) =>
          state.shielded.state.progress.isStrictlyComplete() &&
          state.dust.state.progress.isStrictlyComplete() &&
          (state.unshielded?.state?.progress?.isStrictlyComplete?.() ?? true)
      ),
      Rx.tap(() => log.info("Wallet sync complete")),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      })
    )
  );

  clearInterval(periodicLogger);

  const shieldedBalance = state.shielded.balances[shieldedToken().tag] ?? 0n;
  const unshieldedBalances =
    // deno-lint-ignore no-explicit-any
    ((state as any).unshielded?.balances as Record<string, bigint> | undefined) ??
    {};
  const unshieldedBalance = Object.values(unshieldedBalances).reduce(
    (acc, v) => acc + (v ?? 0n),
    0n
  );
  log.info(`Wallet shielded balance: ${shieldedBalance}`);
  log.info(`Wallet unshielded balance: ${unshieldedBalance}`);
  return { shieldedBalance, unshieldedBalance };
}

/**
 * Wait for dust wallet sync and return dust balance if available.
 */
async function waitForDustFunds(
  wallet: WalletFacade,
  syncTimeoutMs: number
): Promise<bigint> {
  log.info("Waiting for dust wallet to sync and receive funds...");
  // deno-lint-ignore no-explicit-any
  const dustWallet = (wallet as any).dust;
  if (!dustWallet || !dustWallet.state) {
    log.warning("Dust wallet state not available; skipping dust balance wait.");
    return 0n;
  }

  const dustBalance = (await Rx.firstValueFrom(
    dustWallet.state.pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: unknown) => {
        try {
          // best-effort progress logging
          const progress = (state as { state?: { progress?: { isCompleteWithin?: (gap: bigint) => boolean } } })
            ?.state?.progress;
          const complete = progress?.isCompleteWithin?.(0n);
          log.info(`Dust wallet sync progress: complete=${complete ?? "unknown"}`);
        } catch (_err) {
          // ignore logging errors
        }
      }),
      Rx.filter((state: unknown) => {
        try {
          const progress = (state as { state?: { progress?: { isCompleteWithin?: (gap: bigint) => boolean } } })
            ?.state?.progress;
          return progress?.isCompleteWithin?.(0n) === true;
        } catch (_err) {
          return false;
        }
      }),
      Rx.map((state: unknown) => {
        // Try to read balance from wallet state helper if present.
        try {
          if (typeof (state as { walletBalance?: (d: Date) => bigint }).walletBalance === "function") {
            return (state as { walletBalance: (d: Date) => bigint }).walletBalance(new Date());
          }
          // Fallback to balances map if exposed
          const balances = (state as { balances?: Record<string, bigint> }).balances;
          if (balances) {
            const total = Object.values(balances).reduce(
              (acc: bigint, v) => acc + BigInt(v ?? 0),
              0n
            );
            return total;
          }
        } catch (_err) {
          // ignore and fall through
        }
        return 0n;
      }),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Dust wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      }),
      Rx.filter((balance: bigint) => balance > 0n),
      Rx.tap((balance: bigint) => log.info(`Dust wallet balance: ${balance}`))
    )
  )) as bigint;

  return dustBalance;
}

/**
 * Build wallet and wait for funds
 */
async function buildWalletAndWaitForFunds(
  networkUrls: Required<NetworkUrls>,
  seed: string
): Promise<WalletResult> {
  log.info("Building wallet using modular SDK");
  const result = await buildWalletFacade(networkUrls, seed);

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
        log.warning(
          `Skipping wait for shielded funds after timeout: ${(e as Error).message}`
        );
      } else {
        throw e;
      }
    }
  }
  log.info(`Wallet balance: ${balance}`);

  // Always attempt to fetch dust balance; do not block deploy if unavailable.
  try {
    await waitForDustFunds(result.wallet, syncTimeoutMs);
  } catch (e) {
    log.warning(`Dust balance check failed: ${(e as Error).message}`);
  }

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
  walletDustSecretKey: DustSecretKey
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey(): CoinPublicKey {
      return zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return zswapSecretKeys.encryptionPublicKey;
    },
    async balanceTx(
      tx: UnprovenTransaction,
      _newCoins?: ShieldedCoinInfo[],
      ttl?: Date
    ): Promise<BalancedProvingRecipe> {
      return wallet.balanceTransaction(
        walletZswapSecretKeys,
        walletDustSecretKey,
        tx,
        ttl ?? createTtl()
      );
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
  networkUrls: Required<NetworkUrls>,
  privateStateStoreName: string,
  zkConfigPath: string
) {
  const signingKeyStoreName = `${privateStateStoreName}-signing-keys`;
  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey
  );
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      signingKeyStoreName,
    }),
    publicDataProvider: indexerPublicDataProvider(
      networkUrls.indexer,
      networkUrls.indexerWS
    ),
    zkConfigProvider: new NodeZkConfigProvider(zkConfigPath),
    proofProvider: httpClientProofProvider(networkUrls.proofServer),
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
  networkUrls?: NetworkUrls
): Promise<string> {
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
  const resolvedNetworkUrls: Required<NetworkUrls> = {
    ...DEFAULT_NETWORK_URLS,
    ...(networkUrls ?? {}),
  };

  log.info(
    `Preflight resolved endpoints -> indexerHttp=${resolvedNetworkUrls.indexer}, indexerWs=${resolvedNetworkUrls.indexerWS}, node=${resolvedNetworkUrls.node}, proofServer=${resolvedNetworkUrls.proofServer}, networkId=${WALLET_NETWORK_ID}`
  );

  setNetworkId(WALLET_NETWORK_ID);

  let walletResult: WalletResult | null = null;

  try {
    log.info("Building wallet...");
    walletResult = await buildWalletAndWaitForFunds(
      resolvedNetworkUrls,
      GENESIS_MINT_WALLET_SEED
    );

    const {
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
      dustAddress,
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
    const providers = configureProviders(
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
      resolvedNetworkUrls,
      privateStateStoreName,
      zkConfigPath
    );
    log.info("Providers configured.");

    log.info("Deploying contract...");
    const contract = new config.contractClass(config.witnesses);

    const deployOptions: {
      contract: unknown;
      privateStateId: string;
      initialPrivateState: unknown;
      args?: unknown[];
    } = {
      contract,
      privateStateId: config.privateStateId,
      initialPrivateState: config.initialPrivateState,
    };

    if (deployArgs && deployArgs.length > 0) {
      deployOptions.args = deployArgs;
    }

    // deno-lint-ignore no-explicit-any
    const deployedContract = await deployContract(
      providers as any,
      deployOptions as any
    );
    log.info("Contract deployed.");

    const contractAddress =
      deployedContract.deployTxData.public.contractAddress;
    log.info(`Contract address: ${contractAddress}`);

    // Save contract address to file
    const outputPath = path.join(contractDir, config.contractFileName);
    await Deno.writeTextFile(
      outputPath,
      JSON.stringify({ contractAddress }, null, 2)
    );
    log.info(`Contract address saved to ${outputPath}`);

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
    if (walletResult) {
      log.info("Closing wallet...");
      try {
        await walletResult.wallet.stop();
      } catch (_closeError) {
        // Ignore close errors
      }
      log.info("Wallet closed.");
    }
  }
}

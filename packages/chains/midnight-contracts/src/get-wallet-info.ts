import dotenv from "dotenv";
import { parseArgs } from "node:util";
// graphql-ws has a dangling promise in its subscribe flow: when a subscription ends,
// the socket closes normally (code 1000) but the internal throwOnClose promise rejects
// with no handler. In Bun, unhandled rejections crash the process (exit 1).
if (globalThis.process?.versions?.bun) {
  process.on('unhandledRejection', (reason: unknown) => {
    if (reason && typeof reason === 'object' && 'type' in reason && (reason as any).type === 'close') {
      return;
    }
    console.error('Unhandled rejection:', reason);
    process.exit(1);
  });
}
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  DustSecretKey,
  LedgerParameters,
  ZswapSecretKeys,
  shieldedToken,
} from "@midnight-ntwrk/ledger-v8";

const log = console;
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { type DefaultConfiguration, WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
  InMemoryTransactionHistoryStorage,
  type UnshieldedKeystore,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { type ShieldedWalletState } from "@midnight-ntwrk/wallet-sdk-shielded";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import * as path from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { CONSTANTS } from "./constants.ts";
import type { NetworkUrls, WalletResult } from "./types.ts";
import { midnightNetworkConfig } from "./midnight-env.ts";
import { getEnv, args as getArgs, exit, isNotFoundError } from "@effectstream/utils/runtime";

// ============================================================================
// Dust State Persistence
// ============================================================================

const DEFAULT_DUST_STATE_DIR = "dust-state";

/**
 * Build the dust state file path from network + seed.
 * Uses first 16 hex chars of the seed as a stable identifier — the seed
 * deterministically maps to a dust address, so this is a unique key per wallet
 * that is available before building the facade.
 */
function getDustStatePath(baseDir: string, networkId: string, seed: string): string {
  const seedKey = seed.slice(0, 16);
  return path.join(baseDir, `${networkId}-${seedKey}.json`);
}

function isUndeployedNetwork(networkId: string): boolean {
  return networkId.toLowerCase() === "undeployed";
}

/**
 * Save serialized dust wallet state to disk.
 * No-ops for "undeployed" networks (chain resets make cached state invalid).
 * @param seed - Wallet seed hex string (used to derive stable file path)
 */
export function saveDustState(
  baseDir: string,
  networkId: string,
  seed: string,
  serializedState: string,
): string | null {
  if (isUndeployedNetwork(networkId)) return null;
  const filePath = getDustStatePath(baseDir, networkId, seed);
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, serializedState, "utf-8");
    log.info(`Dust state saved to ${filePath}`);
    return filePath;
  } catch (e) {
    log.warn(`Failed to save dust state to ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Load previously saved dust wallet state from disk.
 * Always returns null for "undeployed" networks.
 * @param seed - Wallet seed hex string (used to derive stable file path)
 */
export function loadDustState(
  baseDir: string,
  networkId: string,
  seed: string,
): string | null {
  if (isUndeployedNetwork(networkId)) return null;
  const filePath = getDustStatePath(baseDir, networkId, seed);
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

// ============================================================================
// Key Derivation
// ============================================================================

type DerivationRole = typeof Roles.Zswap | typeof Roles.Dust | typeof Roles.NightExternal;

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
 * Resolve sync timeout from env or default.
 */
export function resolveWalletSyncTimeoutMs(): number {
  const envValue = getEnv("MIDNIGHT_WALLET_SYNC_TIMEOUT_MS");
  if (!envValue) return CONSTANTS.WALLET_SYNC_TIMEOUT_MS;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  log.warn(
    `Invalid MIDNIGHT_WALLET_SYNC_TIMEOUT_MS="${envValue}", using default ${CONSTANTS.WALLET_SYNC_TIMEOUT_MS}ms`
  );
  return CONSTANTS.WALLET_SYNC_TIMEOUT_MS;
}

/**
 * Safely stringify progress objects that may contain bigint.
 */
export function safeStringifyProgress(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v
    );
  } catch (_err) {
    return String(value);
  }
}

/**
 * Wait for wallet to be synced and funded
 */
export async function syncAndWaitForFunds(
  wallet: WalletFacade,
  options?: { timeoutMs?: number; waitNonZero?: boolean; skipShielded?: boolean },
): Promise<{ shieldedBalance: bigint; unshieldedBalance: bigint; dustBalance: bigint }> {
  const skipShielded = options?.skipShielded ?? false;
  const syncLabel = skipShielded ? "unshielded/dust" : "shielded/unshielded/dust";
  log.info(
    `Waiting for wallet to sync and receive funds (${syncLabel})...`
  );

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;

  let latestState: any = null;
  const periodicLogger = setInterval(() => {
    if (!latestState) return;
    const shieldedSynced = latestState.shielded.state.progress.isStrictlyComplete();
    const dustSynced = latestState.dust.state.progress.isStrictlyComplete();
    const unshieldedSynced = latestState.unshielded?.progress?.isStrictlyComplete() ?? false;
    log.info(
      `[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
    );
  }, CONSTANTS.WALLET_SYNC_THROTTLE_MS);
  const syncStartedAt = Date.now();

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        const elapsedSec = ((Date.now() - syncStartedAt) / 1000).toFixed(0);
        const shieldedSynced = state.shielded.state.progress.isStrictlyComplete();
        const dustSynced = state.dust.state.progress.isStrictlyComplete();
        const unshieldedSynced = state.unshielded?.progress?.isStrictlyComplete() ?? false;
        log.info(
          `Wallet sync progress (${elapsedSec}s): shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
        );
      }),
      Rx.filter((state: any) => {
        const shieldedSynced = skipShielded || state.shielded.state.progress.isStrictlyComplete();
        const dustSynced = state.dust.state.progress.isStrictlyComplete();
        const unshieldedSynced = state.unshielded?.progress?.isStrictlyComplete() ?? false;

        if (!shieldedSynced || !dustSynced || !unshieldedSynced) return false;

        if (waitNonZero && !skipShielded) {
          const tokenId = shieldedToken().tag;
          const shieldedBalance = state.shielded.balances[tokenId] ?? 0n;
          return shieldedBalance > 0n;
        }

        return true;
      }),
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

  const tokenId = shieldedToken().tag;

  const shieldedBalancesObj = state.shielded.balances || {};
  const availableKeys = Object.keys(shieldedBalancesObj);
  log.info(`Available shielded balance keys: ${availableKeys.length > 0 ? availableKeys.join(', ') : 'none'}`);
  log.info(`Looking for token ID: ${tokenId}`);

  const shieldedBalance = shieldedBalancesObj[tokenId] ?? 0n;
  log.info(`Shielded balance for token ${tokenId}: ${shieldedBalance}`);

  const unshieldedBalancesObj = (state.unshielded?.balances ?? {}) as Record<string, bigint>;
  const unshieldedBalance = Object.values(unshieldedBalancesObj).reduce(
    (acc, v) => acc + (v ?? 0n),
    0n
  );

  let dustBalance = 0n;
  try {
    dustBalance = state.dust?.balance?.(new Date()) ?? 0n;
  } catch (_err) {
    log.warn("Could not read dust balance from synced state; continuing with dustBalance=0");
  }

  return { shieldedBalance, unshieldedBalance, dustBalance };
}

/**
 * Wait for dust wallet sync and return dust balance if available.
 */
export async function waitForDustFunds(
  wallet: WalletFacade,
  optionsOrTimeout?: number | { timeoutMs?: number; waitNonZero?: boolean }
): Promise<bigint> {
  log.info("Waiting for dust wallet to sync and receive funds...");

  const options = typeof optionsOrTimeout === 'number'
    ? { timeoutMs: optionsOrTimeout }
    : optionsOrTimeout;

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;
  const dustSyncStartedAt = Date.now();

  const dustWallet = (wallet as any).dust;
  if (!dustWallet || !dustWallet.state) {
    log.warn("Dust wallet state not available; skipping dust balance wait.");
    return 0n;
  }

  const dustBalance = (await Rx.firstValueFrom(
    (dustWallet.state as Rx.Observable<any>).pipe(
      Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        try {
          const elapsedSec = ((Date.now() - dustSyncStartedAt) / 1000).toFixed(0);
          const complete = state.state?.progress?.isStrictlyComplete();
          log.info(`Dust wallet sync progress (${elapsedSec}s): complete=${complete ?? "unknown"}`);
        } catch (_err) {
          // ignore logging errors
        }
      }),
      Rx.filter((state: any) => {
        try {
          return state.state?.progress?.isStrictlyComplete() === true;
        } catch (_err) {
          return false;
        }
      }),
      Rx.map((state: any) => {
        try {
          if (typeof state.balance === "function") {
            return state.balance(new Date()) as bigint;
          }
        } catch (_err) {
          // fall through
        }
        return 0n;
      }),
      // Apply timeout after filtering so `Rx.timeout({ each })` is not reset on
      // every synced-but-still-zero balance emission while waiting for dust.
      Rx.filter((balance: bigint) => !waitNonZero || balance > 0n),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Dust wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      }),
      Rx.tap((balance: bigint) => {
        if (balance > 0n) log.info(`Dust wallet balance: ${balance}`);
      })
    )
  )) as bigint;

  return dustBalance;
}

// ============================================================================
// Dust Sync with Retry
// ============================================================================

const DUST_STALL_TIMEOUT_MS = 60_000;
const DUST_MAX_RETRIES = 5;
const DUST_COMPLETION_GAP = 50n;

export interface DustSyncWithRetryOptions {
  networkUrls: Required<NetworkUrls>;
  seed: string;
  networkId: NetworkId.NetworkId;
  /** Per-emission stall timeout in ms. Default: 60_000 (1 minute). */
  stallTimeoutMs?: number;
  /** Maximum retry attempts on stall. Default: 5. */
  maxRetries?: number;
  /** Throttle interval for state emissions in ms. Default: 10_000 (10s). */
  throttleMs?: number;
  syncMode?: WalletSyncMode;
  /** Base directory for dust state files (relative to CWD). Default: "dust-state". */
  dustStateDir?: string;
}

/**
 * Build a wallet facade and wait for dust sync with stall-detection retry.
 *
 * On each stall (no new state emission within `stallTimeoutMs`):
 * 1. Serialize the current dust state
 * 2. Stop the wallet facade
 * 3. Rebuild from the saved state (skips already-synced blocks)
 * 4. Resume sync
 *
 * For non-undeployed networks, state is also persisted to disk so subsequent
 * process startups can resume from the last checkpoint.
 */
export async function waitForDustFundsWithRetry(
  options: DustSyncWithRetryOptions,
  existingWalletResult?: WalletResult,
): Promise<{ walletResult: WalletResult; dustBalance: bigint }> {
  const {
    networkUrls,
    seed,
    networkId,
    stallTimeoutMs = DUST_STALL_TIMEOUT_MS,
    maxRetries = DUST_MAX_RETRIES,
    throttleMs = CONSTANTS.WALLET_SYNC_THROTTLE_MS,
    syncMode = 'dust-only',
    dustStateDir = DEFAULT_DUST_STATE_DIR,
  } = options;

  const networkIdStr = String(networkId);

  // Pre-load cached state from disk before building any wallet.
  // Uses seed-based path so we don't need the dust address yet.
  const cachedState: string | null = loadDustState(dustStateDir, networkIdStr, seed);
  if (cachedState) {
    log.info(`Loaded cached dust state from disk (${getDustStatePath(dustStateDir, networkIdStr, seed)})`);
  }
  let inMemoryState: string | null = null;

  // Helper to serialize and save dust state
  async function serializeAndSave(wr: WalletResult): Promise<string | null> {
    try {

      const serialized: string = await (wr.wallet as any).dust.serializeState();
      inMemoryState = serialized;
      saveDustState(dustStateDir, networkIdStr, seed, serialized);
      return serialized;
    } catch (e) {
      log.warn(`Failed to serialize dust state: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  // Helper to stop a wallet safely
  async function stopWallet(wr: WalletResult | null): Promise<void> {
    if (!wr) return;
    try {
      await wr.wallet.stop();
    } catch {
      // ignore stop errors
    }
  }

  // Build or reuse wallet
  let walletResult = existingWalletResult ?? null;

  let dustSyncedState: any = null;
  let lastAppliedIndex = 0n;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastAppliedIndex = 0n;
    try {
      if (!walletResult) {
        const stateToRestore = inMemoryState ?? cachedState;
        if (attempt > 1) {
          if (stateToRestore) {
            log.info(`Retry ${attempt}/${maxRetries}: rebuilding wallet from ${inMemoryState ? 'in-memory' : 'cached'} state...`);
          } else {
            log.info(`Retry ${attempt}/${maxRetries}: rebuilding wallet from scratch...`);
          }
        } else if (stateToRestore) {
          log.info("Building wallet from cached dust state...");
        }
        walletResult = await buildWalletFacade(
          networkUrls,
          seed,
          networkId,
          syncMode,
          stateToRestore,
        );
      }


      const dustWallet = (walletResult.wallet as any).dust;
      if (!dustWallet || !dustWallet.state) {
        log.warn("Dust wallet state not available; skipping dust sync.");
        return { walletResult, dustBalance: 0n };
      }

      // First, try the SDK's built-in waitForSyncedState with DUST_COMPLETION_GAP.
      // This handles the common case (mainnet/testnet with blocks to sync).
      // If it throws (timeout or no sync events), fall back to reading the
      // current state directly — on fresh chains with no dust activity,
      // the wallet has nothing to sync and waitForSyncedState would hang forever.
      const syncStartedAt = Date.now();
      try {
        if (typeof dustWallet.waitForSyncedState === "function") {
          dustSyncedState = await Promise.race([
            dustWallet.waitForSyncedState(DUST_COMPLETION_GAP),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("stall")), stallTimeoutMs)
            ),
          ]);
        } else {
          // Fallback: RxJS pipeline for SDK versions without waitForSyncedState
    
          dustSyncedState = await Rx.firstValueFrom(
      
            (dustWallet.state as Rx.Observable<any>).pipe(
              Rx.throttleTime(throttleMs),
              Rx.timeout({
                each: stallTimeoutMs,
                with: () => Rx.throwError(() => new Error("stall")),
              }),
        
              Rx.filter((ds: any) => {
                const progress = ds.state?.progress;
                if (!progress) return false;
                if (typeof progress.isCompleteWithin === "function") {
                  if (progress.isCompleteWithin(DUST_COMPLETION_GAP)) return true;
                } else if (typeof progress.isStrictlyComplete === "function") {
                  if (progress.isStrictlyComplete()) return true;
                }
                const applied = progress.appliedIndex ?? 0n;
                const target = progress.highestRelevantWalletIndex ?? 0n;
                if (applied > 0n && target > 0n && progress.isConnected && applied === lastAppliedIndex) {
                  return true;
                }
                lastAppliedIndex = applied;
                return false;
              }),
            ),
          );
        }
      } catch (syncErr) {
        // Sync timed out or stalled. Read the current state to check progress.
  
        const currentState = await Rx.firstValueFrom(dustWallet.state as Rx.Observable<any>);
        const progress = currentState?.state?.progress;
        const applied = progress?.appliedIndex ?? 0n;
        const target = progress?.highestRelevantWalletIndex ?? 0n;
        const elapsedSec = ((Date.now() - syncStartedAt) / 1000).toFixed(0);

        // Update lastAppliedIndex so the stall handler knows progress was made
        // and preserves the in-memory state for the next retry.
        lastAppliedIndex = applied;

        log.info(
          `Dust sync attempt ${attempt}/${maxRetries} (${elapsedSec}s): ${applied}/${target} connected=${progress?.isConnected ?? "?"}`,
        );

        if (applied === 0n && target === 0n) {
          // Nothing to sync — the wallet has no dust history on this chain.
          // Accept the current state as "complete".
          log.info("Dust wallet has no events to sync (0/0). Accepting current state.");
          dustSyncedState = currentState;
        } else {
          // There IS data to sync but the wallet stalled. Re-throw for retry.
          throw syncErr;
        }
      }

      const elapsedSec = ((Date.now() - syncStartedAt) / 1000).toFixed(0);
      const syncProgress = dustSyncedState?.state?.progress;
      log.info(
        `Dust sync attempt ${attempt}/${maxRetries} (${elapsedSec}s): ` +
        `${syncProgress?.appliedIndex ?? "?"}/${syncProgress?.highestRelevantWalletIndex ?? "?"} ` +
        `connected=${syncProgress?.isConnected ?? "?"}`,
      );

      // Sync complete — extract balance and save state
      let dustBalance = 0n;
      try {
        if (typeof dustSyncedState.balance === "function") {
          dustBalance = dustSyncedState.balance(new Date()) as bigint;
        } else if (typeof dustSyncedState.walletBalance === "function") {
          dustBalance = dustSyncedState.walletBalance(new Date()) as bigint;
        }
      } catch {
        // ignore balance extraction errors
      }

      log.info(`Dust sync complete (attempt ${attempt}). Balance: ${dustBalance}`);

      // Save final state to disk
      await serializeAndSave(walletResult);

      return { walletResult, dustBalance };
    } catch (e) {
      const isStall = e instanceof Error && e.message === "stall";

      if (isStall && attempt < maxRetries) {
        log.warn(`Dust sync stalled on attempt ${attempt}/${maxRetries}. Stopping wallet and rebuilding from state...`);
        if (walletResult) {
          await serializeAndSave(walletResult);
          await stopWallet(walletResult);
          walletResult = null;
        }
        // If target was 0 on this attempt, the state is likely invalid — don't restore it
        if (lastAppliedIndex === 0n) {
          log.warn("No sync progress was made (appliedIndex=0), discarding in-memory state for clean rebuild");
          inMemoryState = null;
        }
        continue;
      }

      // Non-stall error or final attempt — save what we have and throw
      if (walletResult) {
        await serializeAndSave(walletResult);
      }

      if (isStall) {
        throw new Error(
          `Dust wallet sync stalled after ${maxRetries} attempts. ` +
          `Each attempt waited ${stallTimeoutMs}ms for new state emissions.`,
        );
      }
      throw e;
    }
  }

  // Should not reach here, but just in case
  throw new Error("waitForDustFundsWithRetry: exhausted all retries");
}

export function getInitialDustState(
  dustWallet: any
): Promise<any> {
  return Rx.firstValueFrom(dustWallet.state);
}

/**
 * Create wallet configuration for the modular Midnight SDK
 */
function createWalletConfiguration(
  networkUrls: Required<NetworkUrls>,
  networkId: NetworkId.NetworkId,
): DefaultConfiguration {
  return {
    indexerClientConnection: {
      indexerHttpUrl: networkUrls.indexer,
      indexerWsUrl: networkUrls.indexerWS,
    },
    provingServerUrl: new URL(networkUrls.proofServer),
    relayURL: new URL(networkUrls.node.replace("http", "ws")),
    networkId: networkId,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: {
      additionalFeeOverhead: CONSTANTS.DUST_FEE_OVERHEAD,
      feeBlocksMargin: CONSTANTS.DUST_FEE_BLOCKS_MARGIN,
    },
  };
}

function buildShieldedWallet(config: DefaultConfiguration, seed: Uint8Array) {
  return ShieldedWallet(config as any).startWithSeed(seed);
}

function buildDustWallet(
  config: DefaultConfiguration,
  seed: Uint8Array,
  serializedState?: string | null,
) {
  const dustConfig = {
    ...config,
    costParameters: {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: CONSTANTS.DUST_FEE_OVERHEAD,
      feeBlocksMargin: CONSTANTS.DUST_FEE_BLOCKS_MARGIN,
    },
  };
  if (serializedState) {
    log.info("Restoring dust wallet from cached state");
    return DustWallet(dustConfig as any).restore(serializedState);
  }
  const dustParameters = LedgerParameters.initialParameters().dust;
  return DustWallet(dustConfig as any).startWithSeed(seed, dustParameters);
}

function buildUnshieldedWallet(
  config: DefaultConfiguration,
  keystore: UnshieldedKeystore,
) {
  return UnshieldedWallet({
    ...config,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  } as any).startWithPublicKey(PublicKey.fromKeyStore(keystore));
}

export type WalletSyncMode = 'all' | 'dust-only';

/**
 * Build a wallet facade. When `syncMode` is `'dust-only'`, the shielded and
 * unshielded wallets are stopped immediately after startup so they don't
 * consume indexer connections or CPU.  The facade still requires all three
 * at init time (SDK constraint), but the unused ones are torn down.
 */
export async function buildWalletFacade(
  networkUrls: Required<NetworkUrls>,
  seed: string,
  networkId: NetworkId.NetworkId,
  syncMode: WalletSyncMode = 'all',
  dustSerializedState?: string | null,
): Promise<WalletResult> {
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const config = createWalletConfiguration(networkUrls, networkId);

  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);

  const shieldedWallet = buildShieldedWallet(config, shieldedSeed);
  const dustWallet = buildDustWallet(config, dustSeed, dustSerializedState);
  const unshieldedWallet = buildUnshieldedWallet(config, unshieldedKeystore);

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);

  const wallet: WalletFacade = await WalletFacade.init({
    configuration: config as any,
    shielded: () => shieldedWallet,
    unshielded: () => unshieldedWallet,
    dust: () => dustWallet,
  });

  await wallet.start(zswapSecretKeys, dustSecretKey);

  if (syncMode === 'dust-only') {
    log.info("Stopping shielded and unshielded wallet sync (dust-only mode)");
    await Promise.all([
      (wallet.shielded as any).stop?.(),
      (wallet.unshielded as any).stop?.(),
    ]);
  }

  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();
  const dustState = await getInitialDustState(wallet.dust);
  const dustAddress = MidnightBech32m.encode(networkId, dustState.address).asString();

  return {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys: zswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey: dustSecretKey,
    dustAddress,
    unshieldedAddress,
    unshieldedKeystore,
  };
}

export function getInitialShieldedState(
  shieldedWallet: any
): Promise<ShieldedWalletState> {
  return Rx.firstValueFrom(shieldedWallet.state);
}

/**
 * Get initial state of unshielded wallet
 */
function getInitialUnshieldedState(
  unshieldedWallet: any
): Promise<any> {
  if (!unshieldedWallet) return Promise.resolve(null);
  if (unshieldedWallet.state && typeof unshieldedWallet.state.pipe === 'function') {
    return Rx.firstValueFrom(unshieldedWallet.state);
  }
  if (typeof unshieldedWallet.state === 'function') {
    return Rx.firstValueFrom(unshieldedWallet.state());
  }
  return Promise.resolve(null);
}

/**
 * Register unshielded Night UTXOs for dust generation
 * This is required before the wallet can pay transaction fees
 */
export async function registerNightForDust(walletResult: WalletResult): Promise<boolean> {
  log.info("Checking for unshielded Night UTXOs to register for dust generation...");

  const state = await Rx.firstValueFrom(
    walletResult.wallet.state().pipe(

      Rx.filter((s: any) => {
        // Only require unshielded+dust sync for dust registration (shielded is not needed)
        const dustSynced = s.dust?.state?.progress?.isStrictlyComplete() ?? false;
        const unshieldedSynced = s.unshielded?.progress?.isStrictlyComplete() ?? false;
        return dustSynced && unshieldedSynced;
      }),
      Rx.timeout({
        each: resolveWalletSyncTimeoutMs(),
        with: () => Rx.throwError(() => new Error("Timeout waiting for unshielded+dust sync for dust registration")),
      })
    )
  );

  const unregisteredNightUtxos =
    (state as any).unshielded?.availableCoins?.filter((coin: any) => coin.meta.registeredForDustGeneration === false) ?? [];

  if (unregisteredNightUtxos.length === 0) {
    log.info("No unregistered unshielded Night UTXOs available.");
    const dustBalance = await waitForDustFunds(walletResult.wallet, { timeoutMs: 5000 });
    return dustBalance > 0n;
  }

  log.info(`Found ${unregisteredNightUtxos.length} unregistered Night UTXOs. Registering for dust...`);

  try {
    const recipe = await (walletResult.wallet as any).registerNightUtxosForDustGeneration(
      unregisteredNightUtxos,
      walletResult.unshieldedKeystore.getPublicKey(),
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload)
    );

    const signedRecipe = await (walletResult.wallet as any).signRecipe(
      recipe,
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload),
    );

    log.info("Submitting dust registration transaction...");
    const txId = await walletResult.wallet.submitTransaction(
      await (walletResult.wallet as any).finalizeRecipe(signedRecipe),
    );
    log.info(`Dust registration submitted with tx id: ${txId}`);

    log.info("Waiting for dust to be generated...");
    await Rx.firstValueFrom(
      walletResult.wallet.state().pipe(
        Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
        Rx.tap((s: any) => {
          const dustBalance = s.dust?.balance?.(new Date()) ?? 0n;
          log.info(`Current dust balance: ${dustBalance}`);
        }),
        Rx.filter((s: any) => (s.dust?.balance?.(new Date()) ?? 0n) > 0n),
        Rx.timeout({
          each: resolveWalletSyncTimeoutMs(),
          with: () => Rx.throwError(() => new Error("Timeout waiting for dust generation"))
        })
      )
    );

    log.info("Dust registration complete!");
    return true;
  } catch (e) {
    log.error(`Failed to register Night UTXOs for dust: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { values: parsedArgs } = parseArgs({
    args: getArgs(),
    options: {
      seed: { type: "string" },
      balance: { type: "boolean", default: false },
    },
    strict: false,
  });

  const result = dotenv.config({ path: ".env.testnet", override: true });
  if (result.error) {
    if (!isNotFoundError(result.error)) {
      log.warn(`Failed to load .env.testnet: ${result.error}`);
    }
  }

  const envSeed = getEnv("MIDNIGHT_WALLET_SEED");
  const argSeed = parsedArgs.seed;
  let seed = argSeed || envSeed;

  if (!seed) {
    log.info("No seed provided. Generating a new random 32-byte hex seed...");
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    seed = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    log.info("==========================================");
    log.info(`GENERATED SEED: ${seed}`);
    log.info("SAVE THIS SEED! YOU WILL NEED IT TO RESTORE THIS WALLET.");
    log.info("==========================================");
  } else {
    log.info("Using provided seed: " + seed);
  }

  if (seed?.startsWith("000000000000000000000000000000000000000000000000000000000000000")) {
    log.warn("⚠️  Genesis seeds (0x000...001, 0x000...002, etc.) only have funds on 'undeployed' local networks!");
    log.warn("⚠️  For testnet/preview networks, you need to:");
    log.warn("   1. Generate a new wallet seed, OR");
    log.warn("   2. Request funds from a faucet for this wallet");
  }

  const indexer = getEnv("MIDNIGHT_INDEXER_URL") || midnightNetworkConfig.indexer;
  const indexerWS = getEnv("MIDNIGHT_INDEXER_WS_URL") || midnightNetworkConfig.indexerWS;
  const node = getEnv("MIDNIGHT_NODE_URL") || midnightNetworkConfig.node;
  const proofServer = getEnv("MIDNIGHT_PROOF_SERVER_URL") || midnightNetworkConfig.proofServer;

  const networkUrls: Required<NetworkUrls> = {
    id: "placeholder-value",
    indexer,
    indexerWS,
    node,
    proofServer
  };

  const networkIdRaw = getEnv("MIDNIGHT_NETWORK_ID") || "undeployed";

  let networkId: NetworkId.NetworkId;
  switch (networkIdRaw.toLowerCase()) {
    case "undeployed":
      networkId = NetworkId.NetworkId.Undeployed;
      break;
    case "testnet":
    case "testnet-02":
      networkId = NetworkId.NetworkId.TestNet;
      break;
    case "devnet":
    case "qanet":
      networkId = NetworkId.NetworkId.DevNet;
      break;
    case "preview":
      networkId = "preview" as NetworkId.NetworkId;
      log.info(`Using preview network (addresses will have mn_addr_preview prefix)`);
      break;
    default:
      log.warn(`Unknown network ID "${networkIdRaw}", using as-is. Valid values: undeployed, testnet, devnet, preview`);
      networkId = networkIdRaw as NetworkId.NetworkId;
  }
  networkUrls.id = networkId;

  log.info(`Using network ID: ${networkId}`);
  log.info(`Indexer: ${indexer}`);
  log.info(`Indexer WS: ${indexerWS}`);
  log.info(`Node: ${node}`);
  setNetworkId(networkId);

  try {
    log.info("Building wallet...");
    const walletResult = await buildWalletFacade(networkUrls, seed, networkId);

    const initialState = await getInitialShieldedState(walletResult.wallet.shielded);
    const shieldedAddress = initialState.address.coinPublicKeyString();

    log.info("==========================================");
    log.info("Wallet Addresses");
    log.info("==========================================");
    log.info(`Shielded Address:   ${shieldedAddress}`);
    log.info(`Unshielded Address: ${walletResult.unshieldedAddress}`);
    log.info(`Dust Address:       ${walletResult.dustAddress}`);
    log.info("==========================================");

    if (parsedArgs.balance) {
      log.info("==========================================");
      log.info("Fetching Balances...");
      log.info("==========================================");

      let shieldedBalance = 0n;
      let unshieldedBalance = 0n;
      let dustBalance = 0n;

      const tokenId = shieldedToken().tag;
      shieldedBalance = initialState.balances[tokenId] ?? 0n;

      const syncTimeoutMs = resolveWalletSyncTimeoutMs();

      if (shieldedBalance === 0n) {
        log.info("Shielded balance is 0. Waiting for wallet sync to confirm funds...");
        try {
          const synced = await syncAndWaitForFunds(walletResult.wallet);
          shieldedBalance = synced.shieldedBalance;
          unshieldedBalance = synced.unshieldedBalance;
          dustBalance = synced.dustBalance;
        } catch (e) {
          log.warn(`Sync timed out or failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        try {
          const unshieldedState = await getInitialUnshieldedState((walletResult.wallet as any).unshielded);
          const uBalances = (unshieldedState?.balances ?? {}) as Record<string, bigint>;
          unshieldedBalance = Object.values(uBalances).reduce(
            (acc: bigint, v) => acc + (v ?? 0n),
            0n
          );
        } catch(_e) { /* ignore */ }

        try {
          const state = await Rx.firstValueFrom(walletResult.wallet.state());
          dustBalance = (state as any).dust?.balance?.(new Date()) ?? 0n;

          if (dustBalance === 0n) {
            log.info("Dust balance is 0. Attempting to sync dust wallet...");
            try {
              dustBalance = await waitForDustFunds(walletResult.wallet, { timeoutMs: syncTimeoutMs });
            } catch(_e) {
              log.warn("Dust sync timed out or returned no funds.");
            }
          }

          if (dustBalance === 0n && unshieldedBalance > 0n) {
            log.info("Dust is 0 but unshielded funds available. Registering for dust generation...");
            const success = await registerNightForDust(walletResult);
            if (success) {
              dustBalance = await waitForDustFunds(walletResult.wallet, { timeoutMs: 30000 });
            }
          }
        } catch (_e) {
          // ignore
        }
      }

      log.info("==========================================");
      log.info("Balances");
      log.info("==========================================");
      log.info(`Shielded Balance:   ${shieldedBalance} NIGHT`);
      log.info(`Dust Balance:       ${dustBalance} DUST`);
      log.info(`Unshielded Balance: ${unshieldedBalance} NIGHT`);
    }

    log.info("==========================================");

    await walletResult.wallet.stop();
  } catch (error) {
    log.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }
}

if (import.meta.main) {
  main();
}

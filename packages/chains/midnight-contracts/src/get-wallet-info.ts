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
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import {
  DustSecretKey,
  LedgerParameters,
  ZswapSecretKeys,
  nativeToken,
} from "@midnightntwrk/ledger-v9";

const log = console;
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
import {
  type DefaultConfiguration,
  type UnprovenTransactionRecipe,
  WalletFacade,
} from "@midnightntwrk/wallet-sdk-facade";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
  type UnshieldedKeystore,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { type ShieldedWalletState } from "@midnightntwrk/wallet-sdk-shielded";
import {
  InMemoryTransactionHistoryStorage,
  NetworkId,
  TransactionHistoryStorage,
} from "@midnightntwrk/wallet-sdk-abstractions";
import { DustAddress } from "@midnightntwrk/wallet-sdk-address-format";
// No node:fs / node:path here — this module is reachable from BROWSER bundles
// (MidnightLocal.connectFromSeed imports `./wallet-info` to build the wallet
// facade), and browser bundlers shim those to empty/null modules. All disk I/O
// (dust-state persistence) lives in dust-state.ts, loaded lazily inside
// waitForDustFundsWithRetry so it never enters the browser's static graph.
import { CONSTANTS } from "./constants.ts";
import type { NetworkUrls, WalletResult } from "./types.ts";
import { midnightNetworkConfig } from "./midnight-env.ts";
import { getEnv, args as getArgs, exit, isNotFoundError } from "@effectstream/utils/runtime";

// ============================================================================
// Dust State Persistence — moved to dust-state.ts (node-only; disk I/O).
// Re-exported from mod.ts for node consumers; NOT re-exported here, since a
// static re-export would pull node:fs right back into the browser graph.
// ============================================================================

const DEFAULT_DUST_STATE_DIR = "dust-state";

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

  const derivedKey = Buffer.from(derivationResult.key);
  hdWalletResult.hdWallet.clear();
  return derivedKey;
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

/** Read spendable dust from façade state or a dust sub-wallet emission. */
export function resolveFacadeDustBalance(
  facadeOrDustState: unknown,
  at: Date = new Date(),
): bigint {
  const d =
    (facadeOrDustState as { dust?: unknown } | null | undefined)?.dust ??
    facadeOrDustState;
  if (d === undefined || d === null || typeof d !== "object") return 0n;
  let w = 0n;
  let b = 0n;
  try {
    const fn = (d as { walletBalance?: (t: Date) => unknown }).walletBalance;
    if (typeof fn === "function") {
      const v = fn.call(d, at);
      if (typeof v === "bigint") w = v;
    }
  } catch {
    /* ignore transient read errors until dust subtree fully wires */
  }
  try {
    const fn = (d as { balance?: (t: Date) => unknown }).balance;
    if (typeof fn === "function") {
      const v = fn.call(d, at);
      if (typeof v === "bigint") b = v;
    }
  } catch {
    /* ignore */
  }
  return w > b ? w : b;
}

/** Count spendable DUST UTXOs from a facade state or dust-wallet state. */
export function resolveFacadeDustAvailableCoins(
  facadeOrDustState: unknown,
): number {
  const dust =
    (facadeOrDustState as { dust?: unknown } | null | undefined)?.dust ??
    facadeOrDustState;
  if (dust === undefined || dust === null || typeof dust !== "object") return 0;
  const availableCoins = (dust as { availableCoins?: unknown }).availableCoins;
  return Array.isArray(availableCoins) ? availableCoins.length : 0;
}

export interface DustFundsReadiness {
  /** Aggregate wallet balance, retained for diagnostics only. */
  balance: bigint;
  /** Coins the Ledger-v9 DUST wallet currently exposes as available. */
  availableCoins: number;
  /** Available coins that meet the caller's optional per-coin value floor. */
  spendableCoins: number;
  /** The spendability signal adapters must use instead of aggregate balance. */
  ready: boolean;
}

/**
 * Resolve Ledger-v9 DUST spendability without inferring it from aggregate
 * balance. Regular wallet flows count every available coin; fee-balancing
 * callers can provide a value floor so newly-created, value-insufficient coins
 * do not advertise readiness prematurely.
 */
export function resolveFacadeDustFundsReadiness(
  facadeOrDustState: unknown,
  minSpendableDustPerCoin?: bigint,
): DustFundsReadiness {
  const dust =
    (facadeOrDustState as { dust?: unknown } | null | undefined)?.dust ??
    facadeOrDustState;
  const coins = dust && typeof dust === "object"
    ? (dust as { availableCoins?: unknown }).availableCoins
    : undefined;
  const available = Array.isArray(coins) ? coins : [];
  const spendableCoins = minSpendableDustPerCoin === undefined
    ? available.length
    : available.filter((coin) => {
      try {
        const generatedNow = (coin as { generatedNow?: bigint | string | number } | null)
          ?.generatedNow;
        return generatedNow !== undefined &&
          BigInt(generatedNow) >= minSpendableDustPerCoin;
      } catch {
        return false;
      }
    }).length;

  return {
    balance: resolveFacadeDustBalance(facadeOrDustState),
    availableCoins: available.length,
    spendableCoins,
    ready: spendableCoins > 0,
  };
}

function resolveDustHeartbeatPollMs(waitNonZero: boolean, override?: number): number {
  if (override !== undefined) return Math.max(0, Math.floor(override));
  if (!waitNonZero) return 0;
  const raw = getEnv("MIDNIGHT_WAIT_DUST_POLL_INTERVAL_MS");
  if (raw !== undefined && raw !== "") {
    if (raw === "0") return 0;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 7500;
}

function dustWalletState$(wallet: WalletFacade): Rx.Observable<unknown> {
  const dust = (wallet.dust as { state?: Rx.Observable<unknown> }).state;
  if (!dust || typeof dust.pipe !== "function") {
    throw new Error("Dust wallet state stream is not available");
  }
  return dust;
}

/** Heartbeat over dust sub-wallet — safe after dust-only stops shielded/unshielded. */
function dustWalletStateWithHeartbeat(
  wallet: WalletFacade,
  pollMs: number,
): Rx.Observable<unknown> {
  const dust$ = dustWalletState$(wallet);
  if (pollMs <= 0) return dust$;
  return Rx.combineLatest([
    dust$,
    Rx.interval(pollMs).pipe(Rx.startWith(-1 as const)),
  ]).pipe(Rx.map(([s]) => s));
}

function dustProgressFromState(ds: unknown): {
  appliedIndex: bigint;
  highestRelevantWalletIndex: bigint;
  isConnected: boolean;
} | null {
  const progress =
    (ds as { state?: { progress?: unknown } })?.state?.progress ??
    (ds as { progress?: unknown })?.progress;
  if (!progress || typeof progress !== "object") return null;
  const p = progress as {
    appliedIndex?: bigint;
    highestRelevantWalletIndex?: bigint;
    isConnected?: boolean;
    isStrictlyComplete?: () => boolean;
    isCompleteWithin?: (gap: bigint) => boolean;
  };
  return {
    appliedIndex: p.appliedIndex ?? 0n,
    highestRelevantWalletIndex: p.highestRelevantWalletIndex ?? 0n,
    isConnected: p.isConnected ?? false,
  };
}

function isDustProgressCaughtUp(ds: unknown): boolean {
  const progress =
    (ds as { state?: { progress?: unknown } })?.state?.progress ??
    (ds as { progress?: unknown })?.progress;
  if (!progress || typeof progress !== "object") return false;
  const p = progress as {
    appliedIndex?: bigint;
    highestRelevantWalletIndex?: bigint;
    isStrictlyComplete?: () => boolean;
  };
  if (typeof p.isStrictlyComplete === "function" && p.isStrictlyComplete()) return true;
  const applied = p.appliedIndex ?? 0n;
  const target = p.highestRelevantWalletIndex ?? 0n;
  if (applied === 0n && target === 0n) return true;
  return target > 0n && applied >= target;
}

/** Wait until dust applied index reaches chain tip (not just DUST_COMPLETION_GAP). */
async function waitForDustWalletProgressCatchUp(
  wallet: WalletFacade,
  timeoutMs: number,
): Promise<void> {
  if (timeoutMs <= 0) return;
  const startedAt = Date.now();
  await Rx.firstValueFrom(
    dustWalletState$(wallet).pipe(
      Rx.tap((ds) => {
        const p = dustProgressFromState(ds);
        if (!p) return;
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
        log.info(
          `Dust catch-up (${elapsedSec}s): ${p.appliedIndex}/${p.highestRelevantWalletIndex} connected=${p.isConnected}`,
        );
      }),
      Rx.filter((ds) => isDustProgressCaughtUp(ds)),
      Rx.timeout({
        first: timeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Dust wallet sync catch-up timeout after ${timeoutMs}ms`),
          ),
      }),
    ),
  );
  log.info("Dust wallet sync catch-up complete");
}

/** Stop shielded + unshielded sync after dust is ready (dust-only ergonomics). */
export async function suspendAuxWalletSyncForFees(wallet: WalletFacade): Promise<void> {
  log.info("Stopping shielded and unshielded wallet sync (dust-only mode)");
  await Promise.all([
    (wallet.shielded as { stop?: () => Promise<void> }).stop?.(),
    (wallet.unshielded as { stop?: () => Promise<void> }).stop?.(),
  ]);
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
    const shieldedSynced = latestState.shielded.progress.isStrictlyComplete();
    const dustSynced = latestState.dust.progress.isStrictlyComplete();
    const unshieldedSynced = latestState.unshielded?.progress?.isStrictlyComplete() ?? false;
    log.info(
      `[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
    );
  }, CONSTANTS.WALLET_SYNC_THROTTLE_MS);
  const syncStartedAt = Date.now();

  let state: any;
  try {
    state = await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
        Rx.tap((nextState: any) => {
          latestState = nextState;
          const elapsedSec = ((Date.now() - syncStartedAt) / 1000).toFixed(0);
          const shieldedSynced = nextState.shielded.progress.isStrictlyComplete();
          const dustSynced = nextState.dust.progress.isStrictlyComplete();
          const unshieldedSynced = nextState.unshielded?.progress?.isStrictlyComplete() ?? false;
          log.info(
            `Wallet sync progress (${elapsedSec}s): shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
          );
        }),
        Rx.filter((nextState: any) => {
          const shieldedSynced = skipShielded || nextState.shielded.progress.isStrictlyComplete();
          const dustSynced = nextState.dust.progress.isStrictlyComplete();
          const unshieldedSynced = nextState.unshielded?.progress?.isStrictlyComplete() ?? false;

          if (!shieldedSynced || !dustSynced || !unshieldedSynced) return false;

          if (waitNonZero && !skipShielded) {
            const tokenId = nativeToken().raw;
            const shieldedBalance = nextState.shielded.balances[tokenId] ?? 0n;
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
  } finally {
    clearInterval(periodicLogger);
  }

  const tokenId = nativeToken().raw;

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
    dustBalance = resolveFacadeDustBalance(state, new Date());
  } catch (_err) {
    log.warn("Could not read dust balance from synced state; continuing with dustBalance=0");
  }

  return { shieldedBalance, unshieldedBalance, dustBalance };
}

/**
 * Wait for dust wallet sync and return dust balance.
 *
 * Reads **`wallet.dust.state`** directly so dust-only mode (shielded/unshielded
 * stopped) does not wedge on façade `combineLatest`.
 *
 * When `waitNonZero` is true, first waits for dust appliedIndex to reach tip,
 * then polls the dust sub-wallet until at least one spendable DUST UTXO exists.
 * A positive accrued balance is not sufficient because it can precede coin
 * availability after NIGHT registration.
 */
export async function waitForDustFunds(
  wallet: WalletFacade,
  optionsOrTimeout?:
    | number
    | {
      timeoutMs?: number;
      waitNonZero?: boolean;
      dustPollIntervalMs?: number;
      /** When true with waitNonZero, skip catch-up wait (e.g. fresh 0/0 chain). */
      skipCatchUp?: boolean;
      /** Optional generated-value floor for a coin to count as spendable. */
      minSpendableDustPerCoin?: bigint;
    },
): Promise<DustFundsReadiness> {
  log.info("Waiting for dust wallet to sync and receive funds...");

  const options = typeof optionsOrTimeout === 'number'
    ? { timeoutMs: optionsOrTimeout }
    : optionsOrTimeout;

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;
  const minSpendableDustPerCoin = options?.minSpendableDustPerCoin;
  const pollMs = resolveDustHeartbeatPollMs(waitNonZero, options?.dustPollIntervalMs);
  const deadline = Date.now() + syncTimeoutMs;
  const remainingMs = () => Math.max(0, deadline - Date.now());

  if (pollMs > 0) {
    log.info(`Dust wait: dust sub-wallet heartbeat every ${pollMs}ms (disable with MIDNIGHT_WAIT_DUST_POLL_INTERVAL_MS=0)`);
  }
  const dustSyncStartedAt = Date.now();

  if (waitNonZero && !options?.skipCatchUp && remainingMs() > 0) {
    try {
      await waitForDustWalletProgressCatchUp(wallet, remainingMs());
    } catch (e) {
      log.warn(
        `Dust catch-up incomplete (${e instanceof Error ? e.message : String(e)}); continuing balance wait`,
      );
    }
  }

  const balanceBudgetMs = remainingMs();
  if (balanceBudgetMs <= 0) {
    throw new Error(`Dust wallet sync timeout after ${syncTimeoutMs}ms`);
  }

  const state$ = dustWalletStateWithHeartbeat(wallet, pollMs);
  const sampled$ =
    pollMs > 0
      ? state$
      : state$.pipe(Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS));

  const dustFunds = await Rx.firstValueFrom(
    sampled$.pipe(
      Rx.tap((ds: unknown) => {
        try {
          const elapsedSec = ((Date.now() - dustSyncStartedAt) / 1000).toFixed(0);
          const at = new Date();
          const p = dustProgressFromState(ds);
          const bal = resolveFacadeDustBalance(ds, at);
          const availableCoins = resolveFacadeDustAvailableCoins(ds);
          log.info(
            `Dust wallet sync progress (${elapsedSec}s): ` +
              `${p?.appliedIndex ?? "?"}/${p?.highestRelevantWalletIndex ?? "?"} ` +
              `balance=${bal} availableCoins=${availableCoins}`,
          );
        } catch {
          /* ignore */
        }
      }),
      Rx.map((ds: unknown) =>
        resolveFacadeDustFundsReadiness(ds, minSpendableDustPerCoin)
      ),
      Rx.filter((funds) => !waitNonZero || funds.ready),
      Rx.timeout({
        first: balanceBudgetMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Dust wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      }),
      Rx.tap((funds) => {
        log.info(
          `Dust wallet ready=${funds.ready} balance=${funds.balance} ` +
            `availableCoins=${funds.availableCoins} spendableCoins=${funds.spendableCoins}`,
        );
      })
    )
  );

  return dustFunds;
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
  /**
   * How long to wait for a non-zero façade dust balance after dust sync.
   * Default: {@link resolveWalletSyncTimeoutMs} (not `stallTimeoutMs`).
   */
  balanceWaitTimeoutMs?: number;
  /** Maximum retry attempts on stall. Default: 5. */
  maxRetries?: number;
  /** Throttle interval for state emissions in ms. Default: 10_000 (10s). */
  throttleMs?: number;
  syncMode?: WalletSyncMode;
  /** Base directory for dust state files (relative to CWD). Default: "dust-state". */
  dustStateDir?: string;
  /** Optional generated-value floor for a coin to count as spendable. */
  minSpendableDustPerCoin?: bigint;
}

export interface DustSyncWithRetryResult {
  walletResult: WalletResult;
  dustBalance: bigint;
  availableDustCoins: number;
  spendableDustCoins: number;
  dustReady: boolean;
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
): Promise<DustSyncWithRetryResult> {
  const {
    networkUrls,
    seed,
    networkId,
    stallTimeoutMs = DUST_STALL_TIMEOUT_MS,
    balanceWaitTimeoutMs = resolveWalletSyncTimeoutMs(),
    maxRetries = DUST_MAX_RETRIES,
    throttleMs = CONSTANTS.WALLET_SYNC_THROTTLE_MS,
    syncMode = 'dust-only',
    dustStateDir = DEFAULT_DUST_STATE_DIR,
    minSpendableDustPerCoin,
  } = options;

  const networkIdStr = String(networkId);

  // Lazy import keeps node:fs out of the browser's static graph — this retry
  // flow is node-side (long-running dust sync with disk caching), while the
  // module as a whole is bundled for browsers via `./wallet-info`.
  const { loadDustState, saveDustState, getDustStatePath } = await import("./dust-state.ts");

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
          { stopAuxWalletsImmediately: syncMode !== 'dust-only' },
        );
      }


      const dustWallet = (walletResult.wallet as any).dust;
      if (!dustWallet || !dustWallet.state) {
        log.warn("Dust wallet state not available; skipping dust sync.");
        return {
          walletResult,
          dustBalance: 0n,
          availableDustCoins: 0,
          spendableDustCoins: 0,
          dustReady: false,
        };
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

      // Sync complete — read balance from dust sub-wallet (not façade).
      let dustFunds: DustFundsReadiness = {
        balance: 0n,
        availableCoins: 0,
        spendableCoins: 0,
        ready: false,
      };
      try {
        dustFunds = await waitForDustFunds(walletResult!.wallet, {
          timeoutMs: balanceWaitTimeoutMs,
          waitNonZero: true,
          minSpendableDustPerCoin,
        });
      } catch {
        // ignore — explicit readiness remains false
      }

      log.info(
        `Dust sync complete (attempt ${attempt}). ` +
          `ready=${dustFunds.ready} balance=${dustFunds.balance} ` +
          `availableCoins=${dustFunds.availableCoins} spendableCoins=${dustFunds.spendableCoins}`,
      );

      if (!dustFunds.ready) {
        log.info("No dust after sync; attempting unshielded NIGHT registration...");
        try {
          if (await registerNightForDust(walletResult!)) {
            dustFunds = await waitForDustFunds(walletResult!.wallet, {
              timeoutMs: balanceWaitTimeoutMs,
              waitNonZero: true,
              minSpendableDustPerCoin,
            });
            log.info(
              `Dust after registration: ready=${dustFunds.ready} ` +
                `balance=${dustFunds.balance} availableCoins=${dustFunds.availableCoins} ` +
                `spendableCoins=${dustFunds.spendableCoins}`,
            );
          }
        } catch (e) {
          log.warn(
            `NIGHT→dust registration failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      if (!dustFunds.ready) {
        log.warn("No spendable DUST coin — wallet needs DUST or unshielded NIGHT to register.");
      }

      if (syncMode === 'dust-only') {
        await suspendAuxWalletSyncForFees(walletResult!.wallet);
      }

      // Save final state to disk
      await serializeAndSave(walletResult);

      return {
        walletResult,
        dustBalance: dustFunds.balance,
        availableDustCoins: dustFunds.availableCoins,
        spendableDustCoins: dustFunds.spendableCoins,
        dustReady: dustFunds.ready,
      };
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
  dustWallet: { state: Rx.Observable<unknown> },
  options?: { timeoutMs?: number },
): Promise<unknown> {
  const obs = dustWallet.state;
  if (options?.timeoutMs && options.timeoutMs > 0) {
    return Rx.firstValueFrom(
      obs.pipe(
        Rx.timeout({
          first: options.timeoutMs,
          with: () => Rx.throwError(() => new Error("Timeout reading dust wallet state")),
        }),
      ),
    );
  }
  return Rx.firstValueFrom(obs);
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
    txHistoryStorage: new InMemoryTransactionHistoryStorage(
      TransactionHistoryStorage.TransactionHistoryEntryCommonSchema,
    ),
    costParameters: {
      additionalFeeOverhead: CONSTANTS.DUST_FEE_OVERHEAD,
      feeBlocksMargin: CONSTANTS.DUST_FEE_BLOCKS_MARGIN,
    },
  };
}

function buildShieldedWallet(config: DefaultConfiguration, seed: Uint8Array) {
  return ShieldedWallet(config as any).startWithSeed(seed);
}

/**
 * Sync batching tuning for the dust wallet.
 *
 * The wallet SDK's default sync settings (batch size 10, 1ms timeout, 4ms
 * spacing) are tuned to keep a browser UI responsive — they emit many small
 * state snapshots and throttle 4ms between every batch. In a headless backend
 * (e.g. the batcher's fee wallets) that is wasteful: it slows initial sync and
 * produces a lot of short-lived intermediate state, inflating memory churn.
 *
 * We collect larger batches (fewer intermediate snapshots) with minimal
 * spacing. Spacing is kept >0 because the batcher syncs on the main event loop
 * rather than in a worker — spacing 0 would starve other work during the
 * initial catch-up sync.
 *
 * NOTE: `batchUpdates` requires `wallet-sdk-dust-wallet >= 4.0.0`.
 */
function resolveDustBatchUpdates(): {
  size: number;
  timeout: number;
  spacing: number;
} {
  const num = (name: string, fallback: number): number => {
    const raw = getEnv(name);
    if (raw == null || raw === "") return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    size: num("MIDNIGHT_DUST_SYNC_BATCH_SIZE", 100),
    timeout: num("MIDNIGHT_DUST_SYNC_BATCH_TIMEOUT_MS", 1),
    spacing: num("MIDNIGHT_DUST_SYNC_BATCH_SPACING_MS", 1),
  };
}

function buildDustWallet(
  config: DefaultConfiguration,
  seed: Uint8Array,
  serializedState?: string | null,
) {
  const dustConfig = {
    ...config,
    batchUpdates: resolveDustBatchUpdates(),
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
    txHistoryStorage: new InMemoryTransactionHistoryStorage(
      TransactionHistoryStorage.TransactionHistoryEntryCommonSchema,
    ),
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
  options?: { stopAuxWalletsImmediately?: boolean },
): Promise<WalletResult> {
  setNetworkId(networkId);
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const config = createWalletConfiguration(networkUrls, networkId);

  const unshieldedKeystore = createKeystore(
    { kind: "schnorr", secret: unshieldedSeed },
    networkId,
  );

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);

  const wallet: WalletFacade = await WalletFacade.init({
    configuration: config,
    shielded: (walletConfig) =>
      buildShieldedWallet(walletConfig, shieldedSeed),
    unshielded: (walletConfig) =>
      buildUnshieldedWallet(walletConfig, unshieldedKeystore),
    dust: (walletConfig) =>
      buildDustWallet(walletConfig, dustSeed, dustSerializedState),
  });

  await wallet.start(zswapSecretKeys, dustSecretKey);

  const stopAuxNow =
    syncMode === 'dust-only' && (options?.stopAuxWalletsImmediately ?? true);
  if (stopAuxNow) {
    await suspendAuxWalletSyncForFees(wallet);
  }

  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();
  const dustAddress = DustAddress.encodePublicKey(
    networkId,
    dustSecretKey.publicKey,
  );

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
export function getInitialUnshieldedState(
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

export interface RegisterNightForDustOptions {
  /**
   * Override for the wait-for-sync precheck timeout. The default
   * (`resolveWalletSyncTimeoutMs()`, 10 min) is correct when the wallet has
   * an active unshielded subscription. Callers that built the wallet with
   * `syncMode: 'dust-only'` should pass a small value (e.g. 30s) — the
   * unshielded sync is stopped, so this wait can never succeed and the
   * full timeout is wasted.
   */
  precheckSyncTimeoutMs?: number;
}

/**
 * Register unshielded Night UTXOs for dust generation
 * This is required before the wallet can pay transaction fees
 */
export async function registerNightForDust(
  walletResult: WalletResult,
  options?: RegisterNightForDustOptions,
): Promise<boolean> {
  log.info("Checking for unshielded Night UTXOs to register for dust generation...");

  const state = await Rx.firstValueFrom(
    walletResult.wallet.state().pipe(
      Rx.filter((s: any) => {
        const dustSynced = s.dust?.progress?.isStrictlyComplete() ?? false;
        const unshieldedSynced = s.unshielded?.progress?.isStrictlyComplete() ?? false;
        return dustSynced && unshieldedSynced;
      }),
      Rx.timeout({
        each: options?.precheckSyncTimeoutMs ?? resolveWalletSyncTimeoutMs(),
        with: () => Rx.throwError(() => new Error("Timeout waiting for unshielded+dust sync for dust registration")),
      })
    )
  );

  const unregisteredNightUtxos =
    (state as any).unshielded?.availableCoins?.filter((coin: any) => coin.meta.registeredForDustGeneration === false) ?? [];

  if (unregisteredNightUtxos.length === 0) {
    log.info("No unregistered unshielded Night UTXOs available.");
    try {
      await waitForDustFunds(walletResult.wallet, {
        timeoutMs: 5000,
        waitNonZero: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  log.info(`Found ${unregisteredNightUtxos.length} unregistered Night UTXOs. Registering for dust...`);

  try {
    const { fee } = await walletResult.wallet.estimateRegistration(
      unregisteredNightUtxos,
    );
    log.info(`Waiting for the NIGHT UTXOs to generate the registration fee: ${fee}`);
    await walletResult.wallet.waitForGeneratedDust(
      unregisteredNightUtxos,
      fee,
      { timeoutMs: resolveWalletSyncTimeoutMs() },
    );

    const recipe: UnprovenTransactionRecipe =
      await walletResult.wallet.registerNightUtxosForDustGeneration(
      unregisteredNightUtxos,
      walletResult.unshieldedKeystore.getPublicKey(),
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signDataAsync(payload),
    );
    if (recipe.type !== "UNPROVEN_TRANSACTION") {
      throw new Error(
        `Unexpected DUST registration recipe type: ${(recipe as { type?: unknown }).type}`,
      );
    }

    log.info("Submitting dust registration transaction...");
    const txId = await walletResult.wallet.submitTransaction(
      await walletResult.wallet.finalizeRecipe(recipe),
    );
    log.info(`Dust registration submitted with tx id: ${txId}`);

    log.info("Waiting for dust to be generated...");
    await waitForDustFunds(walletResult.wallet, {
      waitNonZero: true,
      timeoutMs: resolveWalletSyncTimeoutMs(),
    });

    log.info("Dust registration complete!");
    return true;
  } catch (e) {
    log.error(`Failed to register Night UTXOs for dust: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

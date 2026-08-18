// graphql-ws has a dangling promise in its subscribe flow: when a subscription
// ends, the socket's `throwOnClose` promise rejects with no handler.
// `dist/client.js:309-318` (6.2.1) does
//   const [socket, release, waitForReleaseOrThrowOnClose] = await connect();
//   if (done) return release();
// and never awaits the `Promise.race([released, throwOnClose])` it was just
// handed. In Bun, unhandled rejections crash the process (exit 1).
//
// The rejection reason is whatever the websocket last emitted: a `close` event
// when the subscription ended gracefully, an `error` event when the socket died
// first. Both are the SAME dangling promise, and neither is a reason to kill a
// batcher — the wallet SDK's sync stream retries the subscription itself
// (`RunningV1Variant.js`, `Stream.retry` with exponential backoff), and
// `waitForDustFundsWithRetry` rebuilds the wallet from its last checkpoint when
// the wallet goes quiet.
//
// Exempting only `close` is what Phase 3 §2.1 run 1 measured against live
// preprod: a TLS handshake failure on the indexer socket exited the process
// three minutes into a 58-minute cold sync — after the silence detector had
// correctly fired and the checkpoint had correctly been written, and before
// retry 2/5 could run. Every recovery path this project built was unreachable
// behind it.
//
// A socket `error` is therefore reported to whoever is syncing (see
// `onWalletSocketFailure`) instead of ending the process. Everything that is
// NOT a socket lifecycle event keeps the old behaviour and still exits:
// an unhandled rejection is a bug, and swallowing all of them to fix this one
// would hide every other.
if (globalThis.process?.versions?.bun) {
  process.on('unhandledRejection', (reason: unknown) => {
    const socketEvent = classifyWalletSocketRejection(reason);
    if (socketEvent === 'close') return;
    if (socketEvent === 'error') {
      console.warn(
        `Indexer websocket failed (${describeWalletSocketRejection(reason)}). ` +
          `The wallet SDK reconnects on its own; a dust sync in progress retries ` +
          `from its last checkpoint.`,
      );
      reportWalletSocketFailure('error', reason);
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
  shieldedToken,
} from "@midnight-ntwrk/ledger-v8";

const log = console;
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
import { type DefaultConfiguration, WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
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
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";
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

/** Where dust snapshots live, relative to CWD, unless a caller says otherwise. */
export const DEFAULT_DUST_STATE_DIR = "dust-state";

/**
 * How often a running wallet checkpoints its dust state.
 * `MIDNIGHT_DUST_STATE_SAVE_INTERVAL_MS`, default 5 minutes; 0 disables
 * periodic saving (shutdown saves still happen).
 *
 * Before this existed, dust state was written at exactly three places, all
 * inside `waitForDustFundsWithRetry`, all during init (Phase 1 §1) — so the
 * snapshot never advanced after startup and a week of uptime meant a week of
 * replay on restart. The interval bounds how much replay a crash costs; the
 * cost of shortening it is one serialize + fsync of a snapshot that is
 * megabytes on a real network, on the same event loop the wallet syncs on.
 */
export function resolveDustStateSaveIntervalMs(): number {
  const raw = getEnv("MIDNIGHT_DUST_STATE_SAVE_INTERVAL_MS");
  if (raw === "0") return 0;
  return resolveTimeoutMsEnv("MIDNIGHT_DUST_STATE_SAVE_INTERVAL_MS", 300_000);
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

/**
 * The dust public key a seed's wallet will have — the same value the wallet
 * writes into `publicKey.publicKey` when it serializes.
 *
 * Verified against the SDK 2026-08-17: a dust wallet started from
 * `deriveSeedForRole(seed, Roles.Dust)` serializes exactly this key. It lets
 * the persistence layer check that a seed-keyed snapshot file really belongs to
 * that seed's wallet, which the file name (a hash of the seed) cannot: the
 * balancing adapter's injected-wallet path pairs a wallet built by someone else
 * with the seed the adapter was constructed with, and nothing enforced that
 * they match.
 */
export function deriveDustPublicKey(seed: string): bigint {
  return DustSecretKey.fromSeed(deriveSeedForRole(seed, Roles.Dust)).publicKey;
}

/** Anything that can hand us a serialized dust snapshot — i.e. `wallet.dust`. */
export interface SerializableDustWallet {
  serializeState: () => Promise<string>;
}

export interface DustStateAutosaveOptions {
  networkId: string;
  /** Seed this wallet was derived from; keys the snapshot file. */
  seed: string;
  /** Default: {@link DEFAULT_DUST_STATE_DIR}. */
  dustStateDir?: string;
  /** Default: {@link resolveDustStateSaveIntervalMs}. 0 disables the timer. */
  intervalMs?: number;
  /** Prefix for log lines, e.g. `"Wallet 2/5"`. */
  label?: string;
}

export interface DustStateAutosaveHandle {
  /** Checkpoint now. Concurrent calls share the in-flight save. */
  saveNow(): Promise<string | null>;
  /** Stop the timer and take one final checkpoint. Idempotent. */
  stop(): Promise<string | null>;
}

/**
 * Keep a running wallet's dust snapshot advancing, and take a final one at
 * shutdown.
 *
 * Phase 1 §1 found dust state was written at exactly three places, all inside
 * `waitForDustFundsWithRetry`, all during init: nothing periodic, nothing on
 * shutdown (`close()` stopped wallets without saving), and nothing at all on
 * the adapter's injected-wallet path. A week of uptime therefore left a
 * week-old snapshot and a restart replayed a week of chain — the incident this
 * project exists for.
 *
 * Takes the dust sub-wallet rather than a `WalletResult` so it can be driven by
 * anything that serializes, which is what makes the cadence testable at all.
 */
export function startDustStateAutosave(
  dustWallet: SerializableDustWallet,
  options: DustStateAutosaveOptions,
): DustStateAutosaveHandle {
  const intervalMs = options.intervalMs ?? resolveDustStateSaveIntervalMs();
  const dustStateDir = options.dustStateDir ?? DEFAULT_DUST_STATE_DIR;
  const label = options.label ? `${options.label}: ` : "";
  const expectedPublicKey = (() => {
    try {
      return deriveDustPublicKey(options.seed).toString();
    } catch {
      // A seed we cannot derive from is a caller error, not a reason to stop
      // checkpointing — the network-id and offset guards still apply.
      return undefined;
    }
  })();

  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<string | null> | null = null;
  let stopped = false;

  async function persist(): Promise<string | null> {
    try {
      const serialized = await dustWallet.serializeState();
      const { saveDustState } = await import("./dust-state.ts");
      return saveDustState(dustStateDir, options.networkId, options.seed, serialized, {
        expectedPublicKey,
      });
    } catch (e) {
      // One bad checkpoint must not stop the next one: the wallet is mid-sync
      // and transient serialization failures are expected.
      log.warn(
        `${label}dust state checkpoint failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  function saveNow(): Promise<string | null> {
    // Never stack saves. A preprod snapshot is large enough that a serialize
    // can outlast the interval, and queueing one per tick would pile work onto
    // the same event loop the wallet syncs on.
    if (inFlight) return inFlight;
    const run = persist().finally(() => {
      inFlight = null;
    });
    inFlight = run;
    return run;
  }

  if (intervalMs > 0) {
    timer = setInterval(() => {
      if (!stopped) void saveNow();
    }, intervalMs);
    // A checkpoint timer must never be the reason a process stays alive.
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  return {
    saveNow,
    async stop(): Promise<string | null> {
      if (stopped) return null;
      stopped = true;
      if (timer !== undefined) clearInterval(timer);
      // Let an in-flight save finish, then take a fresh one: the last state is
      // the whole reason to save at shutdown.
      if (inFlight) await inFlight.catch(() => null);
      return persist();
    },
  };
}

// ============================================================================
// Wallet Configuration
// ============================================================================

function resolveTimeoutMsEnv(name: string, fallbackMs: number): number {
  const envValue = getEnv(name);
  if (!envValue) return fallbackMs;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  log.warn(`Invalid ${name}="${envValue}", using default ${fallbackMs}ms`);
  return fallbackMs;
}

/**
 * How long a wallet may spend replaying the chain.
 * `MIDNIGHT_WALLET_SYNC_TIMEOUT_MS`, default
 * {@link CONSTANTS.WALLET_SYNC_TIMEOUT_MS} (4 h — a preprod dust cold sync
 * measures ~66 min).
 */
export function resolveWalletSyncTimeoutMs(): number {
  return resolveTimeoutMsEnv(
    "MIDNIGHT_WALLET_SYNC_TIMEOUT_MS",
    CONSTANTS.WALLET_SYNC_TIMEOUT_MS,
  );
}

/**
 * How long to wait for funds to arrive once the wallet is synced.
 * `MIDNIGHT_WALLET_FUNDING_TIMEOUT_MS`, default
 * {@link CONSTANTS.WALLET_FUNDING_TIMEOUT_MS} (10 min). Kept off the sync
 * budget so an unfunded wallet fails in minutes instead of inheriting hours.
 */
export function resolveWalletFundingTimeoutMs(): number {
  return resolveTimeoutMsEnv(
    "MIDNIGHT_WALLET_FUNDING_TIMEOUT_MS",
    CONSTANTS.WALLET_FUNDING_TIMEOUT_MS,
  );
}

/**
 * Deadline for {@link registerNightForDust}'s sync precheck.
 * `MIDNIGHT_DUST_REGISTRATION_PRECHECK_TIMEOUT_MS`, default
 * {@link CONSTANTS.DUST_REGISTRATION_PRECHECK_TIMEOUT_MS} (10 min). In
 * dust-only mode the wait can never succeed, so it must stay small.
 */
export function resolveDustRegistrationPrecheckTimeoutMs(): number {
  return resolveTimeoutMsEnv(
    "MIDNIGHT_DUST_REGISTRATION_PRECHECK_TIMEOUT_MS",
    CONSTANTS.DUST_REGISTRATION_PRECHECK_TIMEOUT_MS,
  );
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

export interface DustCoinValues {
  /** Generated value of each available dust coin, in Specks. */
  values: bigint[];
  /** False when the values are the state's own stale reading rather than a projection at `at`. */
  liveClock: boolean;
}

/**
 * Read each available dust coin's generated value **projected at `at`**, not at
 * the wallet's `syncTime`.
 *
 * `DustWalletState.availableCoins` takes no time argument, so `resolveTime`
 * (`CoinsAndBalances.ts:105`) falls back to `state.state.syncTime` — which only
 * advances when a dust event is applied. Phase 1 §2 measured a fully synced
 * wallet reporting a syncTime 377 days behind wall clock on a quiet chain.
 * Since dust generation is a projection from `ctime`, reading it at that clock
 * under-reports it, and the batcher's spendability gate can then mark a wallet
 * exhausted while spendable dust exists.
 *
 * The SDK treats this as a known hazard rather than an edge case:
 * `waitForGeneratedDust` (`DustWallet.ts:443-458`) re-reads a clock every
 * second precisely so the projection advances. The capability underneath takes
 * the time as a parameter, so this asks it for the value now.
 *
 * Falls back to the stale getter — and says so — when the capability is absent
 * or throws. A projection failure must never read as "this wallet has no
 * dust": that flips the capacity gate off for the whole batcher.
 */
export function resolveDustCoinValuesAt(dustState: unknown, at: Date): DustCoinValues {
  const toValues = (coins: unknown): bigint[] =>
    Array.isArray(coins)
      ? coins.map((c) => {
        try {
          return BigInt((c as { generatedNow?: bigint | string })?.generatedNow ?? 0);
        } catch {
          return 0n;
        }
      })
      : [];

  const s = dustState as {
    state?: unknown;
    availableCoins?: unknown;
    capabilities?: {
      coinsAndBalances?: {
        getAvailableCoins?: (state: unknown, time?: Date) => unknown;
      };
    };
  } | null | undefined;

  const getAvailableCoins = s?.capabilities?.coinsAndBalances?.getAvailableCoins;
  if (typeof getAvailableCoins === "function" && s?.state !== undefined) {
    try {
      return { values: toValues(getAvailableCoins(s.state, at)), liveClock: true };
    } catch (e) {
      log.warn(
        `Dust generation could not be projected at wall clock (${
          e instanceof Error ? e.message : String(e)
        }); falling back to the wallet's last sync time.`,
      );
    }
  }
  return { values: toValues(s?.availableCoins), liveClock: false };
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

/** Pull sync progress out of a dust state emission, whatever shape it arrives in. */
export function dustProgressFromState(ds: unknown): {
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

/**
 * Wait for the shielded sub-wallet to be strictly complete. Resolves `true` if
 * it got there within `timeoutMs`, `false` otherwise — never throws.
 *
 * Needed before `suspendAuxWalletSyncForFees` on any wallet that will do a
 * shielded spend. Master-plan Q2: fee wallets run `syncMode: 'dust-only'`,
 * which keeps the aux wallets running (`stopAuxWalletsImmediately: false`) but
 * stops them the moment *dust* sync completes — however far behind shielded
 * still is. Shielded state is not persisted either, so every start replays it
 * from genesis and truncates it again. `applyShieldedPadding` then spends
 * against that partial state and its failure is swallowed with a warn per
 * transaction, which is how a padding-enabled deployment degrades silently.
 *
 * Returns a boolean rather than throwing because padding is per-input on some
 * targets: a slow shielded sync should be visible and survivable, not fatal to
 * a batcher that may never need padding.
 */
export async function waitForShieldedSyncComplete(
  wallet: WalletFacade,
  timeoutMs: number,
): Promise<boolean> {
  if (timeoutMs <= 0) return false;
  const startedAt = Date.now();
  try {
    await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.filter((s: any) =>
          s?.shielded?.state?.progress?.isStrictlyComplete?.() ?? false
        ),
        Rx.timeout({
          first: timeoutMs,
          with: () => Rx.throwError(() => new Error("shielded sync timeout")),
        }),
      ),
    );
    log.info(
      `Shielded wallet sync complete after ${((Date.now() - startedAt) / 1000).toFixed(0)}s`,
    );
    return true;
  } catch (e) {
    log.warn(
      `Shielded wallet did not finish syncing (${
        e instanceof Error ? e.message : String(e)
      })`,
    );
    return false;
  }
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
 * then polls the dust sub-wallet (heartbeat default 7500ms).
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
    },
): Promise<bigint> {
  log.info("Waiting for dust wallet to sync and receive funds...");

  const options = typeof optionsOrTimeout === 'number'
    ? { timeoutMs: optionsOrTimeout }
    : optionsOrTimeout;

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;
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

  const dustBalance = (await Rx.firstValueFrom(
    sampled$.pipe(
      Rx.tap((ds: unknown) => {
        try {
          const elapsedSec = ((Date.now() - dustSyncStartedAt) / 1000).toFixed(0);
          const at = new Date();
          const p = dustProgressFromState(ds);
          const bal = resolveFacadeDustBalance(ds, at);
          log.info(
            `Dust wallet sync progress (${elapsedSec}s): ` +
              `${p?.appliedIndex ?? "?"}/${p?.highestRelevantWalletIndex ?? "?"} ` +
              `balance=${bal}`,
          );
        } catch {
          /* ignore */
        }
      }),
      Rx.map((ds: unknown) => resolveFacadeDustBalance(ds)),
      Rx.filter((balance: bigint) => !waitNonZero || balance > 0n),
      Rx.timeout({
        first: balanceBudgetMs,
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
/**
 * How long a dust sync attempt waits for a state emission after its indexer
 * socket reported an error, before it counts as stalled.
 *
 * Long enough for the SDK's own reconnect (`Stream.retry`, exponential from
 * 1 s) to land one, short enough that a dead socket does not cost the full
 * 60 s silence budget.
 */
const DUST_SOCKET_FAILURE_GRACE_MS = 5_000;

/**
 * Did this sync attempt move the wallet forward at all?
 *
 * The only honest baseline is where the attempt *started* — the offset it
 * restored from — not "is appliedIndex non-zero". Phase 1 §2 measured why:
 * a wallet restored from a snapshot whose offset is past the indexer's log
 * sits at `appliedIndex === offset` forever, which is non-zero, so `gwi:712`'s
 * `appliedIndex === 0n` check never fired and the useless state was written
 * back to disk on every failed attempt (gwi:707, gwi:721). A snapshot that
 * produced zero progress over a full attempt is worth nothing and must not
 * displace whatever is already stored.
 *
 * A stalled-but-advancing sync is the opposite case and the reason the
 * stall-path save exists at all: 128 -> 5000 means the next attempt resumes
 * 4872 events further along.
 */
export function dustSyncAttemptMadeProgress(
  attemptStartIndex: bigint,
  lastAppliedIndex: bigint,
): boolean {
  return lastAppliedIndex > attemptStartIndex;
}

/**
 * Reject with `stall` once the wallet has gone `silenceMs` without emitting a
 * state — the deadline is rearmed by every emission.
 *
 * This replaces a flat `setTimeout(stallTimeoutMs)` raced against
 * `waitForSyncedState`, which was an absolute deadline on reaching *synced*,
 * not on the wallet going quiet. With the 60 s default and 5 retries that
 * capped total sync at ~5 minutes, against a measured 66-minute preprod cold
 * sync — so a perfectly healthy sync was declared stalled, five times, and
 * wallet init threw. Restarting did not converge either: each attempt only
 * advanced the snapshot by ~60 s of sync.
 *
 * Silence is the signal that actually means "stuck": with
 * `MIDNIGHT_DUST_SYNC_BATCH_SIZE` at 100 and a 1 ms batch timeout, a syncing
 * dust wallet emits constantly, and a wallet whose subscription died emits
 * nothing at all (Phase 1 §2's offset-past-log probe: one emission, then
 * 45 s of nothing).
 *
 * `dispose()` must be called by whoever wins the race — otherwise a timer stays
 * armed on a wallet that already finished and its rejection surfaces as an
 * unhandled one.
 *
 * `nudge(ms)` is how a *known* failure (an indexer socket error) gets a say
 * without a second detector: it re-arms the deadline shorter, so a socket we
 * already know is dead does not get to burn the whole silence budget. It can
 * only ever shorten, and the next emission restores the full budget — because
 * the SDK's sync stream retries on its own, and a blip that recovers must cost
 * nothing. Five blips that each cost an attempt would exhaust the retry budget
 * across a 58-minute cold sync and fail init, which is the failure this project
 * spent Phase 2 removing.
 */
/** A websocket lifecycle event escaping graphql-ws's dangling promise. */
export type WalletSocketEventKind = "close" | "error";

export interface WalletSocketFailure {
  kind: WalletSocketEventKind;
  reason: unknown;
}

/**
 * Is this rejection the indexer websocket's own lifecycle event, or a real bug?
 *
 * Classified by **shape**, deliberately, never by message text: graphql-ws
 * rejects with whatever the socket emitted, and which `WebSocket`
 * implementation is in play decides what that object looks like. What is
 * constant is that it is a DOM-style event — `{ type: "close", code, reason }`
 * or `{ type: "error", message, error }` — and that a real `Error` is never
 * one, so an application error that happens to carry a `type` field stays
 * fatal. See the top-of-file handler for why the exemption exists at all.
 */
export function classifyWalletSocketRejection(reason: unknown): WalletSocketEventKind | null {
  if (reason === null || typeof reason !== "object") return null;
  if (reason instanceof Error) return null;
  const type = (reason as { type?: unknown }).type;
  return type === "close" || type === "error" ? type : null;
}

/** A one-line description of a socket event, for logs. */
export function describeWalletSocketRejection(reason: unknown): string {
  const r = reason as
    | { message?: unknown; code?: unknown; reason?: unknown; type?: unknown }
    | null
    | undefined;
  if (typeof r?.message === "string" && r.message !== "") return r.message;
  if (r?.code !== undefined) {
    const detail = typeof r.reason === "string" && r.reason !== "" ? ` ${r.reason}` : "";
    return `code ${String(r.code)}${detail}`;
  }
  return String(r?.type ?? reason);
}

const walletSocketFailureListeners = new Set<(failure: WalletSocketFailure) => void>();

/**
 * Listen for indexer socket failures for as long as you are the one syncing;
 * the returned function unsubscribes.
 *
 * This is the seam that replaces killing the process. The rejection arrives
 * with no call stack leading back to the wallet whose socket died — it is a
 * promise nobody awaited — so the wallet cannot be found from the failure and
 * has to announce itself instead.
 *
 * With nobody listening a socket error is logged and dropped, which is the
 * right steady-state behaviour: after init the SDK's own sync stream reconnects
 * and there is no attempt to fail.
 *
 * Delivery is to **every** listener, and that is a limitation worth knowing
 * rather than a design goal. The batcher initialises its fee wallets
 * concurrently (`Promise.all` over the seeds in the balancing adapter), so
 * several attempts listen at once, and one wallet's socket error nudges all of
 * their deadlines. It cannot be narrowed here: the rejection has no wallet
 * identity to route on. It is safe in practice — a syncing dust wallet emits
 * constantly at the shipped batch knobs, so a healthy wallet's next emission
 * restores its full budget within milliseconds; a wallet quiet enough for the
 * nudge to bite would have stalled anyway, and its retry resumes from the
 * checkpoint; and every one of these sockets points at the same indexer, so a
 * failure there is rarely one wallet's alone.
 */
export function onWalletSocketFailure(listener: (failure: WalletSocketFailure) => void): () => void {
  walletSocketFailureListeners.add(listener);
  return () => {
    walletSocketFailureListeners.delete(listener);
  };
}

/** Deliver a socket failure to every listener; returns how many took it. */
export function reportWalletSocketFailure(kind: WalletSocketEventKind, reason: unknown): number {
  let delivered = 0;
  for (const listener of [...walletSocketFailureListeners]) {
    try {
      listener({ kind, reason });
      delivered++;
    } catch (e) {
      // This runs inside an unhandled-rejection handler. A throw escaping here
      // is the exact failure mode the whole path exists to remove.
      log.warn(
        `Wallet socket failure listener threw: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return delivered;
}

export function rejectOnDustSyncSilence(
  state$: Rx.Observable<unknown>,
  silenceMs: number,
): { promise: Promise<never>; dispose: () => void; nudge: (ms: number) => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscription: Rx.Subscription | undefined;
  let done = false;
  const dispose = (): void => {
    done = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    subscription?.unsubscribe();
    subscription = undefined;
  };
  let arm: (ms: number) => void = () => {};
  const promise = new Promise<never>((_resolve, reject) => {
    arm = (ms: number): void => {
      if (done) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        dispose();
        reject(new Error("stall"));
      }, ms);
    };
    arm(silenceMs);
    subscription = state$.subscribe({ next: () => arm(silenceMs) });
  });
  return {
    promise,
    dispose,
    nudge: (ms: number) => arm(Math.min(Math.max(0, ms), silenceMs)),
  };
}

/**
 * Is this a well-formed snapshot whose `offset` sits past the end of the
 * indexer's event log? Then it is not a stall to retry — it is a snapshot to
 * throw away.
 *
 * `Sync.ts:271-303` opens the subscription at the inclusive cursor
 * `appliedIndex - 1`, which re-delivers the boundary event and is what flips
 * `isConnected` (`SyncProgress.ts:48` defaults it false and it is not
 * serialized). If the cursor is past the end — a named-network reset, an
 * indexer rollback or re-index — no event ever arrives, so the wallet sits at
 * `appliedIndex === offset`, `highestRelevantWalletIndex === 0`, never
 * connected, forever. Phase 1 §2 reproduced exactly that by tampering an
 * offset to 999999 and watching a 45 s window pass with one emission.
 *
 * Retrying cannot help, because retrying restores the same bytes: `gwi:640`'s
 * "nothing to sync" escape and `gwi:712`'s state-discard both require
 * `appliedIndex === 0n`, which a restored wallet never satisfies.
 *
 * Every clause is a guard against discarding a snapshot that is merely slow —
 * on preprod that mistake costs ~66 min of resync:
 * - `restoredFromOffset > 0` — there is a snapshot to blame at all;
 * - no progress — one applied event proves the cursor is inside the log;
 * - `highestRelevantWalletIndex === 0` — a target index only appears once the
 *   indexer delivered something;
 * - not connected — a connected wallet is syncing, however slowly.
 */
export function isSnapshotOffsetPastLog(progress: {
  restoredFromOffset: bigint;
  appliedIndex: bigint;
  highestRelevantWalletIndex: bigint;
  isConnected: boolean;
}): boolean {
  return (
    progress.restoredFromOffset > 0n &&
    progress.appliedIndex <= progress.restoredFromOffset &&
    progress.highestRelevantWalletIndex === 0n &&
    !progress.isConnected
  );
}

export interface DustSyncWithRetryOptions {
  networkUrls: Required<NetworkUrls>;
  seed: string;
  networkId: NetworkId.NetworkId;
  /** Per-emission stall timeout in ms. Default: 60_000 (1 minute). */
  stallTimeoutMs?: number;
  /**
   * Grace period after an indexer socket error before the attempt counts as
   * stalled. Default: {@link DUST_SOCKET_FAILURE_GRACE_MS} (5 s). Only ever
   * shortens the stall deadline, and a state emission restores it in full.
   */
  socketFailureGraceMs?: number;
  /**
   * Override for {@link buildWalletFacade}.
   *
   * Exists so the retry loop can be driven without a chain: the property that
   * matters after a socket failure is that the *next attempt is built*, and
   * every other seam in this function ends at a real wallet facade. Production
   * callers should leave it alone.
   */
  buildWallet?: typeof buildWalletFacade;
  /**
   * How long to wait for a non-zero façade dust balance after dust sync.
   * Default: {@link resolveWalletFundingTimeoutMs} (not `stallTimeoutMs`, and
   * deliberately not the sync timeout — see the constant's docstring).
   */
  balanceWaitTimeoutMs?: number;
  /** Maximum retry attempts on stall. Default: 5. */
  maxRetries?: number;
  /** Throttle interval for state emissions in ms. Default: 10_000 (10s). */
  throttleMs?: number;
  syncMode?: WalletSyncMode;
  /** Base directory for dust state files (relative to CWD). Default: "dust-state". */
  dustStateDir?: string;
  /**
   * Called (throttled) with each sync-progress sample while the wallet catches
   * up. Init is the window where the difference between "syncing" and "stuck"
   * matters most and is least visible — a preprod cold sync takes ~66 minutes,
   * during which the caller otherwise knows only that the wallet is not ready
   * yet.
   */
  onSyncProgress?: (sample: DustSyncProgressSample) => void;
  /**
   * Wait for the shielded sub-wallet to finish syncing before suspending it.
   * Set this whenever the wallet will make a shielded spend (the batcher's
   * shielded padding): dust-only mode otherwise stops shielded the moment DUST
   * sync completes, leaving a partially replayed shielded state that padding
   * silently fails against. Costs whatever shielded sync still needs; skip it
   * when nothing will spend shielded coins. Default: false.
   */
  requireShieldedSync?: boolean;
  /**
   * Deadline for {@link requireShieldedSync}. Default:
   * {@link resolveWalletSyncTimeoutMs}. Exceeding it is logged, not fatal.
   */
  shieldedSyncTimeoutMs?: number;
}

/** One throttled observation of a dust wallet catching up. */
export interface DustSyncProgressSample {
  /** 1-based retry attempt this sample came from. */
  attempt: number;
  /** Offset this attempt resumed from; 0 for a cold sync. */
  restoredFromOffset: bigint;
  appliedIndex: bigint;
  highestRelevantWalletIndex: bigint;
  isConnected: boolean;
  /** True once a snapshot has been rejected and this wallet is cold-syncing. */
  snapshotRejected: boolean;
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
    socketFailureGraceMs = DUST_SOCKET_FAILURE_GRACE_MS,
    buildWallet = buildWalletFacade,
    balanceWaitTimeoutMs = resolveWalletFundingTimeoutMs(),
    maxRetries = DUST_MAX_RETRIES,
    throttleMs = CONSTANTS.WALLET_SYNC_THROTTLE_MS,
    syncMode = 'dust-only',
    dustStateDir = DEFAULT_DUST_STATE_DIR,
    onSyncProgress,
    requireShieldedSync = false,
    shieldedSyncTimeoutMs = resolveWalletSyncTimeoutMs(),
  } = options;

  const networkIdStr = String(networkId);

  // Lazy import keeps node:fs out of the browser's static graph — this retry
  // flow is node-side (long-running dust sync with disk caching), while the
  // module as a whole is bundled for browsers via `./wallet-info`.
  const {
    loadDustState,
    saveDustState,
    getDustStatePath,
    quarantineDustState,
    readDustSnapshotFacts,
  } = await import("./dust-state.ts");

  // Pre-load cached state from disk before building any wallet.
  // Uses seed-based path so we don't need the dust address yet.
  // `loadDustState` already refuses anything malformed, from another network,
  // or belonging to another wallet, so a non-null value here is at worst
  // *stale*, never unparseable.
  const persistOptions = { expectedPublicKey: deriveDustPublicKey(seed).toString() };
  let cachedState: string | null = loadDustState(
    dustStateDir,
    networkIdStr,
    seed,
    persistOptions,
  );
  if (cachedState) {
    log.info(`Loaded cached dust state from disk (${getDustStatePath(dustStateDir, networkIdStr, seed)})`);
  }
  let inMemoryState: string | null = null;

  /**
   * A snapshot proved unusable at restore time. Drop it from both places it
   * could come back from, and move the file aside so a restart does not walk
   * into the same failure — otherwise the cold sync we just paid for is
   * repeated on every start.
   */
  let snapshotRejected = false;
  function discardSnapshot(reason: string): void {
    inMemoryState = null;
    snapshotRejected = true;
    if (cachedState) {
      cachedState = null;
      quarantineDustState(dustStateDir, networkIdStr, seed, reason);
    }
  }

  // Helper to serialize and save dust state
  async function serializeAndSave(wr: WalletResult): Promise<string | null> {
    try {

      const serialized: string = await (wr.wallet as any).dust.serializeState();
      inMemoryState = serialized;
      saveDustState(dustStateDir, networkIdStr, seed, serialized, persistOptions);
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

  /** Where the wallet already was when this attempt began; see {@link dustSyncAttemptMadeProgress}. */
  async function readDustAppliedIndex(wr: WalletResult): Promise<bigint> {
    try {
      const ds = await getInitialDustState(
        (wr.wallet as any).dust as { state: Rx.Observable<unknown> },
        { timeoutMs: 30_000 },
      );
      return dustProgressFromState(ds)?.appliedIndex ?? 0n;
    } catch {
      return 0n;
    }
  }

  // Build or reuse wallet
  let walletResult = existingWalletResult ?? null;

  let dustSyncedState: any = null;
  let lastAppliedIndex = 0n;
  let attemptStartIndex = 0n;
  /** Progress as of the last stall on this attempt; null if never read. */
  let lastProgress: ReturnType<typeof dustProgressFromState> = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastAppliedIndex = 0n;
    attemptStartIndex = 0n;
    lastProgress = null;
    let progressSub: Rx.Subscription | undefined;
    /** The silence detector guarding this attempt's wait, while it is waiting. */
    let activeSilence: { nudge: (ms: number) => void } | null = null;
    // A dead indexer socket used to end the process before this loop could
    // retry (Phase 3 §2.1 run 1). It is now delivered here instead: the attempt
    // stops waiting out the full silence budget for a socket that already
    // failed, and if the SDK reconnects, the next emission restores the budget
    // and the nudge costs nothing.
    const offSocketFailure = onWalletSocketFailure((failure) => {
      if (failure.kind !== "error") return;
      log.warn(
        `Dust sync attempt ${attempt}/${maxRetries}: indexer websocket failed ` +
          `(${describeWalletSocketRejection(failure.reason)}). Allowing ` +
          `${socketFailureGraceMs}ms for another state emission before treating ` +
          `this attempt as stalled.`,
      );
      activeSilence?.nudge(socketFailureGraceMs);
    });
    try {
      if (!walletResult) {
        const stateToRestore = inMemoryState ?? cachedState;
        // Progress this attempt is measured against the offset we resume from.
        // A rejected snapshot resets this to 0 below, because the wallet then
        // cold-starts and genuinely does begin at genesis.
        attemptStartIndex = stateToRestore
          ? (readDustSnapshotFacts(stateToRestore)?.offset ?? 0n)
          : 0n;
        if (attempt > 1) {
          if (stateToRestore) {
            log.info(`Retry ${attempt}/${maxRetries}: rebuilding wallet from ${inMemoryState ? 'in-memory' : 'cached'} state...`);
          } else {
            log.info(`Retry ${attempt}/${maxRetries}: rebuilding wallet from scratch...`);
          }
        } else if (stateToRestore) {
          log.info("Building wallet from cached dust state...");
        }
        walletResult = await buildWallet(
          networkUrls,
          seed,
          networkId,
          syncMode,
          stateToRestore,
          {
            stopAuxWalletsImmediately: syncMode !== 'dust-only',
            onSnapshotRejected: (reason) => {
              discardSnapshot(reason);
              attemptStartIndex = 0n;
            },
          },
        );
      } else if (attempt === 1) {
        // A wallet handed in by the caller is already somewhere; progress has
        // to be measured from there, not from zero.
        attemptStartIndex = await readDustAppliedIndex(walletResult);
      }


      const dustWallet = (walletResult.wallet as any).dust;
      if (!dustWallet || !dustWallet.state) {
        log.warn("Dust wallet state not available; skipping dust sync.");
        return { walletResult, dustBalance: 0n };
      }

      // Report progress while the wallet catches up. Init is the window where
      // "syncing" and "stuck" look identical from outside and where the
      // difference is measured in hours.
      if (onSyncProgress) {
        progressSub = (dustWallet.state as Rx.Observable<unknown>)
          .pipe(Rx.throttleTime(1_000, undefined, { leading: true, trailing: true }))
          .subscribe((ds) => {
            const p = dustProgressFromState(ds);
            if (!p) return;
            onSyncProgress({
              attempt,
              restoredFromOffset: attemptStartIndex,
              appliedIndex: p.appliedIndex,
              highestRelevantWalletIndex: p.highestRelevantWalletIndex,
              isConnected: p.isConnected,
              snapshotRejected,
            });
          });
      }

      // First, try the SDK's built-in waitForSyncedState with DUST_COMPLETION_GAP.
      // This handles the common case (mainnet/testnet with blocks to sync).
      // If it throws (timeout or no sync events), fall back to reading the
      // current state directly — on fresh chains with no dust activity,
      // the wallet has nothing to sync and waitForSyncedState would hang forever.
      const syncStartedAt = Date.now();
      try {
        if (typeof dustWallet.waitForSyncedState === "function") {
          // Silence, not elapsed time: a long cold sync emits constantly and
          // must be allowed to finish, however many hours it takes.
          const silence = rejectOnDustSyncSilence(
            dustWallet.state as Rx.Observable<unknown>,
            stallTimeoutMs,
          );
          activeSilence = silence;
          try {
            dustSyncedState = await Promise.race([
              dustWallet.waitForSyncedState(DUST_COMPLETION_GAP),
              silence.promise,
            ]);
          } finally {
            activeSilence = null;
            silence.dispose();
          }
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
        lastProgress = dustProgressFromState(currentState);

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
      let dustBalance = 0n;
      try {
        dustBalance = await waitForDustFunds(walletResult!.wallet, {
          timeoutMs: balanceWaitTimeoutMs,
          waitNonZero: true,
        });
      } catch {
        // ignore — will return 0n
      }

      log.info(`Dust sync complete (attempt ${attempt}). Balance: ${dustBalance}`);

      if (dustBalance === 0n) {
        log.info("No dust after sync; attempting unshielded NIGHT registration...");
        try {
          if (await registerNightForDust(walletResult!)) {
            dustBalance = await waitForDustFunds(walletResult!.wallet, {
              timeoutMs: balanceWaitTimeoutMs,
              waitNonZero: true,
            });
            log.info(`Dust balance after registration: ${dustBalance}`);
          }
        } catch (e) {
          log.warn(
            `NIGHT→dust registration failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      if (dustBalance === 0n) {
        log.warn("Dust balance still 0 — wallet needs dust or unshielded NIGHT to register.");
      }

      if (syncMode === 'dust-only') {
        // Dust-only stops shielded the moment DUST is done. A wallet that will
        // spend shielded coins needs its shielded state whole first, or the
        // spend fails against a half-replayed one.
        if (requireShieldedSync) {
          log.info("Waiting for shielded sync before suspending aux wallets (padding enabled)...");
          const complete = await waitForShieldedSyncComplete(
            walletResult!.wallet,
            shieldedSyncTimeoutMs,
          );
          if (!complete) {
            log.error(
              "Shielded wallet is still behind and is being suspended anyway. " +
                "Shielded padding will fail for this wallet until it is restarted " +
                "with more time to sync.",
            );
          }
        }
        await suspendAuxWalletSyncForFees(walletResult!.wallet);
      }

      // Save final state to disk
      await serializeAndSave(walletResult);

      return { walletResult, dustBalance };
    } catch (e) {
      const isStall = e instanceof Error && e.message === "stall";
      // A failed attempt may only write back state that moved forward. Phase 1
      // §2 measured the alternative: a wallet frozen at a snapshot offset past
      // the indexer's log was re-persisted on every failed attempt, so the
      // outage survived restarts.
      const madeProgress = dustSyncAttemptMadeProgress(attemptStartIndex, lastAppliedIndex);
      if (!madeProgress) {
        log.warn(
          `Dust sync attempt ${attempt}/${maxRetries} applied no new events ` +
            `(stuck at ${lastAppliedIndex}); refusing to persist that state.`,
        );
      }

      // A snapshot whose offset is past the indexer's log is not a stall to
      // retry — retrying restores the same bytes and fails identically, five
      // times, and (before this) re-persisted them each time. Throw it away and
      // let the next attempt sync from genesis.
      if (
        isStall && lastProgress &&
        isSnapshotOffsetPastLog({
          restoredFromOffset: attemptStartIndex,
          appliedIndex: lastProgress.appliedIndex,
          highestRelevantWalletIndex: lastProgress.highestRelevantWalletIndex,
          isConnected: lastProgress.isConnected,
        })
      ) {
        log.error(
          `Dust snapshot offset ${attemptStartIndex} is past the end of the indexer's ` +
            `event log (no events delivered, never connected). The chain was reset, ` +
            `rolled back or re-indexed. Discarding the snapshot and syncing from genesis.`,
        );
        discardSnapshot(`offset ${attemptStartIndex} past the indexer's event log`);
        await stopWallet(walletResult);
        walletResult = null;
        if (attempt < maxRetries) continue;
      }

      if (isStall && attempt < maxRetries) {
        log.warn(`Dust sync stalled on attempt ${attempt}/${maxRetries}. Stopping wallet and rebuilding from state...`);
        if (walletResult) {
          if (madeProgress) await serializeAndSave(walletResult);
          await stopWallet(walletResult);
          walletResult = null;
        }
        // State that produced nothing must not be restored again either —
        // otherwise the next attempt repeats this one exactly.
        if (!madeProgress) {
          log.warn("No sync progress was made, discarding in-memory state for clean rebuild");
          inMemoryState = null;
        }
        continue;
      }

      // Non-stall error or final attempt — checkpoint real progress and throw
      if (walletResult && madeProgress) {
        await serializeAndSave(walletResult);
      }

      if (isStall) {
        throw new Error(
          `Dust wallet sync stalled after ${maxRetries} attempts. ` +
          `Each attempt waited ${stallTimeoutMs}ms for new state emissions.`,
        );
      }
      throw e;
    } finally {
      // Per attempt: the next one rebuilds the wallet, and a subscription left
      // on a stopped facade both leaks and reports progress that stopped being
      // this wallet's. The socket listener goes the same way — a stale one
      // would nudge a later attempt's detector on behalf of a wallet that no
      // longer exists.
      offSocketFailure();
      progressSub?.unsubscribe();
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
      TransactionHistoryStorage.TransactionHistoryCommonSchema,
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

/**
 * Restore a dust wallet from a snapshot, or cold-start it if the snapshot will
 * not decode. Never throws on account of the snapshot.
 *
 * `DustWallet.restore` decodes with `Either.getOrThrow`
 * (`DustWallet.ts:295-300`), so a truncated file — or any snapshot written
 * before a `@midnight-ntwrk/ledger-v8` bump, since the format carries no
 * version envelope (master-plan Q4) — throws synchronously out of wallet
 * construction. Phase 1 §2 measured the consequence: the throw escapes
 * `buildWalletFacade`, `waitForDustFundsWithRetry` treats it as a non-stall
 * error and rethrows without ever rebuilding from scratch, and wallet init
 * stays broken until an operator deletes the file. A cold sync is expensive;
 * a bricked batcher is worse.
 *
 * Kept as a standalone decision so the fallback fires for a *decode* failure
 * and nothing else — wrapping the whole facade build would also swallow
 * indexer and proof-server errors and throw away a good snapshot (and ~66 min
 * of preprod resync) on a transient outage.
 *
 * `onSnapshotRejected` is how the caller learns the snapshot must not be
 * reused: it stops the retry loop from restoring the same bytes again and
 * moves the file aside.
 */
export function restoreDustWalletWithColdSyncFallback<W>(
  serializedState: string | null | undefined,
  restore: (serializedState: string) => W,
  coldStart: () => W,
  onSnapshotRejected?: (reason: string) => void,
): W {
  if (serializedState) {
    try {
      log.info("Restoring dust wallet from cached state");
      return restore(serializedState);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      log.error(
        `Dust snapshot could not be restored (${reason}). Falling back to a full sync ` +
          `from genesis — this can take a long time on a real network.`,
      );
      onSnapshotRejected?.(reason);
    }
  }
  return coldStart();
}

function buildDustWallet(
  config: DefaultConfiguration,
  seed: Uint8Array,
  serializedState?: string | null,
  onSnapshotRejected?: (reason: string) => void,
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
  return restoreDustWalletWithColdSyncFallback(
    serializedState,
    (state) => DustWallet(dustConfig as any).restore(state),
    () =>
      DustWallet(dustConfig as any).startWithSeed(
        seed,
        LedgerParameters.initialParameters().dust,
      ),
    onSnapshotRejected,
  );
}

function buildUnshieldedWallet(
  config: DefaultConfiguration,
  keystore: UnshieldedKeystore,
) {
  return UnshieldedWallet({
    ...config,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(
      TransactionHistoryStorage.TransactionHistoryCommonSchema,
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
  options?: {
    stopAuxWalletsImmediately?: boolean;
    /**
     * Called when `dustSerializedState` could not be decoded and the dust
     * wallet cold-started instead. The caller owns what happens next — at
     * minimum it must stop reusing those bytes.
     */
    onSnapshotRejected?: (reason: string) => void;
  },
): Promise<WalletResult> {
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const config = createWalletConfiguration(networkUrls, networkId);

  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);

  const shieldedWallet = buildShieldedWallet(config, shieldedSeed);
  const dustWallet = buildDustWallet(
    config,
    dustSeed,
    dustSerializedState,
    options?.onSnapshotRejected,
  );
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

  const stopAuxNow =
    syncMode === 'dust-only' && (options?.stopAuxWalletsImmediately ?? true);
  if (stopAuxNow) {
    await suspendAuxWalletSyncForFees(wallet);
  }

  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();
  const dustState = await getInitialDustState(wallet.dust as { state: Rx.Observable<unknown> });
  const dustAddress = MidnightBech32m.encode(
    networkId,
    (dustState as { address: unknown }).address,
  ).asString();

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
   * ({@link resolveDustRegistrationPrecheckTimeoutMs}, 10 min) is correct when
   * the wallet has an active unshielded subscription. Callers that built the
   * wallet with `syncMode: 'dust-only'` should pass a small value (e.g. 30s) —
   * the unshielded sync is stopped, so this wait can never succeed and the
   * full timeout is wasted.
   */
  precheckSyncTimeoutMs?: number;
}

/**
 * Register unshielded Night UTXOs for dust generation
 * This is required before the wallet can pay transaction fees
 *
 * Returns false on every failure, including a precheck timeout. That last one
 * used to escape as an exception because the precheck sat outside the
 * function's own try/catch — one failure mode out of several behaving
 * differently from the boolean the signature promises, so callers that trusted
 * the return value skipped their handling for exactly the case a stopped
 * unshielded sub-wallet produces.
 */
export async function registerNightForDust(
  walletResult: WalletResult,
  options?: RegisterNightForDustOptions,
): Promise<boolean> {
  log.info("Checking for unshielded Night UTXOs to register for dust generation...");

  try {
    const state = await Rx.firstValueFrom(
      walletResult.wallet.state().pipe(
        Rx.filter((s: any) => {
          const dustSynced = s.dust?.state?.progress?.isStrictlyComplete() ?? false;
          const unshieldedSynced = s.unshielded?.progress?.isStrictlyComplete() ?? false;
          return dustSynced && unshieldedSynced;
        }),
        Rx.timeout({
          each: options?.precheckSyncTimeoutMs ?? resolveDustRegistrationPrecheckTimeoutMs(),
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

    const recipe = await (walletResult.wallet as any).registerNightUtxosForDustGeneration(
      unregisteredNightUtxos,
      walletResult.unshieldedKeystore.getPublicKey(),
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload)
    );

    log.info("Submitting dust registration transaction...");
    const txId = await walletResult.wallet.submitTransaction(
      await (walletResult.wallet as any).finalizeRecipe(recipe),
    );
    log.info(`Dust registration submitted with tx id: ${txId}`);

    log.info("Waiting for dust to be generated...");
    await waitForDustFunds(walletResult.wallet, {
      waitNonZero: true,
      timeoutMs: resolveWalletFundingTimeoutMs(),
    });

    log.info("Dust registration complete!");
    return true;
  } catch (e) {
    log.error(`Failed to register Night UTXOs for dust: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

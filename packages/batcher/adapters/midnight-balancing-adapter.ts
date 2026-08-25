// Midnight balancing adapter for the EffectStream batcher
// Handles delegated balancing (Party B) where unproven transactions are received,
// balanced with filler funds, proved, and submitted.
//
// Architecture: worker pool with per-wallet balance mutex.
//
// Each worker = {wallet, UTXO-slot} — an independent processing unit.
// Workers run their tx pipeline in parallel:
//
//   pre-spend gate → acquire balance lock → balance → release lock
//     → prove/finalize → submit
//
// The balance lock serializes balance calls within the same wallet
// (speculative chaining requires sequential dust allocation). Prove,
// finalize, and submit overlap freely — including with other workers'
// balance phase on the same wallet, enabling deep pipelining.
//
// Worker selection:
//   1. Prefer wallets with the fewest busy workers (maximize wallet spread)
//   2. Tiebreak: lowest usage count (balance load)

import type {
  BatchBuildingOptions,
  BatchBuildingResult,
  BatchInputDeferral,
  BatchInputFailure,
  BatchInputRejection,
  BatchInvariantFailure,
  BatchOutcome,
  BatchSubmitResult,
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
} from "./adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import {
  type FinalizedTransaction,
  Transaction as LedgerTransaction,
  type UnprovenTransaction,
} from "@midnight-ntwrk/ledger-v8";
import { fromHex } from "@midnight-ntwrk/midnight-js-utils";
import type {
  PublicDataProvider,
  UnboundTransaction,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  BalancingRecipe,
  ShieldedTokenTransfer,
} from "@midnightntwrk/wallet-sdk-facade";
import {
  type DustStateAutosaveHandle,
  dustProgressFromState,
  getInitialDustState,
  getInitialShieldedState,
  type NetworkUrls,
  registerNightForDust,
  resolveDustCoinValuesAt,
  resolveFacadeDustBalance,
  resolveWalletSyncTimeoutMs,
  startDustStateAutosave,
  suspendAuxWalletSyncForFees,
  waitForDustFunds,
  waitForShieldedSyncComplete,
  waitForDustFundsWithRetry,
  type WalletResult,
} from "@effectstream/midnight-contracts";
import * as Rx from "rxjs";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { NetworkId as WalletNetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { AdapterLogger } from "./adapter-logger.ts";
import { WorkerPool } from "./worker-pool.ts";
import {
  contractActions,
  evaluatePolicy,
  isPolicyEnforced,
  type MidnightTxPolicy,
  type PolicyInspectableTx,
  type PolicyVerdict,
} from "./midnight-policy.ts";
import {
  admissionWeight,
  checkShapeLimits,
  DEFAULT_SHAPE_LIMITS,
  type ShapeLimits,
} from "./shape-limits.ts";
import {
  LedgerParamsCache,
  type LedgerParamsCacheConfig,
  type LedgerParamsLookup,
} from "./ledger-params-cache.ts";
import {
  checkTtlMargin,
  type WellFormedVerdict,
} from "./midnight-tx-validation.ts";
import {
  acquireValidationExecutor,
  type ValidationExecutorHandle,
  type ValidationJob,
} from "./validation-executor.ts";
import {
  midnightReplayKey,
  type ReplayIdentifiableTx,
} from "./midnight-replay-key.ts";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Config & types
// ---------------------------------------------------------------------------

/** A wallet's dust sync as last observed. Cached; never re-read on demand. */
export interface DustSyncSample {
  appliedIndex: bigint;
  /** Highest index the indexer told us about; 0 when it has told us nothing. */
  target: bigint;
  isConnected: boolean;
  /** When this sample was taken. */
  updatedAtMs: number;
  /** When `appliedIndex` last increased. */
  advancedAtMs: number;
}

export type DustSyncState = "syncing" | "stalled" | "complete" | "unknown";

/**
 * Is this wallet syncing, stuck, or done?
 *
 * A dust cold sync takes ~66 minutes on preprod, during which health info said
 * only `walletsReady: 0` — indistinguishable from a wallet whose snapshot
 * offset is past the indexer's event log and which will never start at all.
 * Both look like a hang; one wants patience and the other wants the snapshot
 * deleted.
 *
 * Order matters. Completeness is checked first because a caught-up wallet stops
 * emitting: ageing it into "stalled" would page someone for a healthy batcher.
 * `isConnected` is part of that check — the offset-past-log failure sits at a
 * high `appliedIndex` with a target of 0, which would otherwise satisfy
 * `applied >= target`.
 */
export function classifyDustSyncState(
  sample: DustSyncSample | null | undefined,
  nowMs: number,
  stalledAfterMs: number,
): DustSyncState {
  if (!sample) return "unknown";
  if (sample.isConnected && sample.appliedIndex >= sample.target) return "complete";
  return nowMs - sample.advancedAtMs > stalledAfterMs ? "stalled" : "syncing";
}

export interface MidnightBalancingAdapterConfig {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  walletNetworkId?: WalletNetworkId.NetworkId;
  walletFundingTimeoutSeconds?: number;
  walletResult?: WalletResult | Promise<WalletResult>;
  syncProtocolName?: string;
  addShieldedPadding?: boolean;
  // Token type ID used for the shielded self-transfer padding. Required when addShieldedPadding is true.
  // **NOTE for development:** "0000000000000000000000000000000000000000000000000000000000000000" can be used for undeployed + genesis wallet.
  shieldedPaddingTokenID?: string;
  // Maximum number of worker slots (concurrent txs) per wallet. Defaults to 1.
  // Regardless of how many dust UTXOs a wallet has, at most this many will be used in parallel.
  maxSlotsPerWallet?: number;
  // How long to wait for a spendable dust coin before letting the balance
  // attempt proceed (and likely fail + re-queue). Defaults to 60s.
  dustWaitTimeoutMs?: number;
  /**
   * Minimum TTL remaining at the true spend boundary. The dust wait is already
   * over when this is checked, so the default covers only proving plus the
   * submit timeout. Override per target when its proving budget differs.
   */
  minTtlRemainingMs?: number;
  // A dust coin only counts as spendable when its GENERATED value covers the
  // wallet's fee + per-coin overhead margin. Defaults to 1.5 × the 0.3 DUST
  // overhead (coins exist with ~0 generated value right after creation — a
  // bare `availableCoins.length > 0` check passes while balancing is doomed).
  minSpendableDustPerCoin?: bigint;
  /**
   * Directory for dust state snapshots, relative to CWD. Defaults to
   * `dust-state`. One file per (network, seed); restoring one is what turns a
   * multi-hour restart back into seconds.
   */
  dustStateDir?: string;
  /**
   * How often each wallet checkpoints its dust state while running. Defaults to
   * `MIDNIGHT_DUST_STATE_SAVE_INTERVAL_MS` (5 minutes); 0 keeps only the
   * shutdown checkpoint. Bounds how much chain a crash makes the batcher
   * replay — before this, state was written during init and never again, so a
   * week of uptime meant a week of replay.
   */
  dustStateSaveIntervalMs?: number;
  // Reject inputs whose serialized payload exceeds this many characters at
  // intake (pre-queue). Defaults to 500k chars (~250 KB of tx bytes) — well
  // above any legitimate balanced+padded tx, well below abuse territory.
  maxInputChars?: number;
  /**
   * Content-based authorization for this target (multi-product batchers).
   * Declares WHICH transactions this product may submit — pure transfers,
   * calls to allowlisted contracts/circuits — plus an optional custom final
   * filter. Omit for allow-all (single-product / back-compatible behavior).
   *
   * Enforced at intake (validateInput → 400) and re-checked pre-spend
   * (storage rows are untrusted and policy can change across a restart).
   * See `./midnight-policy.ts` for the helpers custom filters should use.
   */
  policy?: MidnightTxPolicy<DelegatedTx>;
  /**
   * Structural ceilings on a submitted transaction. Bounds the verification
   * WORK a caller can ask for, which `maxInputChars` cannot: a 46-output and a
   * 1-output transfer both fit under the size cap while costing ~2.21 s and
   * ~128 ms of unconditional zswap proof verification.
   *
   * Defaults to {@link DEFAULT_SHAPE_LIMITS} rather than "off", because a
   * ceiling that only protects operators who already knew to set it is not
   * protecting the people it is for. Raise it per product if a legitimate
   * workload needs more; pass `{}` to disable enforcement deliberately.
   */
  shapeLimits?: ShapeLimits;
  /**
   * Live ledger parameters, needed to validate a transaction against the
   * network's actual limits and pricing rather than a build-time snapshot.
   *
   * The cache refreshes in the background and `get()` never performs I/O, so a
   * request path can never trigger a network call. When it has no usable
   * parameters the adapter fails CLOSED — 503 at intake, park at pre-spend —
   * because validating against parameters we know to be wrong is worse than
   * admitting we cannot validate.
   *
   * `indexer` defaults to this adapter's own indexer URL.
   */
  ledgerParams?: Partial<LedgerParamsCacheConfig>;
  /**
   * Log label for this adapter instance, e.g. the product name. Defaults to
   * "balancing". In a multi-product process this is what makes each product's
   * lines distinguishable: `[balancing:product-a] …`.
   */
  logLabel?: string;
}

const TTL_DURATION_MS = 60 * 60 * 1000;
const SUBMIT_TX_TIMEOUT_MS = 90 * 1000;
// Provisional budget for prove/finalize work still ahead at the spend boundary.
const PROVE_ALLOWANCE_MS = 30_000;
const SPECKS_PER_DUST = 1_000_000_000_000_000n; // 1 DUST = 10^15 Specks
const DUST_REGISTRATION_PRECHECK_TIMEOUT_MS = 60_000;
// Wallet-side per-coin fee margin (additionalFeeOverhead) is 0.3 DUST; a coin
// below that generated value cannot be selected by the SDK's balancer.
const DUST_FEE_OVERHEAD_SPECKS = 300_000_000_000_000n;
const DEFAULT_MIN_SPENDABLE_DUST = (DUST_FEE_OVERHEAD_SPECKS * 3n) / 2n;
const DEFAULT_MAX_INPUT_CHARS = 500_000;
/**
 * How many derived replay keys to remember between `validateInput` and
 * `getReplayKey`.
 *
 * Only needs to span the gap between those two calls for concurrently accepted
 * inputs, so this is generous by orders of magnitude; it is a bound, not a
 * cache-hit target. Each entry is two 64-char hex strings.
 */
const REPLAY_KEY_MEMO_LIMIT = 1_024;
/** Throttle for background dust-state refreshes triggered by capacity checks. */
const DUST_REFRESH_THROTTLE_MS = 5_000;
/**
 * How long a wallet may go without applying a dust event before health info
 * calls it stalled rather than syncing. Matches the wallet's own stall timeout,
 * so the two agree about what "stuck" means.
 */
const DUST_SYNC_STALLED_AFTER_MS = 60_000;

/** Cached dust sync position for one wallet, plus where its restore resumed from. */
interface WalletDustSyncHealth extends DustSyncSample {
  /** Snapshot offset this wallet resumed from; 0 for a full cold sync. */
  restoredFromOffset: bigint;
  /** True when a snapshot was rejected and this wallet cold-synced instead. */
  snapshotRejected: boolean;
}
const createTtl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

/** A deterministic pre-spend verdict: remove the row and charge no retry. */
export class PreSpendPermanent extends Error {
  constructor(
    readonly error: string,
    readonly errorCode?: string,
    readonly statusCode: number = 400,
  ) {
    super(error);
    this.name = "PreSpendPermanent";
  }
}

/** The gate could not reach a verdict: leave the row and charge no retry. */
export class PreSpendDefer extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "PreSpendDefer";
  }
}

/** Our finalized output broke an invariant: retain the row and pause. */
export class PreSubmitInvariant extends Error {
  constructor(
    message: string,
    readonly errorCode: string = "PRE_SUBMIT_INVARIANT",
    readonly hardPause: boolean = false,
  ) {
    super(message);
    this.name = "PreSubmitInvariant";
  }
}

export type WorkerFailureClassification<TInput extends DefaultBatcherInput> =
  | { category: "permanentRejected"; value: BatchInputRejection<TInput> }
  | { category: "retryable"; value: BatchInputDeferral<TInput> }
  | {
    category: "invariantFailure";
    value: BatchInvariantFailure<TInput> & { inputs: TInput[] };
  }
  | { category: "failed"; value: BatchInputFailure<TInput> };

/** Keep permanent, deferral and legacy retry-charged failures disjoint. */
export function classifyWorkerFailure<TInput extends DefaultBatcherInput>(
  input: TInput,
  error: unknown,
): WorkerFailureClassification<TInput> {
  if (error instanceof PreSpendPermanent) {
    return {
      category: "permanentRejected",
      value: {
        input,
        error: error.error,
        errorCode: error.errorCode,
        statusCode: error.statusCode,
      },
    };
  }
  if (error instanceof PreSpendDefer) {
    return {
      category: "retryable",
      value: { input, reason: error.reason },
    };
  }
  if (error instanceof PreSubmitInvariant) {
    return {
      category: "invariantFailure",
      value: {
        inputs: [input],
        message: error.message,
        errorCode: error.errorCode,
        hardPause: error.hardPause,
      },
    };
  }
  return {
    category: "failed",
    value: {
      input,
      error: error instanceof Error ? error.message : String(error),
    },
  };
}

/** Build the adapter's explicit mixed-fate outcome without splice-diff state. */
export function buildWorkerBatchOutcome<TInput extends DefaultBatcherInput>(
  invalidInputs: TInput[],
  workerInputs: TInput[],
  results: PromiseSettledResult<string>[],
): BatchOutcome<TInput> {
  const hashes: string[] = [];
  const submitted: TInput[] = [];
  const permanentRejected: BatchInputRejection<TInput>[] = [];
  const retryable: BatchInputDeferral<TInput>[] = [];
  const invariantInputs: TInput[] = [];
  const invariantMessages: string[] = [];
  let invariantErrorCode: string | undefined;
  let hardPause = false;
  const failed: BatchInputFailure<TInput>[] = invalidInputs.map((input) => ({
    input,
    error: "transaction failed to deserialize",
  }));

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const input = workerInputs[index];
    if (result.status === "fulfilled") {
      hashes.push(result.value);
      submitted.push(input);
      continue;
    }

    const classified = classifyWorkerFailure(input, result.reason);
    if (classified.category === "permanentRejected") {
      permanentRejected.push(classified.value);
    } else if (classified.category === "retryable") {
      retryable.push(classified.value);
    } else if (classified.category === "invariantFailure") {
      invariantInputs.push(...classified.value.inputs);
      invariantMessages.push(classified.value.message);
      invariantErrorCode ??= classified.value.errorCode;
      hardPause ||= classified.value.hardPause ?? false;
    } else {
      failed.push(classified.value);
    }
  }

  return {
    hash: hashes.length > 0 ? hashes.join(",") : undefined,
    submitted,
    permanentRejected,
    retryable,
    failed,
    invariantFailure: invariantInputs.length > 0
      ? {
        inputs: invariantInputs,
        message: invariantMessages.join("; "),
        errorCode: invariantErrorCode,
        hardPause,
      }
      : undefined,
  };
}

/** Outcome returned before touching a wallet once manual recovery is required. */
export function hardPausedBatchOutcome<TInput extends DefaultBatcherInput>(
  reason: string,
  inputs: TInput[],
): BatchOutcome<TInput> {
  return {
    submitted: [],
    invariantFailure: {
      inputs,
      message: reason,
      errorCode: "ADAPTER_HARD_PAUSED",
      hardPause: true,
    },
  };
}

/** Stable health shape shared by the adapter and constructor-free tests. */
export function hardPauseHealthInfo(reason: string | null): {
  active: boolean;
  reason: string | null;
} {
  return { active: reason !== null, reason };
}

/**
 * Revert one finalized wallet entry without ever pretending a failure worked.
 * The caller owns the pause state and logging so this helper stays
 * constructor-free and the wallet seam can be exercised in unit tests.
 */
export async function safeRevertFinalized(args: {
  revertTransaction: () => Promise<void>;
  context: string;
  onFailure: (reason: string) => void;
  onSuccess?: () => void;
  onError?: (reason: string) => void;
}): Promise<boolean> {
  try {
    await args.revertTransaction();
    args.onSuccess?.();
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason =
      `finalized transaction rollback failed for ${args.context}: ${detail}; ` +
      `manual wallet recovery required`;
    args.onFailure(reason);
    args.onError?.(reason);
    return false;
  }
}

function formatDust(specks: bigint): string {
  const abs = specks < 0n ? -specks : specks;
  const sign = specks < 0n ? "-" : "";
  const whole = abs / SPECKS_PER_DUST;
  const frac = abs % SPECKS_PER_DUST;
  const fracStr = frac.toString().padStart(15, "0").replace(/0+$/, "");
  return fracStr ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

// ---------------------------------------------------------------------------
// Wallet-seed registry (process-wide)
// ---------------------------------------------------------------------------

/**
 * Seeds already claimed by a live adapter in this process, seed → owner label.
 *
 * Sharing a seed across two adapter instances is never safe: each instance
 * builds its own WalletFacade with its own `pendingDust` ledger and its own
 * per-wallet balance mutex, so both would select the same on-chain dust coins
 * (double-spend attempts, "could not balance dust", coins stranded until the
 * grace period). One wallet belongs to exactly one adapter.
 */
/**
 * Opaque proof of a seed claim. Only `claimWalletSeeds` mints one, and release
 * compares by object identity — so a claim cannot be forged by reconstructing a
 * value that "looks like" it, and one adapter cannot drop another's claim.
 */
export type WalletSeedClaim = { readonly __walletSeedClaim: unique symbol };

const claimedWalletSeeds = new Map<string, { owner: string; token: object }>();

/**
 * Wallets claimed by INSTANCE IDENTITY, not by seed.
 *
 * `config.walletResult` hands the adapter an already-built wallet and skips the
 * seed path entirely. Two adapters can therefore declare distinct nominal
 * seeds, both satisfy the seed registry, and then operate the same wallet —
 * which is precisely the double-spend the seed registry exists to prevent,
 * arrived at through the one door it does not watch.
 *
 * Seeds identify wallets the adapter builds; this identifies the ones it is
 * handed. A WeakMap so a discarded wallet does not pin its owner label.
 */
const claimedWalletInstances = new WeakMap<object, string>();

/** The object that identifies a wallet: the facade itself, else the result. */
function walletIdentity(walletResult: unknown): object | null {
  const target = (walletResult as { wallet?: unknown } | null)?.wallet ??
    walletResult;
  return target !== null &&
      (typeof target === "object" || typeof target === "function")
    ? target as object
    : null;
}

/**
 * Claim a resolved wallet instance. Returns the key to release later, or null
 * when the value carries no usable identity (nothing to guard).
 */
export function claimWalletInstance(walletResult: unknown, owner: string): object | null {
  const key = walletIdentity(walletResult);
  if (!key) return null;
  const existing = claimedWalletInstances.get(key);
  if (existing !== undefined) {
    throw new Error(
      `MidnightBalancingAdapter (${owner}): this wallet instance is already in ` +
        `use by "${existing}". Handing one walletResult to two adapters gives ` +
        `them independent pendingDust ledgers over the same coins — the same ` +
        `double-spend the seed registry prevents, reached through the path it ` +
        `does not watch. Build a separate wallet for each product.`,
    );
  }
  claimedWalletInstances.set(key, owner);
  return key;
}

/**
 * Claim wallet seeds for one adapter instance. Throws if any seed is already
 * claimed (or listed twice). Exported so the exclusivity contract can be
 * tested without starting wallet sync.
 */
/**
 * Canonical identity of a seed: what the wallet actually derives from.
 *
 * The wallet does `Buffer.from(seed, "hex")`, so "AA…" and "aa…" (and an
 * 0x-prefixed spelling) are the SAME wallet. Keying the registry on the raw
 * string would let two adapters claim one wallet by spelling it differently —
 * defeating the exclusivity check exactly when it is needed, since an operator
 * copying seeds between config files is how the collision arises in the first
 * place.
 */
function canonicalSeed(seed: string, owner: string): string {
  const raw = typeof seed === "string" ? seed.trim() : "";
  const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      `MidnightBalancingAdapter (${owner}): wallet seed is not valid hex ` +
        `(got ${hex.length} character(s)). The wallet derives from ` +
        `Buffer.from(seed, "hex"), so a malformed seed silently becomes a ` +
        `different wallet than intended.`,
    );
  }
  return hex.toLowerCase();
}

export function claimWalletSeeds(seeds: string[], label?: string): WalletSeedClaim {
  const owner = label ?? "unlabeled adapter";
  const seen = new Set<string>();
  const canonical: string[] = [];
  // Validate the whole list before mutating, so a partial claim cannot leak on
  // the throw path.
  for (const seed of seeds) {
    const key = canonicalSeed(seed, owner);
    if (seen.has(key)) {
      throw new Error(
        `MidnightBalancingAdapter (${owner}): wallet seed listed twice in the same adapter`,
      );
    }
    seen.add(key);
    canonical.push(key);
    const existing = claimedWalletSeeds.get(key)?.owner;
    if (existing !== undefined) {
      throw new Error(
        `MidnightBalancingAdapter (${owner}): wallet seed already in use by "${existing}". ` +
          `Each adapter instance needs its OWN wallet — sharing one causes double-spent dust. ` +
          `Give this product a distinct seed. (Seeds are compared by their derived ` +
          `bytes, so differing case or an 0x prefix is still the same wallet.)`,
      );
    }
  }
  const token = Object.freeze({}) as unknown as WalletSeedClaim;
  for (const key of canonical) claimedWalletSeeds.set(key, { owner, token });
  return token;
}

/**
 * Release seed claims held by `owner`. Ownership-checked: releasing is how an
 * adapter gives up its wallet on shutdown, and one adapter must not be able to
 * drop another's claim and re-open the double-spend window.
 */
export function releaseWalletSeeds(claim: WalletSeedClaim | undefined): void {
  if (!claim) return;
  for (const [key, held] of [...claimedWalletSeeds.entries()]) {
    if (held.token === claim) claimedWalletSeeds.delete(key);
  }
}

/**
 * Drop every seed claim.
 *
 * @internal TEST HELPER ONLY. Calling this while adapters are live silently
 * disables the double-spend protection for all of them.
 */
export function resetWalletSeedRegistry(): void {
  claimedWalletSeeds.clear();
}

/**
 * Reject a policy object that cannot authorize anything.
 *
 * `undefined` means "no policy" and stays allow-all — that is the backward
 * compatible path for single-product batchers. But a policy the operator wrote
 * out and that grants nothing is a mistake, not a preference, and treating it
 * as allow-all turns a typo into an open gate. `allowedTokenTypes` is the
 * likeliest form: it only narrows the transfer rule, so on its own it grants
 * nothing and silently authorizes everything.
 */
export function assertPolicyIsEffective(
  policy: MidnightTxPolicy<never> | undefined,
  label?: string,
): void {
  if (policy === undefined) return;
  if (isPolicyEnforced(policy)) return;
  const who = `MidnightBalancingAdapter (${label ?? "unlabeled adapter"})`;
  const hasOnlyTokenTypes = (policy.allowedTokenTypes?.length ?? 0) > 0;
  throw new Error(
    `${who}: \`policy\` was provided but authorizes nothing, which would ` +
      `behave as allow-all.` +
      (hasOnlyTokenTypes
        ? ` \`allowedTokenTypes\` only narrows the transfer rule — pair it with ` +
          `\`allowZswapTransfers: true\`.`
        : ` Set at least one of allowZswapTransfers / allowedContracts / ` +
          `allowedCircuits / allowCustomFinalFilter.`) +
      ` Omit \`policy\` entirely if this product really should accept anything.`,
  );
}

/** Short 8-char hex hash of the input payload for tracing duplicates from the app. */
function inputContentHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(31, h) + input.charCodeAt(i) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type DelegatedTxStage = "unproven" | "unbound" | "finalized";
type DelegatedTx =
  | UnprovenTransaction
  | UnboundTransaction
  | FinalizedTransaction;

interface DelegatedTxEntry {
  tx: DelegatedTx;
  txStage: DelegatedTxStage;
  /** Per-input override: true/false overrides the config default, undefined uses config. */
  addShieldedPadding?: boolean;
}

/** Per-tx tracing metadata assigned at buildBatchData time. */
interface TxTraceInfo {
  /** e.g. "B04:1" — batch 4, tx index 1 */
  label: string;
  /** 8-char hex hash of the raw input payload (for tracing duplicates from the app) */
  contentHash: string;
  /** Retry attempt (0 = first try) */
  retry: number;
  /** The originating input — needed by the pre-spend policy gate. */
  input: DefaultBatcherInput;
}

interface DelegatedBatchData {
  txs: DelegatedTxEntry[];
  selectedInputs: DefaultBatcherInput[];
  /** Each tx maps to the worker that will process it. */
  workerAssignments: { walletIdx: number; slotIdx: number }[];
  /** Snapshot of reserved input keys, taken at buildBatchData time.
   *  Used by releaseBatchResources to clear inFlightInputKeys even
   *  when submission returns mixed per-input outcomes. */
  reservedInputKeys: string[];
  /** Per-tx tracing metadata. */
  traceInfos: TxTraceInfo[];
  /** Batch sequence number. */
  batchId: number;
  /** Inputs whose payload failed to deserialize. They are included in
   *  selectedInputs (reserved) and reported through BatchOutcome.failed, so a
   *  poison input is retried a bounded number of times and then dropped WITH a
   *  log instead of being skipped-but-kept forever. */
  invalidInputs: DefaultBatcherInput[];
}

/** Parse the persisted envelope without re-serializing its live transaction. */
export function parseHexInput(input: string): {
  hex: string;
  txStage?: DelegatedTxStage;
  addShieldedPadding?: boolean;
} {
  const trimmed = input.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as {
      tx?: string;
      txStage?: DelegatedTxStage;
      addShieldedPadding?: boolean | null;
    };
    if (!parsed.tx) throw new Error("Missing tx field in JSON input");
    if (
      parsed.txStage !== undefined &&
      parsed.txStage !== "unproven" &&
      parsed.txStage !== "unbound" &&
      parsed.txStage !== "finalized"
    ) {
      throw new Error(
        "txStage must be 'unproven', 'unbound', or 'finalized'",
      );
    }
    const hex = parsed.tx.startsWith("0x") ? parsed.tx.slice(2) : parsed.tx;
    const addShieldedPadding = parsed.addShieldedPadding ?? undefined;
    return { hex, txStage: parsed.txStage, addShieldedPadding };
  }
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  return { hex };
}

/** Build the worker job from the ORIGINAL stored bytes, never a live re-serialization. */
export function buildPreSpendValidationJob(
  input: DefaultBatcherInput,
  txStage: DelegatedTxStage,
  paramsBytes: Uint8Array,
  networkId: string,
  nowMs: number,
): ValidationJob {
  return {
    txBytes: fromHex(parseHexInput(input.input).hex),
    paramsBytes,
    networkId,
    phase: "pre-spend",
    txStage,
    nowMs,
  };
}

/** Build the strict pre-submit job from our finalized transaction bytes. */
export function buildPreSubmitValidationJob(
  finalizedBytes: Uint8Array,
  paramsBytes: Uint8Array,
  networkId: string,
  nowMs: number,
): ValidationJob {
  return {
    txBytes: finalizedBytes,
    paramsBytes,
    networkId,
    phase: "pre-submit",
    txStage: "finalized",
    nowMs,
  };
}

/** Hard gates shared by intake and the untrusted-storage pre-spend recheck. */
export function hardGateVerdictFor(
  tx: PolicyInspectableTx,
  shapeLimits: ShapeLimits,
): ValidationResult | undefined {
  let actions;
  try {
    actions = contractActions(tx);
  } catch (error) {
    return {
      valid: false,
      error: `could not read contract actions: ${
        error instanceof Error ? error.message : String(error)
      }`,
      errorCode: "ACTION_INTROSPECTION_FAILED",
    };
  }
  if (actions.some((action) => action.entryPoint === "")) {
    return {
      valid: false,
      error:
        "transaction contains a contract deploy or maintenance update; " +
        "this batcher sponsors circuit calls only",
      errorCode: "UNSUPPORTED_MAINTENANCE_UPDATE",
    };
  }

  const shape = checkShapeLimits(tx, shapeLimits);
  if (!shape.valid) {
    return {
      valid: false,
      error: shape.reason ?? "transaction shape exceeds this target's limits",
      errorCode: shape.errorCode,
    };
  }
  return undefined;
}

interface PreSpendGateArgs {
  hardGateVerdict: () => ValidationResult | undefined;
  policyVerdict?: () => Promise<PolicyVerdict>;
  getParams: () => LedgerParamsLookup;
  validate: (
    params: Extract<LedgerParamsLookup, { ok: true }>["params"],
  ) => Promise<WellFormedVerdict>;
}

interface PreSubmitGateArgs {
  getParams: () => LedgerParamsLookup;
  validateFinalized: (
    params: Extract<LedgerParamsLookup, { ok: true }>["params"],
  ) => Promise<WellFormedVerdict>;
  revertFinalized: () => Promise<boolean>;
  revalidateOriginal: (
    params: Extract<LedgerParamsLookup, { ok: true }>["params"],
  ) => Promise<WellFormedVerdict>;
}

/**
 * Run the cheap-to-expensive gate sequence before the wallet balance lock.
 * Throws only the two typed channels understood by the batch outcome mapper.
 */
export async function runPreSpendGate(args: PreSpendGateArgs): Promise<void> {
  const hardVerdict = args.hardGateVerdict();
  if (hardVerdict) {
    throw new PreSpendPermanent(
      hardVerdict.error ?? "transaction failed a hard pre-spend gate",
      hardVerdict.errorCode,
      hardVerdict.statusCode ?? 400,
    );
  }

  if (args.policyVerdict) {
    const verdict = await args.policyVerdict();
    if (!verdict.valid) {
      throw new PreSpendPermanent(
        `Rejected by policy (${verdict.rule ?? "unknown"}): ${
          verdict.reason ?? "transaction not permitted for this target"
        }`,
        "POLICY_REJECTED",
        400,
      );
    }
  }

  const params = args.getParams();
  if (!params.ok) {
    throw new PreSpendDefer(
      `live ledger parameters unavailable (${params.reason})`,
    );
  }

  let verdict: WellFormedVerdict;
  try {
    verdict = await args.validate(params.params);
  } catch (error) {
    throw new PreSpendDefer(
      `validation unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!verdict.valid) {
    throw new PreSpendPermanent(
      verdict.reason ?? "transaction is not well formed",
      verdict.errorCode ?? "NOT_WELL_FORMED",
      400,
    );
  }
}

async function requireFinalizedRollback(
  args: Pick<PreSubmitGateArgs, "revertFinalized">,
  context: string,
): Promise<void> {
  let reverted = false;
  let rollbackError: unknown;
  try {
    reverted = await args.revertFinalized();
  } catch (error) {
    rollbackError = error;
  }
  if (reverted) return;

  const detail = rollbackError === undefined
    ? "wallet revertTransaction returned failure"
    : rollbackError instanceof Error
    ? rollbackError.message
    : String(rollbackError);
  throw new PreSubmitInvariant(
    `${context}; finalized rollback failed (${detail})`,
    "FINALIZED_REVERT_FAILED",
    true,
  );
}

async function rollbackThenDefer(
  args: Pick<PreSubmitGateArgs, "revertFinalized">,
  reason: string,
): Promise<never> {
  await requireFinalizedRollback(args, reason);
  throw new PreSpendDefer(reason);
}

/**
 * Validate our finalized output and classify every rollback branch.
 *
 * A finalized transaction is already registered in the wallet's pending
 * service. Every path that cannot submit it must therefore call
 * `revertTransaction` first; a plain throw would strand its dust until the
 * wallet's three-hour grace period expires.
 */
export async function runPreSubmitGate(
  args: PreSubmitGateArgs,
): Promise<void> {
  let params: LedgerParamsLookup;
  try {
    params = args.getParams();
  } catch (error) {
    return await rollbackThenDefer(
      args,
      `live ledger parameters unavailable before submit: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!params.ok) {
    // Pre-submit is deliberately asymmetric with pre-spend: we must fail
    // closed once a finalized entry exists, but cache/executor unavailability
    // is still our fault, not a permanent verdict on the stored input.
    return await rollbackThenDefer(
      args,
      `live ledger parameters unavailable before submit (${params.reason})`,
    );
  }

  let finalizedVerdict: WellFormedVerdict;
  try {
    finalizedVerdict = await args.validateFinalized(params.params);
  } catch (error) {
    return await rollbackThenDefer(
      args,
      `pre-submit validation unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (finalizedVerdict.valid) return;

  await requireFinalizedRollback(
    args,
    `finalized transaction failed pre-submit validation: ${
      finalizedVerdict.reason ?? finalizedVerdict.errorCode ?? "unknown reason"
    }`,
  );

  // Permanence is about the ORIGINAL stored bytes. A failure introduced by
  // our own balancing/proving path is an invariant failure, never permission
  // to delete a caller's otherwise-valid input.
  let originalParams: LedgerParamsLookup;
  try {
    originalParams = args.getParams();
  } catch (error) {
    throw new PreSpendDefer(
      `original input could not be revalidated after rollback: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!originalParams.ok) {
    throw new PreSpendDefer(
      `original input could not be revalidated after rollback ` +
        `(live ledger parameters ${originalParams.reason})`,
    );
  }

  let originalVerdict: WellFormedVerdict;
  try {
    originalVerdict = await args.revalidateOriginal(originalParams.params);
  } catch (error) {
    throw new PreSpendDefer(
      `original input revalidation unavailable after rollback: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!originalVerdict.valid) {
    throw new PreSpendPermanent(
      originalVerdict.reason ?? "original transaction is not well formed",
      originalVerdict.errorCode ?? "NOT_WELL_FORMED",
      400,
    );
  }

  throw new PreSubmitInvariant(
    `finalized transaction failed pre-submit validation while the original ` +
      `stored transaction remained well formed`,
    "FINALIZED_OUTPUT_INVARIANT",
  );
}

/** TTL budget remaining after dust wait: submit timeout plus proving allowance. */
export function preSpendTtlFloorMs(
  config: Pick<MidnightBalancingAdapterConfig, "minTtlRemainingMs">,
): number {
  return config.minTtlRemainingMs ??
    (SUBMIT_TX_TIMEOUT_MS + PROVE_ALLOWANCE_MS);
}

/** Convert the cheap TTL verdict into the permanent pre-spend channel. */
export function enforcePreSpendTtl(
  tx: PolicyInspectableTx,
  nowMs: number,
  minRemainingMs: number,
): void {
  const verdict = checkTtlMargin(tx, nowMs, minRemainingMs);
  if (!verdict.valid) {
    throw new PreSpendPermanent(
      verdict.reason ?? "transaction TTL cannot cover the remaining pipeline",
      verdict.errorCode,
      400,
    );
  }
}

/**
 * The spend-boundary ordering seam: dust may be unavailable long enough for
 * an intent that passed the full pre-spend gate to become unsafe. Wait first,
 * finish any spend preparation, sample the clock last, then enforce immediately
 * before constructing the balancing recipe. Keeping these steps injectable
 * makes that race deterministic in tests without weakening production.
 */
export async function waitForDustThenEnforceTtl(args: {
  waitForDust: () => Promise<void>;
  prepareForSpend?: () => Promise<void>;
  tx: () => PolicyInspectableTx;
  now: () => number;
  minRemainingMs: number;
}): Promise<void> {
  await args.waitForDust();
  await args.prepareForSpend?.();
  enforcePreSpendTtl(args.tx(), args.now(), args.minRemainingMs);
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * A latch that opens once every wallet has finished the startup work that
 * blocks the event loop. Backs `whenServable()`; see
 * `BlockchainAdapter.whenServable` for why the HTTP port waits on it.
 *
 * Extracted from the adapter so the semantics — all-of, idempotent, openable
 * in bulk — can be tested without building wallets against a network.
 */
export interface ServableGate {
  /** Resolves when the last wallet is marked. Never rejects. */
  readonly promise: Promise<void>;
  /** Mark one wallet past its blocking startup. Safe to call repeatedly. */
  mark(index: number): void;
  /** Open the gate regardless — the failure backstop. */
  markAll(): void;
  /** How many wallets are still unaccounted for. Diagnostics and tests. */
  pending(): number;
}

export function createServableGate(count: number): ServableGate {
  const marked = new Array<boolean>(Math.max(0, count)).fill(false);
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  // A gate nobody will ever mark must start open, not closed: an adapter with
  // no wallets blocks nothing.
  if (marked.length === 0) release();

  const openIfComplete = (): void => {
    if (marked.every(Boolean)) release();
  };
  return {
    promise,
    mark(index: number): void {
      // Out of range is ignored rather than thrown: this is called from
      // `finally` blocks, and a gate must never be the thing that turns a
      // failed wallet into a failed process.
      if (!Number.isInteger(index) || index < 0 || index >= marked.length) return;
      if (marked[index]) return;
      marked[index] = true;
      openIfComplete();
    },
    markAll(): void {
      marked.fill(true);
      release();
    },
    pending(): number {
      return marked.filter((m) => !m).length;
    },
  };
}

/**
 * Midnight Balancing Adapter (Party B)
 *
 * Receives serialized delegated transactions (hex), balances them with local
 * dust funds, generates proofs, and submits them to the blockchain.
 *
 * Uses a worker pool where each worker = {wallet, UTXO-slot}. Workers run
 * their tx pipeline independently with a per-wallet balance mutex for
 * speculative chaining correctness.
 */
export class MidnightBalancingAdapter
  implements BlockchainAdapter<DelegatedBatchData> {
  private readonly config: MidnightBalancingAdapterConfig;
  private readonly walletNetworkId: WalletNetworkId.NetworkId;
  private readonly walletFundingTimeoutMs: number;
  private readonly syncProtocolName: string;
  private readonly walletSeeds: string[];
  private readonly log: AdapterLogger;

  private walletResults: (WalletResult | null)[];
  private walletAddresses: (string | null)[];
  private walletInitialized: boolean[];
  /**
   * Wallet-instance claims this adapter holds. Only keys it claimed itself land
   * here, so releasing from this list cannot drop another adapter's claim even
   * if two adapters share a log label.
   */
  private claimedWalletKeys: object[] = [];
  /** Proof of this adapter's seed claim; the only thing that can release it. */
  private readonly seedClaim: WalletSeedClaim;
  /** Live ledger parameters. Fails closed when it has none. */
  private readonly ledgerParams: LedgerParamsCache;
  /** Process-global validation pool handle, acquired only when first needed. */
  private validationExecutorHandle: ValidationExecutorHandle | null = null;
  /**
   * Set when a finalized transaction could not be reverted. Restart/manual
   * wallet recovery is required; no later batch may touch a wallet meanwhile.
   */
  private hardPausedReason: string | null = null;
  /**
   * True where the wallet was handed in via `config.walletResult`. An injected
   * wallet belongs to the caller: this adapter must not stop it on close.
   */
  private walletIsInjected: boolean[];
  /**
   * Periodic dust-state checkpointing, one per wallet. Also covers the injected
   * wallet, which had no persistence of any kind.
   */
  private dustStateAutosaves: (DustStateAutosaveHandle | null)[];
  /**
   * Last observed dust sync position per wallet, plus where it resumed from.
   * Sampled during init (where a cold sync can run for an hour with nothing
   * else to show for it) and refreshed whenever dust state is read afterwards.
   */
  private walletSyncHealth: (WalletDustSyncHealth | null)[];
  private availableDustUtxoCounts: (number | null)[];
  /** Tracks wallets that recently failed due to missing dust. Cleared when dust is confirmed available. */
  private walletDustExhausted: boolean[];
  /**
   * Whether the last dust reading was projected at wall clock or fell back to
   * the wallet's own (possibly stale) sync time. Surfaced in health info: a gate
   * reading dust at a syncTime that is hours behind looks like starvation.
   */
  private dustValuesUseLiveClock = true;
  /** Timestamp of the last background dust-state refresh (throttling). */
  private lastDustRefreshAt = 0;
  /** True while a background dust refresh is in flight. */
  private dustRefreshInFlight = false;

  /** Worker pool — initialized with 0 slots, updated per wallet after init. */
  private readonly pool: WorkerPool;
  /** Input keys currently being processed in a concurrent batch. */
  private readonly inFlightInputKeys = new Set<string>();
  /**
   * Replay keys derived while validating, so `getReplayKey` costs nothing.
   *
   * `validateInput` already deserializes the whole transaction on the main
   * thread; the batcher then asks for the replay key microseconds later, on the
   * same input. Re-deserializing to answer would double the intake cost of the
   * single most expensive thing intake does. Keyed by a sha256 of the raw
   * payload — NOT `inputContentHash`, whose 32-bit output would eventually
   * collide and hand back another transaction's key, which is the one error
   * mode a dedup gate must not have (it refuses a legitimate spend).
   *
   * Bounded, oldest-first: a memo that grows with traffic is a leak, and a miss
   * is merely slower (see `getReplayKey`), never wrong.
   */
  private readonly replayKeyMemo = new Map<string, string | undefined>();

  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  /**
   * Per wallet: has it finished the startup work that blocks the event loop?
   *
   * That work is `DustWallet.restore` — one synchronous WASM deserialize of the
   * whole snapshot, measured at ~46 s for preprod's 5.1 MB (sweep brief §2). The
   * dust *sync* that follows is not in this set: it yields between batches, with
   * a worst measured stall of 906 ms, so a server can serve through it. Only the
   * restore is a true black hole.
   */
  private readonly servableGate: ServableGate;
  private publicDataProvider: PublicDataProvider | null = null;
  private batchCounter = 0;

  constructor(
    walletSeed: string | string[],
    config: MidnightBalancingAdapterConfig,
  ) {
    const seeds = Array.isArray(walletSeed) ? walletSeed : [walletSeed];
    // A policy object that authorizes nothing is almost certainly a config
    // mistake, and today it behaves as allow-all — the operator believes work
    // is gated when it is not. Absent policy stays allow-all for backward
    // compatibility; an explicit one has to actually say something.
    assertPolicyIsEffective(
      config.policy as MidnightTxPolicy<never> | undefined,
      config.logLabel,
    );
    // Two adapter instances sharing a seed each build their OWN WalletFacade,
    // with independent local dust booking and independent balance mutexes —
    // they would select the same on-chain dust coins and double-spend. Fail
    // loudly at construction instead of at 3am.
    this.seedClaim = claimWalletSeeds(seeds, config.logLabel);
    this.walletSeeds = seeds;
    this.config = config;
    this.ledgerParams = new LedgerParamsCache({
      indexer: config.indexer,
      ...config.ledgerParams,
    });
    this.ledgerParams.start();
    this.log = new AdapterLogger(
      config.logLabel ? `balancing:${config.logLabel}` : "balancing",
    );
    this.walletNetworkId = config.walletNetworkId ??
      ("undeployed" as WalletNetworkId.NetworkId);
    this.walletFundingTimeoutMs = (config.walletFundingTimeoutSeconds ?? 600) *
      1000;
    this.syncProtocolName = config.syncProtocolName ??
      `Midnight-Balancing (${this.walletNetworkId})`;

    this.walletResults = new Array(seeds.length).fill(null);
    this.walletAddresses = new Array(seeds.length).fill(null);
    this.walletIsInjected = new Array(seeds.length).fill(false);
    this.dustStateAutosaves = new Array(seeds.length).fill(null);
    this.walletSyncHealth = new Array(seeds.length).fill(null);
    this.walletInitialized = new Array(seeds.length).fill(false);
    this.availableDustUtxoCounts = new Array(seeds.length).fill(null);
    this.walletDustExhausted = new Array(seeds.length).fill(false);

    // Start with 0 slots per wallet; updated in ensureWalletFunds once UTXO counts are known.
    this.pool = new WorkerPool(new Array(seeds.length).fill(0));

    this.servableGate = createServableGate(seeds.length);

    this.initializationPromise = this.initialize();
  }

  /**
   * Resolves when no wallet is still inside a blocking restore, so the batcher
   * can bind its HTTP port (see `BlockchainAdapter.whenServable`).
   *
   * Never rejects, and never waits for sync to *finish*: a cold sync runs for
   * ~58 minutes on preprod and an operator needs `/health` for every one of
   * them — that visibility is exactly what Phase 2's `3fd156dd` added.
   */
  whenServable(): Promise<void> {
    return this.servableGate.promise;
  }

  /**
   * Mark one wallet as past its blocking startup, idempotently.
   *
   * Called from three places on purpose, because "the restore is over" has three
   * endings: the wallet emitted its first sync sample (the normal one — the
   * progress subscription is attached *after* `buildWalletFacade` returns, so a
   * sample proves the deserialize is done), the wallet was handed in already
   * built, or `initializeWallet` returned by any path including failure. A gate
   * that only closed on success would hold the port shut on a broken wallet.
   */
  private markWalletServable(index: number): void {
    this.servableGate.mark(index);
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  private async initialize(): Promise<void> {
    try {
      this.log.log(
        `Initializing Midnight Balancing Adapter (${this.walletSeeds.length} wallet(s))...`,
      );
      setNetworkId(this.walletNetworkId as any);

      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS,
      );

      await Promise.all(
        this.walletSeeds.map((seed, i) => this.initializeWallet(i, seed)),
      );

      const readyCount = this.walletInitialized.filter(Boolean).length;
      if (readyCount === 0) {
        throw new Error("All wallets failed to initialize");
      }

      this.isInitialized = true;
      this.log.log(
        `Adapter ready (${readyCount}/${this.walletSeeds.length} wallets, ` +
          `${this.pool.getTotalWorkerCount()} workers: ${this.pool.getStatus()})`,
      );
    } catch (error) {
      this.log.error("Initialization failed:", error);
      throw error;
    } finally {
      // Last backstop: something before the per-wallet loop threw (a bad
      // network id, an indexer provider that would not construct), so no
      // wallet ever ran its own `finally`. The port must still open.
      this.servableGate.markAll();
    }
  }

  private async initializeWallet(index: number, seed: string): Promise<void> {
    const label = `${index + 1}/${this.walletSeeds.length}`;
    try {
      if (index === 0 && this.config.walletResult) {
        this.log.log(`Wallet ${label}: using shared wallet...`);
        this.walletResults[index] = await this.config.walletResult;
        this.walletIsInjected[index] = true;
        // An injected wallet was built — and restored — by whoever handed it
        // in, so this adapter never blocks the loop for it.
        this.markWalletServable(index);
        // The seed registry never saw this wallet — it was handed in, not
        // derived. Claim it by identity or two adapters with different nominal
        // seeds end up on the same coins.
        this.claimWallet(this.walletResults[index]);

        this.log.log(`Wallet ${label}: waiting for funds...`);
        await this.ensureWalletFunds(index);

        // Same rule as the built path: never suspend a shielded wallet that
        // padding still needs, while it is mid-replay.
        if (this.shieldedPaddingPossible()) {
          this.log.log(`Wallet ${label}: waiting for shielded sync (padding enabled)...`);
          const complete = await waitForShieldedSyncComplete(
            this.walletResults[index]!.wallet,
            resolveWalletSyncTimeoutMs(),
          );
          if (!complete) {
            this.log.error(
              `Wallet ${label}: shielded wallet is still behind and is being suspended ` +
                `anyway — shielded padding will fail for this wallet`,
            );
          }
        }
        await suspendAuxWalletSyncForFees(this.walletResults[index]!.wallet);
      } else {
        this.log.log(`Wallet ${label}: building with retry-aware dust sync...`);
        const networkUrls: Required<NetworkUrls> = {
          id: this.walletNetworkId,
          indexer: this.config.indexer,
          indexerWS: this.config.indexerWS,
          node: this.config.node,
          proofServer: this.config.proofServer,
        };

        // Use waitForDustFundsWithRetry: builds wallet, restores cached state,
        // syncs with stall detection + retry, saves state to disk
        const { walletResult, dustBalance } = await waitForDustFundsWithRetry({
          networkUrls,
          seed,
          networkId: this.walletNetworkId,
          syncMode: 'dust-only',
          balanceWaitTimeoutMs: this.walletFundingTimeoutMs,
          dustStateDir: this.config.dustStateDir,
          onSyncProgress: (sample) => this.recordDustSyncProgress(index, sample),
          // Padding is a real shielded spend, so it needs shielded state that
          // was not cut off mid-replay.
          requireShieldedSync: this.shieldedPaddingPossible(),
        });

        this.walletResults[index] = walletResult;
        // Also claimed, even though the seed registry already covers this path:
        // a builder that ever returns a cached or shared instance would
        // otherwise reintroduce the same aliasing silently.
        this.claimWallet(walletResult);

        if (dustBalance > 0n) {
          this.log.log(`Wallet ${label}: dust balance: ${dustBalance}`);
        } else {
          this.log.warn(
            `Wallet ${label}: dust balance still 0 — wallet needs dust or unshielded NIGHT to register`,
          );
        }

        // Set up UTXO counts and worker pool slots
        await this.updateWorkerPoolForWallet(index);
      }

      this.startDustStateCheckpointing(index, seed);

      const wr = this.walletResults[index]!;
      this.walletAddresses[index] = wr.zswapSecretKeys.coinPublicKey.toString();
      this.log.log(`Wallet ${label} addresses:`);
      this.log.log(`  shielded:   ${this.walletAddresses[index]}`);
      this.log.log(`  unshielded: ${wr.unshieldedAddress}`);
      this.log.log(`  dust:       ${wr.dustAddress}`);

      this.walletInitialized[index] = true;
      this.log.log(`Wallet ${label}: ready`);
    } catch (error) {
      this.log.error(`Wallet ${label}: initialization failed:`, error);
    } finally {
      // Backstop for every path that never produced a sync sample: a wallet
      // whose dust state was unavailable, or one that threw. Whatever happened,
      // nothing of ours is blocking the loop for this wallet any more.
      this.markWalletServable(index);
    }
  }

  /**
   * Fold one sync observation into this wallet's cached health. Called with
   * every throttled sample during init and again whenever dust state is read
   * afterwards, so `getHealthInfo()` can answer "syncing or stuck?" without
   * touching the chain.
   */
  private recordDustSyncProgress(
    index: number,
    sample: {
      appliedIndex: bigint;
      highestRelevantWalletIndex: bigint;
      isConnected: boolean;
      restoredFromOffset?: bigint;
      snapshotRejected?: boolean;
    },
  ): void {
    // The progress subscription is attached after `buildWalletFacade` returns,
    // so the first sample is proof that the synchronous restore is behind us.
    this.markWalletServable(index);

    const previous = this.walletSyncHealth[index];
    const now = Date.now();
    const advanced = !previous || sample.appliedIndex > previous.appliedIndex;
    this.walletSyncHealth[index] = {
      appliedIndex: sample.appliedIndex,
      target: sample.highestRelevantWalletIndex,
      isConnected: sample.isConnected,
      updatedAtMs: now,
      advancedAtMs: advanced ? now : previous.advancedAtMs,
      // Later samples (from a dust-state read) carry no restore context; keep
      // what init established rather than reporting every wallet as cold.
      restoredFromOffset: sample.restoredFromOffset ?? previous?.restoredFromOffset ?? 0n,
      snapshotRejected: sample.snapshotRejected ?? previous?.snapshotRejected ?? false,
    };
  }

  /**
   * Keep this wallet's dust snapshot advancing for as long as it runs.
   *
   * Without it the snapshot was written only during init, so an adapter that
   * had been up for a week restored a week-old snapshot and replayed a week of
   * chain. Covers the injected wallet too, which had no persistence at all —
   * safe because the snapshot records its own dust public key and
   * `saveDustState` refuses to write it under a seed it does not belong to, so
   * a caller that pairs a wallet with the wrong seed gets a loud warning
   * instead of another wallet's state on disk.
   */
  private startDustStateCheckpointing(index: number, seed: string): void {
    // Persistence no-ops on `undeployed` by design (chain resets invalidate
    // cached state), so serializing every few minutes there is pure waste.
    if (String(this.walletNetworkId).toLowerCase() === "undeployed") return;
    const dustWallet = (this.walletResults[index]?.wallet as {
      dust?: { serializeState?: () => Promise<string> };
    } | undefined)?.dust;
    if (typeof dustWallet?.serializeState !== "function") return;
    this.dustStateAutosaves[index] = startDustStateAutosave(
      dustWallet as { serializeState: () => Promise<string> },
      {
        networkId: String(this.walletNetworkId),
        seed,
        dustStateDir: this.config.dustStateDir,
        intervalMs: this.config.dustStateSaveIntervalMs,
        label: `Wallet ${index + 1}/${this.walletSeeds.length}`,
      },
    );
  }

  private async ensureWalletFunds(walletIndex: number): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    let dustBalance = 0n;
    try {
      dustBalance = await waitForDustFunds(walletResult.wallet, {
        timeoutMs: this.walletFundingTimeoutMs,
        waitNonZero: true,
      });
    } catch {
      /* no dust within timeout */
    }

    if (dustBalance === 0n) {
      this.log.log(`Wallet ${label}: no dust yet, trying unshielded→dust registration...`);
      try {
        if (await registerNightForDust(walletResult)) {
          dustBalance = await waitForDustFunds(walletResult.wallet, {
            timeoutMs: this.walletFundingTimeoutMs,
            waitNonZero: true,
          });
        }
      } catch (error) {
        this.log.warn(`Wallet ${label}: dust registration failed:`, error);
      }
    }

    this.log.log(`Wallet ${label}: dust balance: ${dustBalance}`);
    if (dustBalance === 0n) {
      this.log.warn(
        `Wallet ${label}: WARNING: 0 dust balance, submissions will fail`,
      );
    } else if (this.config.addShieldedPadding) {
      this.log.log(
        `Wallet ${label}: shielded padding enabled, each tx will consume 2 dust UTXOs`,
      );
    }

    try {
      const dustState = await getInitialDustState(
        // deno-lint-ignore no-explicit-any
        (walletResult.wallet as any).dust,
      );

      const bigintSerializer = (_: string, value: unknown) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      };

      // deno-lint-ignore no-explicit-any
      this.availableDustUtxoCounts[walletIndex] =
        dustState.availableCoins?.length ?? null;
      this.log.log(
        `Wallet ${label}: dust coins: ${
          JSON.stringify(dustState.availableCoins, bigintSerializer)
        }`,
      );
      this.log.log(
        `Wallet ${label}: available dust UTXOs: ${
          this.availableDustUtxoCounts[walletIndex] ?? "unknown"
        }`,
      );

      // Update worker pool: 1 worker per UTXO (2 UTXOs per worker if padding).
      // When shieldedPaddingTokenID is configured, per-input overrides can
      // enable padding even if the config default is off, so budget for the
      // worst case (2 UTXOs/slot) to avoid over-committing.
      const utxoCount = this.availableDustUtxoCounts[walletIndex] ?? 0;
      const costPerTx = this.shieldedPaddingPossible() ? 2 : 1;
      const maxPerWallet = this.config.maxSlotsPerWallet ?? 1;
      const slots = Math.min(Math.floor(utxoCount / costPerTx), maxPerWallet);
      this.pool.setSlots(walletIndex, slots);
      this.log.log(
        `Wallet ${label}: worker slots: ${slots} (${utxoCount} UTXOs, cost=${costPerTx}/tx, cap=${maxPerWallet})`,
      );
    } catch (e) {
      this.log.warn(`Wallet ${label}: could not read dust UTXO count:`, e);
    }
  }

  /**
   * Read dust UTXO count and update worker pool slots for a wallet.
   * Extracted so it can be called independently from ensureWalletFunds.
   */
  private async updateWorkerPoolForWallet(walletIndex: number): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    try {
      const dustState = await getInitialDustState(
        // deno-lint-ignore no-explicit-any
        (walletResult.wallet as any).dust,
      );

      const bigintSerializer = (_: string, value: unknown) => {
        if (typeof value === "bigint") return value.toString();
        return value;
      };

      this.availableDustUtxoCounts[walletIndex] =
        dustState.availableCoins?.length ?? null;
      this.log.log(
        `Wallet ${label}: dust coins: ${
          JSON.stringify(dustState.availableCoins, bigintSerializer)
        }`,
      );
      this.log.log(
        `Wallet ${label}: available dust UTXOs: ${
          this.availableDustUtxoCounts[walletIndex] ?? "unknown"
        }`,
      );

      const utxoCount = this.availableDustUtxoCounts[walletIndex] ?? 0;
      const costPerTx = this.shieldedPaddingPossible() ? 2 : 1;
      const maxPerWallet = this.config.maxSlotsPerWallet ?? 1;
      const slots = Math.min(Math.floor(utxoCount / costPerTx), maxPerWallet);
      this.pool.setSlots(walletIndex, slots);
      this.log.log(
        `Wallet ${label}: worker slots: ${slots} (${utxoCount} UTXOs, cost=${costPerTx}/tx, cap=${maxPerWallet})`,
      );
    } catch (e) {
      this.log.warn(`Wallet ${label}: could not read dust UTXO count:`, e);
    }
  }

  /**
   * Can any transaction on this target get shielded padding?
   *
   * The token ID alone is enough: per-input `addShieldedPadding` overrides can
   * turn padding on for a single transaction even when the adapter default is
   * off. Whatever answers this question decides both worker-slot cost and
   * whether the shielded wallet must finish syncing before being suspended, and
   * those two must never disagree.
   */
  private shieldedPaddingPossible(): boolean {
    return !!(this.config.addShieldedPadding || this.config.shieldedPaddingTokenID);
  }

  private async getDustBalance(walletIndex: number): Promise<bigint> {
    const wr = this.walletResults[walletIndex];
    if (!wr) return 0n;
    try {
      const dustState = await getInitialDustState(
        wr.wallet.dust as { state: Rx.Observable<unknown> },
        { timeoutMs: 30_000 },
      );
      return resolveFacadeDustBalance(dustState);
    } catch {
      return 0n;
    }
  }

  /**
   * Read the dust state and update the cached UTXO count + exhausted flag.
   * Called in the background after each balance so the next tx's fast path
   * reflects current chain state. Errors are swallowed — if the read fails,
   * the slow path will refresh on the next call.
   */
  private async refreshUtxoCountAfterBalance(walletIndex: number): Promise<void> {
    const wr = this.walletResults[walletIndex];
    if (!wr) return;
    try {
      // deno-lint-ignore no-explicit-any
      const dustState = await getInitialDustState((wr.wallet as any).dust);
      const count = dustState.availableCoins?.length ?? 0;
      this.availableDustUtxoCounts[walletIndex] = count;
      this.walletDustExhausted[walletIndex] = count === 0;
    } catch {
      // ignore — next slow-path call will re-sync
    }
  }

  // -----------------------------------------------------------------------
  // Interface: identity & readiness
  // -----------------------------------------------------------------------

  getAccountAddress(): string {
    const first = this.walletAddresses.find((a) => a !== null);
    return first ?? "unknown";
  }

  getChainName(): string {
    return `Midnight-Balancing (${this.walletNetworkId})`;
  }

  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  isReady(): boolean {
    return this.isInitialized && this.walletInitialized.some(Boolean);
  }

  // -----------------------------------------------------------------------
  // Concurrent capacity
  // -----------------------------------------------------------------------

  /**
   * In-flight reservation key — deliberately NOT the batcher's request key.
   *
   * `core/request-id.ts` owns the identity the queue, the receipt callbacks and
   * the request id all share (`addressType|target|address|timestamp|signature|
   * input`). This one is narrower on purpose and stays that way:
   *
   *  - it never leaves this adapter instance (`inFlightInputKeys` is a private
   *    Set, dropped when the batch finishes), so it needs no cross-component
   *    agreement;
   *  - the adapter serves ONE target, so a target field would be a constant;
   *  - being narrower is the safe direction for a "don't work on this twice"
   *    reservation: it can only over-match, never under-match. Two submissions
   *    identical but for the signature reserve as one, which is what we want
   *    from a wallet that re-signed the same transaction.
   *
   * Widening it to the full request key would be a behaviour change (that pair
   * would then be balanced twice), which is why it is not done here.
   */
  private getInputKey(input: DefaultBatcherInput): string {
    return `${input.address}|${input.timestamp}|${input.input}`;
  }

  /**
   * The replay key for a submitted transaction: what the CHAIN considers this
   * spend, not what the batcher considers this request.
   *
   * There is no signature here to key on — this adapter's inputs ARE
   * transactions and `verifySignature` returns true — so the default
   * signature-hash key would leave Midnight with no replay protection at all.
   * The transaction's own identifiers are the right answer: they are what the
   * indexer watches for, so two encodings of one spend collide, which is
   * precisely "do not pay for this twice".
   *
   * Normally free: `validateInput` deserialized this exact payload moments ago
   * and left the answer in the memo. A miss (memo evicted under a burst, or an
   * input that reached here without being validated) falls back to
   * deserializing — one more parse of a payload intake already parses once,
   * rather than silently dropping replay protection for that input.
   */
  getReplayKey(input: DefaultBatcherInput): string | undefined {
    const memoKey = this.replayMemoKey(input.input);
    if (this.replayKeyMemo.has(memoKey)) return this.replayKeyMemo.get(memoKey);
    let key: string | undefined;
    try {
      key = midnightReplayKey(
        this.deserializeTxEntry(input).tx as unknown as ReplayIdentifiableTx,
      );
    } catch {
      // Undeserializable payloads are refused at intake; one that reaches here
      // gets no dedup rather than an exception on the accept path.
      key = undefined;
    }
    this.memoizeReplayKey(memoKey, key);
    return key;
  }

  private replayMemoKey(payload: string): string {
    return createHash("sha256").update(payload, "utf8").digest("hex");
  }

  private memoizeReplayKey(memoKey: string, key: string | undefined): void {
    // Re-inserting moves the entry to the back of the insertion order, which is
    // what makes the eviction below oldest-first.
    this.replayKeyMemo.delete(memoKey);
    this.replayKeyMemo.set(memoKey, key);
    while (this.replayKeyMemo.size > REPLAY_KEY_MEMO_LIMIT) {
      const oldest = this.replayKeyMemo.keys().next();
      if (oldest.done) break;
      this.replayKeyMemo.delete(oldest.value);
    }
  }

  hasAvailableCapacity(): boolean {
    if (!this.isReady()) return false;
    if (!this.pool.hasAvailableWorker()) return false;
    // Dust-aware gate: when every initialized wallet is known to be out of
    // spendable dust, report no capacity so the poll loop SKIPS the target —
    // inputs stay queued (no retry burn, no doomed 60s waits). A throttled
    // background refresh flips the flags back as coins regain value.
    const allExhausted = this.walletInitialized.every(
      (ok, i) => !ok || this.walletDustExhausted[i],
    );
    if (allExhausted) {
      this.maybeRefreshDustState();
      return false;
    }
    return true;
  }

  /** Throttled background re-read of every wallet's dust state. */
  private maybeRefreshDustState(): void {
    const now = Date.now();
    if (this.dustRefreshInFlight || now - this.lastDustRefreshAt < DUST_REFRESH_THROTTLE_MS) {
      return;
    }
    this.dustRefreshInFlight = true;
    this.lastDustRefreshAt = now;
    void (async () => {
      try {
        for (let i = 0; i < this.walletSeeds.length; i++) {
          if (!this.walletInitialized[i]) continue;
          const info = await this.getSpendableDustInfo(i);
          const wasExhausted = this.walletDustExhausted[i];
          this.availableDustUtxoCounts[i] = info.total;
          this.walletDustExhausted[i] = info.spendable === 0;
          if (wasExhausted && info.spendable > 0) {
            this.log.log(
              `Wallet ${i + 1}/${this.walletSeeds.length}: dust recovered ` +
                `(${info.spendable}/${info.total} spendable coins) — resuming`,
            );
          }
        }
      } catch {
        // ignore — next capacity check retries
      } finally {
        this.dustRefreshInFlight = false;
      }
    })();
  }

  /**
   * Count dust coins whose GENERATED value can actually pay a fee. The SDK's
   * balancer selects coins by value ≥ fee + overhead margin; a freshly created
   * coin exists with ~0 generated value, so a bare count is NOT a readiness
   * signal (grand-e2e root cause: gate passed on count, balance failed on value).
   */
  private async getSpendableDustInfo(
    walletIndex: number,
  ): Promise<{ total: number; spendable: number; values: bigint[] }> {
    const wr = this.walletResults[walletIndex];
    if (!wr) return { total: 0, spendable: 0, values: [] };
    const minValue = this.config.minSpendableDustPerCoin ?? DEFAULT_MIN_SPENDABLE_DUST;
    const dustState = await getInitialDustState(
      wr.wallet.dust as { state: Rx.Observable<unknown> },
      { timeoutMs: 30_000 },
    );
    // Project generation at wall clock. `availableCoins` evaluates at the
    // wallet's syncTime, which only advances when a dust EVENT is applied —
    // measured 377 days behind on a quiet chain — so reading it directly
    // under-reports generated dust and can starve the coin picker on a wallet
    // that actually has spendable dust.
    const { values, liveClock } = resolveDustCoinValuesAt(dustState, new Date());
    this.dustValuesUseLiveClock = liveClock;
    const progress = dustProgressFromState(dustState);
    if (progress) this.recordDustSyncProgress(walletIndex, progress);
    return {
      total: values.length,
      spendable: values.filter((v) => v >= minValue).length,
      values,
    };
  }

  isFullyIdle(): boolean {
    return this.pool.isFullyIdle();
  }

  releaseBatchResources(batchData: DelegatedBatchData): void {
    for (const wa of batchData.workerAssignments) {
      this.pool.releaseWorker(wa.walletIdx, wa.slotIdx);
    }
    // Use the snapshot taken at buildBatchData time so every reservation is
    // released regardless of the input's outcome category.
    for (const key of batchData.reservedInputKeys) {
      this.inFlightInputKeys.delete(key);
    }
    const bTag = `B${String(batchData.batchId).padStart(2, "0")}`;
    this.log.log(
      `[${bTag}] Released ${batchData.workerAssignments.length} worker(s), ` +
        `${batchData.reservedInputKeys.length} input(s) [pool: ${this.pool.getStatus()}]`,
    );
  }

  // -----------------------------------------------------------------------
  // Deserialization helpers
  // -----------------------------------------------------------------------

  private parseHexInput(input: string): {
    hex: string;
    txStage?: DelegatedTxStage;
    addShieldedPadding?: boolean;
  } {
    return parseHexInput(input);
  }

  private deserializeTxEntry(input: DefaultBatcherInput): DelegatedTxEntry {
    const { hex, txStage, addShieldedPadding } = this.parseHexInput(
      input.input,
    );
    const bytes = fromHex(hex);

    if (txStage === "unbound") {
      return {
        tx: LedgerTransaction.deserialize(
          "signature" as const,
          "proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnboundTransaction,
        txStage: "unbound",
        addShieldedPadding,
      };
    }
    if (txStage === "finalized") {
      return {
        tx: LedgerTransaction.deserialize(
          "signature" as const,
          "proof" as const,
          "binding" as const,
          bytes,
        ) as FinalizedTransaction,
        txStage: "finalized",
        addShieldedPadding,
      };
    }
    if (txStage === "unproven") {
      return {
        tx: LedgerTransaction.deserialize(
          "signature" as const,
          "pre-proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnprovenTransaction,
        txStage: "unproven",
        addShieldedPadding,
      };
    }
    // Auto-detect: try unbound first, fall back to unproven
    try {
      return {
        tx: LedgerTransaction.deserialize(
          "signature" as const,
          "proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnboundTransaction,
        txStage: "unbound",
        addShieldedPadding,
      };
    } catch {
      return {
        tx: LedgerTransaction.deserialize(
          "signature" as const,
          "pre-proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnprovenTransaction,
        txStage: "unproven",
        addShieldedPadding,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Batch building — worker pool assignment
  // -----------------------------------------------------------------------

  /**
   * Assign each available input to a free worker via the pool's selection
   * algorithm. Each worker handles exactly 1 tx. Workers and input keys
   * are marked as reserved synchronously (no race possible).
   */
  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<DelegatedBatchData> | null {
    if (inputs.length === 0) return null;

    const availableInputs = inputs.filter(
      (input) => !this.inFlightInputKeys.has(this.getInputKey(input)),
    );
    if (availableInputs.length === 0) return null;

    const batchId = ++this.batchCounter;
    const txs: DelegatedTxEntry[] = [];
    const selectedInputs: DefaultBatcherInput[] = [];
    const workerAssignments: { walletIdx: number; slotIdx: number }[] = [];
    const traceInfos: TxTraceInfo[] = [];
    const invalidInputs: DefaultBatcherInput[] = [];

    // Only assign workers from wallets known to have spendable dust.
    // (No fallback to exhausted wallets — hasAvailableCapacity() gates the
    // all-exhausted case, so inputs simply stay queued until dust recovers.)
    const dustFilter = (walletIdx: number): boolean =>
      !this.walletDustExhausted[walletIdx];

    for (const input of availableInputs) {
      // Deserialize BEFORE acquiring a worker. Failures are selected as
      // invalid (no worker) so the processor increments their retries and
      // eventually drops them with a log — never skipped-but-kept forever.
      let entry: DelegatedTxEntry;
      try {
        entry = this.deserializeTxEntry(input);
      } catch (error) {
        this.log.warn(
          `Deserialize failed for #${inputContentHash(input.input)} ` +
            `(retry=${input.retryCount ?? 0}) — marking failed: ${error}`,
        );
        invalidInputs.push(input);
        selectedInputs.push(input);
        continue;
      }

      const worker = this.pool.acquireWorker(dustFilter);
      if (!worker) break; // no free workers

      const txIdx = txs.length + 1;
      txs.push(entry);
      selectedInputs.push(input);
      workerAssignments.push({
        walletIdx: worker.walletIdx,
        slotIdx: worker.slotIdx,
      });
      traceInfos.push({
        label: `B${String(batchId).padStart(2, "0")}:${txIdx}`,
        contentHash: inputContentHash(input.input),
        retry: input.retryCount ?? 0,
        input,
      });
    }

    if (txs.length === 0 && invalidInputs.length === 0) return null;

    // Mark inputs as in-flight and snapshot the keys (synchronous)
    const reservedInputKeys: string[] = [];
    for (const input of selectedInputs) {
      const key = this.getInputKey(input);
      this.inFlightInputKeys.add(key);
      reservedInputKeys.push(key);
    }

    const assignments = traceInfos.map((t, i) => {
      const wa = workerAssignments[i];
      const retry = t.retry > 0 ? ` retry=${t.retry}` : "";
      return `${t.label}/W${wa.walletIdx + 1}:s${wa.slotIdx} #${t.contentHash}${retry}`;
    }).join(", ");
    this.log.log(
      `Built batch B${String(batchId).padStart(2, "0")}: ${txs.length} tx(s) [${assignments}]` +
        (invalidInputs.length > 0 ? ` + ${invalidInputs.length} invalid input(s)` : "") +
        ` [pool: ${this.pool.getStatus()}]`,
    );
    return {
      selectedInputs,
      data: { txs, selectedInputs, workerAssignments, reservedInputKeys, traceInfos, batchId, invalidInputs },
    };
  }

  // -----------------------------------------------------------------------
  // Core pipeline helpers
  // -----------------------------------------------------------------------

  private shouldAddShieldedPadding(entry: DelegatedTxEntry): boolean {
    return entry.addShieldedPadding ?? this.config.addShieldedPadding ?? false;
  }

  /**
   * Wait for at least one dust UTXO to become available.
   * Handles the UTXO regeneration race where a worker is reused right after
   * its previous tx confirms but the change output hasn't been indexed yet.
   * Does not throw — if dust remains unavailable the subsequent balance call
   * will fail and the input goes back to the retry queue.
   */
  private async waitForDustAvailability(
    walletIndex: number,
    timeoutMs?: number,
  ): Promise<void> {
    const effectiveTimeoutMs = timeoutMs ?? this.config.dustWaitTimeoutMs ?? 60_000;
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    // Value-aware gate: a coin only counts when its generated value covers
    // fee + overhead — never a bare availableCoins.length check.
    try {
      const info = await this.getSpendableDustInfo(walletIndex);
      if (info.spendable > 0) {
        this.walletDustExhausted[walletIndex] = false;
        return;
      }
      this.log.log(
        `Wallet ${label}: no SPENDABLE dust (${info.total} coins, values=[${
          info.values.map(formatDust).join(", ")
        }] DUST), waiting up to ${effectiveTimeoutMs}ms...`,
      );
    } catch {
      return;
    }

    const start = Date.now();
    while (Date.now() - start < effectiveTimeoutMs) {
      await new Promise((r) => setTimeout(r, 1_000));
      try {
        const info = await this.getSpendableDustInfo(walletIndex);
        if (info.spendable > 0) {
          this.log.log(
            `Wallet ${label}: spendable dust available after ${Date.now() - start}ms ` +
              `(${info.spendable}/${info.total} coins)`,
          );
          this.walletDustExhausted[walletIndex] = false;
          return;
        }
      } catch {
        // Keep polling
      }
    }
    this.walletDustExhausted[walletIndex] = true;
    this.log.warn(
      `Wallet ${label}: dust still unavailable after ${effectiveTimeoutMs}ms, proceeding to balance (will likely fail and re-queue)`,
    );
  }

  /**
   * Balance a single entry against a specific wallet's dust.
   * CALLER MUST hold the wallet's balance lock.
   */
  private async balanceEntry(
    entry: DelegatedTxEntry,
    walletIndex: number,
  ): Promise<BalancingRecipe> {
    const walletResult = this.walletResults[walletIndex]!;

    let recipe: BalancingRecipe;

    // NOTE: no facade wallet.state() read here — under dust-only sync the aux
    // sub-wallets are suspended, so the combined observable never emits and a
    // timeout-guarded read silently burned its full timeout on EVERY balance.
    // waitForDustAvailability reads the dust sub-wallet state directly.
    //
    // Dust waiting is deliberately excluded from the TTL floor: it has already
    // elapsed when the injected clock is sampled. Keep this immediately beside
    // the SDK balance call so no new staleness window opens before dust is
    // committed.
    await waitForDustThenEnforceTtl({
      waitForDust: () => this.waitForDustAvailability(walletIndex),
      prepareForSpend: async () => {
        if (this.shouldAddShieldedPadding(entry) && entry.txStage === "unproven") {
          try {
            const paddedTx = await this.applyShieldedPadding(
              entry.tx as UnprovenTransaction,
              true,
              walletIndex,
            );
            entry = { tx: paddedTx, txStage: "unproven" };
          } catch (e) {
            this.log.warn(
              "Shielded padding unavailable, submitting without padding. " +
                `Ensure the batcher wallet has shielded NIGHT tokens. ${e}`,
            );
          }
        }
      },
      tx: () => entry.tx as unknown as PolicyInspectableTx,
      now: Date.now,
      minRemainingMs: preSpendTtlFloorMs(this.config),
    });

    const keys = {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    };
    // Restrict balancing to dust ONLY. The batcher's purpose is to pay fees;
    // it must NOT balance the user's shielded/unshielded portion.
    //
    // Without this, balanceFinalizedTransaction defaults to tokenKindsToBalance:'all',
    // which makes the batcher's wallet call shielded.balanceTransaction() on the
    // user's tx. For a mint output (an unbalanced shielded outflow with no input)
    // the batcher's shielded balancer either tries to spend a coin it doesn't own
    // or absorbs the imbalance into its own wallet — either way the user never
    // sees the minted coin in their balance.
    //
    // Shielded padding (when enabled via addShieldedPadding) is added separately
    // via applyShieldedPadding(), so this restriction does not break it.
    const opts = { ttl: createTtl(), tokenKindsToBalance: ["dust"] as const };

    switch (entry.txStage) {
      case "unbound":
        recipe = await walletResult.wallet.balanceUnboundTransaction(
          entry.tx as UnboundTransaction,
          keys,
          opts,
        );
        if (
          this.shouldAddShieldedPadding(entry) && recipe.balancingTransaction
        ) {
          try {
            recipe.balancingTransaction = await this.applyShieldedPadding(
              recipe.balancingTransaction,
              true,
              walletIndex,
            );
          } catch (e) {
            this.log.warn("Shielded padding unavailable: " + e);
          }
        }
        break;
      case "finalized":
        recipe = await walletResult.wallet.balanceFinalizedTransaction(
          entry.tx as FinalizedTransaction,
          keys,
          opts,
        );
        if (
          this.shouldAddShieldedPadding(entry) && recipe.balancingTransaction
        ) {
          try {
            recipe.balancingTransaction = await this.applyShieldedPadding(
              recipe.balancingTransaction,
              true,
              walletIndex,
            );
          } catch (e) {
            this.log.warn("Shielded padding unavailable: " + e);
          }
        }
        break;
      case "unproven":
        recipe = await walletResult.wallet.balanceUnprovenTransaction(
          entry.tx as UnprovenTransaction,
          keys,
          opts,
        );
        break;
    }

    return recipe;
  }

  private async applyShieldedPadding(
    balancingTx: UnprovenTransaction,
    payFees: boolean,
    walletIndex: number,
  ): Promise<UnprovenTransaction> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) throw new Error("Wallet not initialized");

    this.log.log("[balancing] Adding shielded padding...");
    const keys = walletResult.walletZswapSecretKeys;

    // deno-lint-ignore no-explicit-any
    const initialState = await getInitialShieldedState(
      (walletResult.wallet as any).shielded,
    );
    const receiverAddress = initialState.address;
    if (!this.config.shieldedPaddingTokenID) {
      throw new Error(
        "shieldedPaddingTokenID must be set when addShieldedPadding is true",
      );
    }
    const type = this.config.shieldedPaddingTokenID;
    const outputs: ShieldedTokenTransfer[] = [
      { type: "shielded", outputs: [{ type, receiverAddress, amount: 1n }] },
    ];
    const conf = {
      shieldedSecretKeys: keys,
      dustSecretKey: walletResult.walletDustSecretKey,
    };
    const opt = { ttl: createTtl(), payFees };
    const paddingRecipe = await walletResult.wallet.transferTransaction(
      outputs,
      conf,
      opt,
    );
    return balancingTx.merge(paddingRecipe.transaction);
  }

  // -----------------------------------------------------------------------
  // Per-worker tx pipeline
  // -----------------------------------------------------------------------

  /**
   * Process a single tx through the full pipeline on its assigned worker:
   *   1. Hard/policy/params/full validation gate (outside the lock)
   *   2. Acquire wallet balance lock and wait for dust
   *   3. Check TTL, then balance (speculative chaining — serialized per wallet)
   *   4. Release balance lock
   *   5. Sign + Finalize / Prove (concurrent — proof server is multi-threaded)
   *   6. Submit to mempool
   *
   * Returns the tx hash on success, throws on failure.
   */
  private async processWorkerTx(
    entry: DelegatedTxEntry,
    walletIdx: number,
    slotIdx: number,
    trace: TxTraceInfo,
  ): Promise<string> {
    const walletResult = this.walletResults[walletIdx]!;
    const w = `W${walletIdx + 1}:s${slotIdx}`;
    const tag = `${trace.label}/${w} #${trace.contentHash}`;
    const retryTag = trace.retry > 0 ? ` [retry ${trace.retry}/3]` : "";
    const pipelineStart = performance.now();

    // Recheck untrusted storage, then policy, cache readiness and full WASM
    // validation — all before acquiring the wallet balance lock or waiting for
    // dust. Deterministic verdicts and our own inability to judge travel on
    // distinct typed channels into the per-input BatchOutcome.
    await runPreSpendGate({
      hardGateVerdict: () => this.hardGateVerdict(entry),
      policyVerdict: isPolicyEnforced(
          this.config.policy as MidnightTxPolicy<never> | undefined,
        )
        ? () =>
          evaluatePolicy(
            {
              tx: entry.tx as unknown as PolicyInspectableTx,
              txStage: entry.txStage,
              input: trace.input,
            },
            this.config.policy as
              | MidnightTxPolicy<PolicyInspectableTx>
              | undefined,
          )
        : undefined,
      getParams: () => this.ledgerParams.get(),
      validate: async (params) => {
        const job = buildPreSpendValidationJob(
          trace.input,
          entry.txStage,
          params.serialize(),
          this.walletNetworkId,
          Date.now(),
        );
        this.validationExecutorHandle ??= acquireValidationExecutor();
        return await this.validationExecutorHandle.executor.submit(job);
      },
    });

    // --- Phase 1: Balance (under wallet lock) ---
    this.log.log(`[${tag}] Acquiring balance lock${retryTag}...`);
    const releaseBalanceLock = await this.pool.acquireBalanceLock(walletIdx);
    let recipe: BalancingRecipe;
    const balanceStart = performance.now();
    const dustBefore = await this.getDustBalance(walletIdx);
    try {
      this.log.log(`[${tag}] Balancing (${entry.txStage})...`);
      recipe = await this.balanceEntry(entry, walletIdx);
    } finally {
      releaseBalanceLock();
    }
    // Refresh cached UTXO count in the background so the next tx's fast
    // path reflects what's left after this balance.
    void this.refreshUtxoCountAfterBalance(walletIdx);
    const dustAfter = await this.getDustBalance(walletIdx);
    const dustCost = dustBefore - dustAfter;
    const balanceMs = Math.round(performance.now() - balanceStart);
    this.log.log(`[${tag}] Balanced (${balanceMs}ms) — dust cost: ${formatDust(dustCost)} DUST`);

    // --- Phase 2: Sign + Finalize (no lock — concurrent safe) ---
    // signRecipe failures are NOT auto-reverted by the facade (finalizeRecipe
    // and submitTransaction are) — without an explicit revert, the dust coin
    // booked by balanceEntry is stranded in pendingDust until the 3h grace
    // period, permanently shrinking the fee-lane pool (grand-e2e root cause).
    const proveStart = performance.now();
    let signedRecipe;
    try {
      signedRecipe = await walletResult.wallet.signRecipe(
        recipe,
        (payload: Uint8Array) =>
          walletResult.unshieldedKeystore.signData(payload),
      );
    } catch (error) {
      this.log.warn(`[${tag}] signRecipe failed — reverting booked dust: ${error}`);
      await walletResult.wallet.revert(recipe).catch((e) =>
        this.log.warn(`[${tag}] revert after signRecipe failure also failed: ${e}`)
      );
      throw error;
    }
    const finalized = await walletResult.wallet.finalizeRecipe(signedRecipe);
    const proveMs = Math.round(performance.now() - proveStart);
    this.log.log(`[${tag}] Proved (${proveMs}ms)`);

    // Finalization registers this transaction in the wallet's pending service.
    // Guard the WHOLE validation call (including serialization, parameter
    // encoding and executor acquisition): any throw must revert the finalized
    // entry before it can leave this method, or its dust stays booked for the
    // wallet's three-hour grace period.
    await runPreSubmitGate({
      getParams: () => this.ledgerParams.get(),
      validateFinalized: async (params) => {
        const job = buildPreSubmitValidationJob(
          finalized.serialize(),
          params.serialize(),
          this.walletNetworkId,
          Date.now(),
        );
        this.validationExecutorHandle ??= acquireValidationExecutor();
        return await this.validationExecutorHandle.executor.submit(job);
      },
      revertFinalized: () =>
        safeRevertFinalized({
          revertTransaction: () =>
            walletResult.wallet.revertTransaction(finalized),
          context: tag,
          onFailure: (reason) => {
            this.hardPausedReason ??= reason;
          },
          onSuccess: () =>
            this.log.log(
              `[${tag}] Reverted finalized transaction — dust lane is reusable`,
            ),
          onError: (reason) => this.log.error(`🛑 ${reason}`),
        }),
      revalidateOriginal: async (params) => {
        const job = buildPreSpendValidationJob(
          trace.input,
          entry.txStage,
          params.serialize(),
          this.walletNetworkId,
          Date.now(),
        );
        this.validationExecutorHandle ??= acquireValidationExecutor();
        return await this.validationExecutorHandle.executor.submit(job);
      },
    });

    // --- Phase 3: Submit ---
    const txHash = finalized.transactionHash().toString();

    // Diagnostic: dump what the merged tx is going to put on chain. Specifically,
    // we want to see (a) the per-segment imbalances (a missing entry for a token
    // that should be present means the user's output was stripped during merge)
    // and (b) the intent identifiers (one per intent — if only the batcher's
    // intent is here, the user's intent disappeared during balance/merge).
    try {
      // deno-lint-ignore no-explicit-any
      const ftx = finalized as any;
      const ids = typeof ftx.identifiers === "function" ? ftx.identifiers() : undefined;
      const segImbalances: Record<string, unknown> = {};
      for (const seg of [0, 1]) {
        try {
          const m = typeof ftx.imbalances === "function" ? ftx.imbalances(seg) : undefined;
          if (m && typeof m.entries === "function") {
            const entries: [string, string][] = [];
            for (const [k, v] of m.entries() as Iterable<[unknown, bigint]>) {
              entries.push([
                typeof k === "object" && k !== null ? JSON.stringify(k, (_, vv) => typeof vv === "bigint" ? vv.toString() : vv) : String(k),
                v.toString(),
              ]);
            }
            segImbalances[`seg${seg}`] = entries;
          }
        } catch (_e) {
          // ignore — segment may not exist
        }
      }
      this.log.log(`[${tag}] merged-tx ids=${JSON.stringify(ids)} imbalances=${JSON.stringify(segImbalances)}`);
    } catch (e) {
      this.log.warn(`[${tag}] merged-tx diagnostic failed: ${e}`);
    }

    this.log.log(`[${tag}] Submitting (hash: ${txHash})...`);
    const submitStart = performance.now();

    // Keep a handle on the real submit promise: when the race times out we
    // proceed optimistically (tx may still land), but if the underlying
    // submit ultimately REJECTS, its booked dust must be reverted — otherwise
    // the coin is stranded until the grace period.
    const submitPromise = walletResult.wallet.submitTransaction(finalized);
    let timedOut = false;
    submitPromise.catch((err) => {
      if (!timedOut) return; // non-timeout failures are handled below / by the facade
      this.log.warn(
        `[${tag}] submit ultimately failed after timeout — reverting booked dust: ${err}`,
      );
      void walletResult.wallet.revertTransaction(finalized).catch(() => {});
    });
    try {
      await Promise.race([
        submitPromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("submitTransaction timed out")),
            SUBMIT_TX_TIMEOUT_MS,
          )
        ),
      ]);
      const submitMs = Math.round(performance.now() - submitStart);
      const totalMs = Math.round(performance.now() - pipelineStart);
      this.log.log(
        `[${tag}] ✅ Submitted (balance=${balanceMs}ms prove=${proveMs}ms submit=${submitMs}ms total=${totalMs}ms)`,
      );
    } catch (error) {
      const errMsg = (error instanceof Error ? error.message : String(error))
        .trim();
      if (errMsg.includes("IntentAlreadyExists")) {
        this.log.log(
          `[${tag}] IntentAlreadyExists — already in mempool, treating as success`,
        );
      } else if (errMsg.includes("submitTransaction timed out")) {
        // The tx was submitted to the node but the WebSocket subscription for
        // InBlock/Finalized status didn't respond in time. The tx may still be
        // in the mempool or already in a block. Return the hash and let
        // waitForTransactionReceipt verify confirmation via the indexer.
        const submitMs = Math.round(performance.now() - submitStart);
        this.log.warn(
          `[${tag}] submitTransaction timed out after ${submitMs}ms — tx may still land, proceeding with hash`,
        );
      } else {
        const submitMs = Math.round(performance.now() - submitStart);
        this.log.error(
          `[${tag}] ❌ Submit failed after ${submitMs}ms: ${errMsg}`,
        );
        throw error;
      }
    }

    return txHash;
  }

  // -----------------------------------------------------------------------
  // Submit batch
  // -----------------------------------------------------------------------

  /**
   * Run per-worker pipelines in parallel. Each worker independently:
   * validate (unlocked) → balance (locked) → prove (unlocked) → submit.
   *
   * Workers are released by releaseBatchResources (called by BatchProcessor
   * in its finally block after all storage operations complete). Workers
   * must NOT be released here — doing so causes a double-release race where
   * a subsequent batch acquires the worker, then releaseBatchResources frees
   * it while the new batch is still using it.
   */
  async submitBatch(
    batchData: DelegatedBatchData,
    _fee?: string | bigint,
  ): Promise<BatchSubmitResult<DefaultBatcherInput>> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    if (!this.isInitialized) {
      throw new Error("Adapter not initialized");
    }
    if (this.hardPausedReason !== null) {
      this.log.error(
        `Refusing batch while adapter is hard-paused: ${this.hardPausedReason}`,
      );
      return hardPausedBatchOutcome(
        this.hardPausedReason,
        batchData.selectedInputs,
      );
    }

    return await this._executeWorkerPipelines(batchData);
  }

  private async _executeWorkerPipelines(
    batchData: DelegatedBatchData,
  ): Promise<BatchOutcome<DefaultBatcherInput>> {
    const { txs, workerAssignments, traceInfos, batchId } = batchData;
    const bTag = `B${String(batchId).padStart(2, "0")}`;

    // Intake normally prevents these. A tampered/corrupt stored row still gets
    // the legacy bounded-retry treatment, now explicitly rather than through
    // selectedInputs mutation.
    if (batchData.invalidInputs.length > 0) {
      this.log.warn(
        `[${bTag}] ${batchData.invalidInputs.length} invalid input(s) marked failed (deserialize)`,
      );
    }

    this.log.log(
      `[${bTag}] Processing ${txs.length} tx(s) [pool: ${this.pool.getStatus()}]`,
    );

    // Run all worker pipelines in parallel
    const results = await Promise.allSettled(
      txs.map((entry, i) => {
        const wa = workerAssignments[i];
        return this.processWorkerTx(entry, wa.walletIdx, wa.slotIdx, traceInfos[i]);
      }),
    );

    const outcome = buildWorkerBatchOutcome(
      batchData.invalidInputs,
      traceInfos.map((trace) => trace.input),
      results,
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") {
        const classified = classifyWorkerFailure(traceInfos[i].input, r.reason);
        this.log.warn(
          `  ${traceInfos[i].label} #${traceInfos[i].contentHash} ` +
            `[${classified.category}]: ${
              r.reason instanceof Error ? r.reason.message : String(r.reason)
            }`,
        );
      }
    }

    this.log.log(
      `[${bTag}] Results: ${outcome.submitted?.length ?? 0} submitted, ` +
        `${outcome.permanentRejected?.length ?? 0} permanently rejected, ` +
        `${outcome.retryable?.length ?? 0} deferred, ` +
        `${outcome.failed?.length ?? 0} retry-charged, ` +
        `${outcome.invariantFailure?.inputs?.length ?? 0} invariant-parked`,
    );

    if (outcome.hash) this.log.log(`[${bTag}] Hashes: ${outcome.hash}`);
    return outcome;
  }

  // -----------------------------------------------------------------------
  // Interface: receipt polling
  // -----------------------------------------------------------------------

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 300000,
  ): Promise<BlockchainTransactionReceipt> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    const effectiveTimeout = Math.max(timeout, 300000);
    const hashes = hash.split(",");
    let lastReceipt: BlockchainTransactionReceipt | null = null;

    this.log.log(
      `waitForTransactionReceipt: ${hashes.length} hash(es), timeout: ${effectiveTimeout}ms`,
    );

    for (const h of hashes) {
      const receipt = await this.waitForSingleReceipt(h, effectiveTimeout);
      lastReceipt = receipt;
    }

    return { ...lastReceipt!, hash };
  }

  private async waitForSingleReceipt(
    hash: string,
    timeout: number,
  ): Promise<BlockchainTransactionReceipt> {
    this.log.log(`Waiting for receipt for ${hash} (timeout: ${timeout}ms)...`);
    const startTime = Date.now();
    let normalizedHash = hash.toLowerCase().replace(/^0x/, "");
    if (normalizedHash.length > 64) {
      normalizedHash = normalizedHash.slice(-64);
    } else if (normalizedHash.length < 64) {
      normalizedHash = normalizedHash.padStart(64, "0");
    }

    const query = `query ($hash: String!) {
      transactions(offset: { hash: $hash }) {
        hash
        block { height }
      }
    }`;

    let lastLogTime = startTime;
    while (Date.now() - startTime < timeout) {
      const now = Date.now();
      if (now - lastLogTime > 10000) {
        this.log.log(
          `Still waiting for ${hash} (${
            Math.round((now - startTime) / 1000)
          }s elapsed)...`,
        );
        lastLogTime = now;
      }

      try {
        const response = await fetch(this.config.indexer, {
          method: "POST",
          body: JSON.stringify({ query, variables: { hash: normalizedHash } }),
          headers: { "Content-Type": "application/json" },
        });
        const body = await response.json();

        if (!body?.data?.transactions) {
          this.log.log(
            `Unexpected indexer response for ${hash}: ${JSON.stringify(body)}`,
          );
        }

        const tx = body.data?.transactions?.[0];
        if (tx?.block) {
          this.log.log(`Found receipt for ${hash} at block ${tx.block.height}`);
          return { hash, blockNumber: BigInt(tx.block.height), status: 1 };
        }
      } catch (err) {
        this.log.log(`Receipt query error for ${hash}: ${err}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    this.log.log(
      `Transaction confirmation timeout for ${hash} after ${timeout}ms`,
    );
    throw new Error(`Transaction confirmation timeout: ${hash}`);
  }

  // -----------------------------------------------------------------------
  // Interface: misc
  // -----------------------------------------------------------------------

  estimateBatchFee(_data: DelegatedBatchData): bigint {
    return 0n;
  }

  /**
   * Operational snapshot for /queue-stats. In a multi-product batcher this is
   * how you see WHICH product is out of fee capacity without reading logs.
   * Uses cached state only — no chain/indexer calls, safe to poll.
   */
  getHealthInfo(): Record<string, unknown> {
    const now = Date.now();
    return {
      wallets: this.walletSeeds.length,
      walletsReady: this.walletInitialized.filter(Boolean).length,
      // Without this a slow start and a permanently broken one look the same:
      // a preprod dust cold sync runs for ~66 minutes, and a snapshot whose
      // offset is past the indexer's log never finishes at all.
      dustSync: this.walletSeeds.map((_seed, i) => {
        const h = this.walletSyncHealth[i];
        return {
          wallet: i + 1,
          state: classifyDustSyncState(h, now, DUST_SYNC_STALLED_AFTER_MS),
          // Where the restore resumed from — 0 means this wallet replayed the
          // whole chain, which is the number that explains a slow start.
          restoredFrom: h ? h.restoredFromOffset.toString() : null,
          appliedIndex: h ? h.appliedIndex.toString() : null,
          target: h && h.target > 0n ? h.target.toString() : null,
          behind: h && h.target > h.appliedIndex
            ? (h.target - h.appliedIndex).toString()
            : "0",
          connected: h?.isConnected ?? false,
          lastAdvanceAgeMs: h ? now - h.advancedAtMs : null,
          snapshot: !h
            ? "unknown"
            : h.snapshotRejected
            ? "rejected"
            : h.restoredFromOffset > 0n
            ? "restored"
            : "cold",
        };
      }),
      // "live" means dust generation was projected at wall clock. "sync-time"
      // means it fell back to the wallet's last applied event, which on a quiet
      // chain can be far in the past and reads as false starvation.
      dustClock: this.dustValuesUseLiveClock ? "live" : "sync-time",
      dustUtxos: this.availableDustUtxoCounts.map((c) => c ?? 0),
      dustExhausted: this.walletInitialized.every(
        (ok, i) => !ok || this.walletDustExhausted[i],
      ),
      workersBusy: this.pool.getTotalWorkerCount() - this.pool.getFreeWorkerCount(),
      workersTotal: this.pool.getTotalWorkerCount(),
      inFlightInputs: this.inFlightInputKeys.size,
      // Without this a 503 is a mystery: an operator cannot tell "indexer
      // unreachable" from "misconfigured" from "only just started".
      ledgerParams: this.ledgerParams.health(),
      hardPause: hardPauseHealthInfo(this.hardPausedReason),
      policy: !isPolicyEnforced(this.config.policy as MidnightTxPolicy<never> | undefined)
        ? "allow-all"
        : {
          allowZswapTransfers: this.config.policy?.allowZswapTransfers ?? false,
          allowedContracts: this.config.policy?.allowedContracts?.length ?? 0,
          allowedCircuits: this.config.policy?.allowedCircuits?.length ?? 0,
          customFilter: Boolean(this.config.policy?.allowCustomFinalFilter),
        },
    };
  }

  /**
   * Release this adapter's exclusive claim on its wallet seeds.
   *
   * The claim is process-wide and taken at construction, so without this a
   * batcher that is torn down and rebuilt in the same process — a
   * reconfiguration, or a test suite building several adapters — would fail on
   * the second construction with "wallet seed already in use". The release is
   * ownership-checked, so it can only drop claims this adapter actually holds.
   */
  private claimWallet(walletResult: unknown): void {
    const key = claimWalletInstance(
      walletResult,
      this.config.logLabel ?? "unlabeled adapter",
    );
    if (key) this.claimedWalletKeys.push(key);
  }

  async close(): Promise<void> {
    // Before anything that can throw: a leaked interval keeps the process
    // alive after shutdown.
    this.ledgerParams.close();

    // Checkpoint dust state BEFORE anything stops the wallets — a stopped
    // wallet cannot serialize, which is why shutdown used to lose everything
    // since the last init-time save. Each handle takes one final snapshot.
    await Promise.all(
      this.dustStateAutosaves.map(async (handle, index) => {
        try {
          await handle?.stop();
        } catch (error) {
          this.log.warn(
            `Wallet ${index + 1}/${this.walletSeeds.length}: final dust checkpoint failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
    this.dustStateAutosaves = new Array(this.walletSeeds.length).fill(null);
    const executorHandle = this.validationExecutorHandle;
    this.validationExecutorHandle = null;
    if (executorHandle) {
      await executorHandle.release().catch((error) =>
        this.log.warn(
          `validation executor release failed during close: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      );
    }
    releaseWalletSeeds(this.seedClaim);
    // Only keys this adapter claimed are in the list, so this cannot drop
    // another adapter's claim even if two share a log label.
    for (const key of this.claimedWalletKeys) claimedWalletInstances.delete(key);
    this.claimedWalletKeys = [];

    for (const [index, result] of this.walletResults.entries()) {
      // An injected wallet belongs to whoever passed it in and may well still
      // be in use there; stopping it would break a caller that did nothing
      // wrong. We stop only what we built.
      if (this.walletIsInjected[index]) continue;
      try {
        await (result as { wallet?: { stop?: () => Promise<void> } })?.wallet
          ?.stop?.();
      } catch (error) {
        this.log.warn(
          `wallet stop failed during close: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  verifySignature(_input: DefaultBatcherInput): boolean {
    return true;
  }

  /**
   * Reject oversized or undeserializable payloads at /send-input time,
   * BEFORE they enter the queue. A hex-shape check is not enough: valid hex
   * that is not a serialized Midnight transaction would be accepted, fail
   * deserialization on every poll tick, and (pre-hardening) sit in the queue
   * forever. Running the real deserializer here makes intake authoritative.
   */
  async validateInput(input: DefaultBatcherInput): Promise<ValidationResult> {
    const maxChars = this.config.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
    if (input.input.length > maxChars) {
      return {
        valid: false,
        error: `Input too large (${input.input.length} chars, max ${maxChars})`,
      };
    }
    let entry: DelegatedTxEntry;
    try {
      const { hex } = this.parseHexInput(input.input);
      if (!/^[0-9a-fA-F]+$/.test(hex)) {
        return { valid: false, error: "Input is not valid hex" };
      }
      entry = this.deserializeTxEntry(input);
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    // HARD gates, before any policy runs. A custom filter may tighten what a
    // product sponsors, but must never be able to raise the ceilings that
    // protect the process — so these are not expressible as policy.
    const hardVerdict = this.hardGateVerdict(entry);
    if (hardVerdict) {
      this.log.warn(
        `Refused #${inputContentHash(input.input)} at intake ` +
          `[${hardVerdict.errorCode}]: ${hardVerdict.error}`,
      );
      return hardVerdict;
    }

    // Content-based authorization: declarative rules first, then the custom
    // final filter. Both fail closed.
    const verdict = await evaluatePolicy(
      {
        tx: entry.tx as unknown as PolicyInspectableTx,
        txStage: entry.txStage,
        input,
      },
      this.config.policy as MidnightTxPolicy<PolicyInspectableTx> | undefined,
    );
    if (!verdict.valid) {
      this.log.warn(
        `Policy rejected #${inputContentHash(input.input)} at intake ` +
          `[${verdict.rule}]: ${verdict.reason ?? "no reason given"}`,
      );
      return {
        valid: false,
        error: `Rejected by policy (${verdict.rule}): ${
          verdict.reason ?? "transaction not permitted for this target"
        }`,
      };
    }
    // Cache readiness, checked LAST: a transaction that policy would refuse
    // anyway should be told so, rather than being handed a 503 that invites it
    // to come back and be refused later.
    //
    // Failing closed here means the queue never accepts work we would not be
    // able to validate at spend time — otherwise the failure is merely
    // deferred past the point where it is cheap to report.
    const paramsVerdict = ledgerParamsGateVerdict(this.ledgerParams.get());
    if (paramsVerdict) return paramsVerdict;

    // Derive the replay key off the deserialization this method already did,
    // so the batcher's dedup gate — which asks for it a moment from now — costs
    // nothing extra on the accept path.
    this.memoizeReplayKey(
      this.replayMemoKey(input.input),
      midnightReplayKey(entry.tx as unknown as ReplayIdentifiableTx),
    );

    // Report what this input will actually cost to verify, so the batcher can
    // charge it rather than the flat unit it paid on arrival.
    return {
      valid: true,
      admissionWeight: admissionWeight(entry.tx as unknown as PolicyInspectableTx),
    };
  }

  /**
   * The gates a policy cannot loosen: maintenance updates and structural
   * ceilings. Returns a rejection, or `undefined` when the transaction clears
   * them.
   *
   * Shared by intake and the pre-spend recheck, because storage rows are
   * untrusted — they can be edited on disk, and the limits may have been
   * tightened since the input was accepted. A gate enforced only at intake is
   * not a gate.
   */
  private hardGateVerdict(entry: DelegatedTxEntry): ValidationResult | undefined {
    return hardGateVerdictFor(
      entry.tx as unknown as PolicyInspectableTx,
      this.config.shapeLimits ?? DEFAULT_SHAPE_LIMITS,
    );
  }

  async getBlockNumber(): Promise<bigint> {
    const query = `query { block { height } }`;
    const response = await fetch(this.config.indexer, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: { "Content-Type": "application/json" },
    });
    const body = await response.json();
    return BigInt(body.data?.block?.height ?? 0);
  }
}

/**
 * Translate a ledger-parameter lookup into an intake verdict.
 *
 * Returns `undefined` when parameters are usable, or a rejection when they are
 * not. Separate from the adapter because the adapter's constructor builds an
 * indexer provider, which would make this untestable without a chain — and an
 * untested fail-closed path is one that quietly fails open.
 *
 * The status is the point. A check that could not COMPLETE is 503, not 400:
 * the input was never judged, so telling the caller their transaction is
 * malformed is both wrong and unactionable. Only "retry shortly" is true.
 */
export function ledgerParamsGateVerdict(
  lookup: LedgerParamsLookup,
): ValidationResult | undefined {
  if (lookup.ok) return undefined;
  return {
    valid: false,
    error:
      `Cannot validate transactions right now: live ledger parameters are ` +
      `unavailable (${lookup.reason}). This is a batcher-side condition; ` +
      `retry shortly.`,
    errorCode: "LEDGER_PARAMS_UNAVAILABLE",
    statusCode: 503,
    retryable: true,
  };
}

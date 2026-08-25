// Well-formedness checking for third-party transactions.
//
// `Transaction.deserialize()` succeeding proves only that bytes parsed. It
// checks none of: network ID, structural well-formedness, signatures, ledger
// limits, or intent TTL. Without this module a policy-conforming but expired,
// foreign-network or malformed transaction costs the sponsor balancing, proving
// and dust before the node rejects it.
//
// The facade's `validateTransaction()` does NOT exist in the installed
// wallet-sdk (only in the reference source), so this builds directly on the
// ledger primitive, mirroring the reference validation service.
//
// This is the INNER layer: synchronous and pure, intended to run inside a
// worker (§3.4). It never fetches — parameters are passed in, because a
// request path must not be able to trigger network I/O.

import type { PolicyInspectableTx } from "./midnight-policy.ts";

export type ValidationPhase = "intake" | "pre-spend" | "pre-submit";
export type TxStage = "unproven" | "unbound" | "finalized";

/** The five `WellFormedStrictness` fields. ALL are set explicitly — see below. */
export interface StrictnessFlags {
  enforceBalancing: boolean;
  verifySignatures: boolean;
  enforceLimits: boolean;
  verifyNativeProofs: boolean;
  verifyContractProofs: boolean;
}

export interface WellFormedVerdict {
  valid: boolean;
  errorCode?: "NOT_WELL_FORMED" | "TTL_TOO_SHORT" | "TTL_UNREADABLE";
  reason?: string;
  /**
   * Opt-in execution evidence from the child worker. Normal hot-path jobs do
   * not request this. It exists so a live-stack verifier can prove which
   * stage and exact flags reached the WASM binding instead of inferring them
   * from the caller-side job alone.
   */
  diagnostics?: {
    phase: ValidationPhase;
    txStage: TxStage;
    strictness: StrictnessFlags;
  };
}

/**
 * Strictness for a (phase, stage) pair.
 *
 * Two rules that are easy to get wrong and expensive to get wrong:
 *
 * 1. `new WellFormedStrictness()` defaults EVERY field to `true`. Any field not
 *    set explicitly is therefore on, which is why this returns all five rather
 *    than a partial object.
 * 2. Both proof flags are **always false**. `verifyNativeProofs` is inert in
 *    this build (the dust check is compiled out). `verifyContractProofs` is
 *    worse than inert: when true it runs `op_check` against the reference state
 *    before reaching the compiled-out verifier, and against a blank state that
 *    FALSE-REJECTS valid contract calls. Zswap offer proofs are verified
 *    regardless of either flag.
 */
export function strictnessFor(phase: ValidationPhase, txStage: TxStage): StrictnessFlags {
  const base: StrictnessFlags = {
    enforceBalancing: false,
    verifySignatures: false,
    enforceLimits: false,
    verifyNativeProofs: false,
    verifyContractProofs: false,
  };

  // Our own finalized output, about to be submitted: everything we can check.
  if (phase === "pre-submit") {
    return { ...base, enforceBalancing: true, verifySignatures: true, enforceLimits: true };
  }

  // Incoming work. A finalized transaction carries signatures, so verify them;
  // it is NOT balanced yet (the batcher supplies the dust), so balancing must
  // stay off or every legitimate submission is rejected.
  if (txStage === "finalized") return { ...base, verifySignatures: true };

  // Unproven / unbound: nothing to verify yet.
  return base;
}

/** The ledger surface this module needs, injectable so tests need no WASM. */
export interface LedgerBinding {
  blankState(networkId: string, params: unknown): unknown;
  makeStrictness(flags: StrictnessFlags): unknown;
  wellFormed(tx: unknown, state: unknown, strictness: unknown, now: Date): void;
}

export interface ValidateArgs {
  phase: ValidationPhase;
  /**
   * MUST come from the successful typed deserializer, never from
   * caller-supplied metadata: it selects whether signatures are verified, so a
   * caller who could set it could turn that check off.
   */
  txStage: TxStage;
  networkId: string;
  /** Live ledger parameters. Required — an optional value would defeat §3.2. */
  params: unknown;
  /** Milliseconds since epoch. A clock object cannot cross a worker boundary. */
  nowMs: number;
}

/**
 * Run the ledger's well-formedness check. Fails CLOSED: a throw from the
 * WASM boundary is a rejection, never a pass.
 */
export function validateWellFormed(
  tx: unknown,
  args: ValidateArgs,
  ledger: LedgerBinding,
): WellFormedVerdict {
  try {
    const state = ledger.blankState(args.networkId, args.params);
    const strictness = ledger.makeStrictness(strictnessFor(args.phase, args.txStage));
    ledger.wellFormed(tx, state, strictness, new Date(args.nowMs));
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      errorCode: "NOT_WELL_FORMED",
      // Bounded: the ledger's reason is attacker-influenced, so it is capped
      // rather than echoed wholesale.
      reason: boundedReason(error),
    };
  }
}

const MAX_REASON_CHARS = 512;

export function boundedReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.length <= MAX_REASON_CHARS ? raw : `${raw.slice(0, MAX_REASON_CHARS)}…`;
}

/**
 * Cheap TTL-margin check, run immediately before balancing (§3.6 step 6) —
 * separate from the full check because it must be re-evaluated at the true
 * spend boundary without paying for another multi-second verification.
 *
 * TTL lives on INTENTS. A pure shielded transfer has none, so it has no TTL and
 * cannot expire; those skip this rule entirely rather than being rejected.
 * A missing or unreadable TTL on an intent that HAS one fails closed.
 *
 * `minRemainingMs` covers what is still ahead — balance, prove, finalize,
 * submit, inclusion — and must NOT include the dust wait, which has already
 * elapsed by the time this runs.
 */
export function checkTtlMargin(
  tx: PolicyInspectableTx,
  nowMs: number,
  minRemainingMs: number,
): WellFormedVerdict {
  let intents: { ttl?: Date | number | bigint | undefined }[];
  try {
    const map = tx.intents;
    intents = map && typeof map.values === "function" ? [...map.values()] : [];
  } catch (error) {
    return { valid: false, errorCode: "TTL_UNREADABLE", reason: boundedReason(error) };
  }

  // No intents ⇒ no TTL ⇒ nothing to expire. Not a pass by luck: a transfer
  // genuinely has no expiry to check.
  if (intents.length === 0) return { valid: true };

  for (const intent of intents) {
    const ttlMs = readTtlMs(intent?.ttl);
    if (ttlMs === null) {
      return {
        valid: false,
        errorCode: "TTL_UNREADABLE",
        reason: "an intent carries a TTL that could not be read",
      };
    }
    const remaining = ttlMs - nowMs;
    if (remaining < minRemainingMs) {
      return {
        valid: false,
        errorCode: "TTL_TOO_SHORT",
        reason:
          `intent expires in ${Math.max(0, remaining)}ms, which is less than the ` +
          `${minRemainingMs}ms the remaining pipeline needs`,
      };
    }
  }
  return { valid: true };
}

/** Intent TTLs arrive as Date, epoch ms, or seconds depending on the stage. */
function readTtlMs(ttl: unknown): number | null {
  if (ttl instanceof Date) {
    const t = ttl.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof ttl === "bigint") return Number(ttl);
  if (typeof ttl === "number") return Number.isFinite(ttl) ? ttl : null;
  return null;
}

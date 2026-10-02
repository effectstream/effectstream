// Relayer job selection and backoff (pure; unit-tested over a test DB).
//
// A transfer is a relayer CANDIDATE while the state machine has it `observed`
// (with a known recipient). It is DUE when:
//   - the relayer never attempted it, or
//   - its last attempt is older than the backoff for its attempt count,
// and no attempt for it is in flight in this process. At most one attempt per
// direction is in flight at a time (the Midnight adapter proves one mint at a
// time anyway; releases are cheap but are kept serial for clear receipts).
//
// The relayer never decides completion: a submitted transfer leaves the
// candidate list only when sync sees the counterpart (the state machine marks
// it `completed`). Until then the backoff keeps re-attempts rare, and the
// on-chain guards (mintedLocks / the release receipt PDA) make every re-attempt
// harmless.

export type Direction = "s2m" | "m2s";

export type RelayerCandidate = {
  direction: Direction;
  sourceId: bigint;
  amount: bigint;
  recipient: string;
  attempts: number;
  lastAttemptAt: Date | null;
  lastTx: string | null;
  lastError: string | null;
};

export type BackoffPolicy = {
  /** Wait after the first attempt. */
  baseMs: number;
  /** Cap for the exponential growth. */
  maxMs: number;
};

export const DEFAULT_POLICIES: Record<Direction, BackoffPolicy> = {
  // A mint proves on rc.8 (~20 s) and finalizes (~20 s) before sync can see it.
  s2m: { baseMs: 120_000, maxMs: 900_000 },
  // A release lands in seconds; sync needs the 32-slot confirmation depth.
  m2s: { baseMs: 60_000, maxMs: 600_000 },
};

/** Delay before re-attempting after `attempts` attempts (attempts >= 1). */
export function backoffMs(attempts: number, policy: BackoffPolicy): number {
  if (attempts <= 0) return 0;
  const exp = Math.min(attempts - 1, 20);
  return Math.min(policy.baseMs * 2 ** exp, policy.maxMs);
}

export function isDue(c: RelayerCandidate, now: number, policy: BackoffPolicy): boolean {
  if (c.attempts <= 0 || c.lastAttemptAt === null) return true;
  return now - c.lastAttemptAt.getTime() >= backoffMs(c.attempts, policy);
}

export const jobKey = (d: Direction, id: bigint) => `${d}:${id}`;

/**
 * The jobs to start now: per direction, the lowest due source id, unless that
 * direction already has an attempt in flight.
 */
export function selectDueJobs(
  candidates: readonly RelayerCandidate[],
  opts: {
    now: number;
    inFlight: ReadonlySet<string>;
    policies?: Record<Direction, BackoffPolicy>;
  },
): RelayerCandidate[] {
  const policies = opts.policies ?? DEFAULT_POLICIES;
  const busy = new Set<Direction>();
  for (const k of opts.inFlight) busy.add(k.split(":")[0] as Direction);
  const out: RelayerCandidate[] = [];
  for (const d of ["s2m", "m2s"] as const) {
    if (busy.has(d)) continue;
    const due = candidates
      .filter((c) => c.direction === d && !opts.inFlight.has(jobKey(d, c.sourceId)) && isDue(c, opts.now, policies[d]))
      .sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
    if (due[0]) out.push(due[0]);
  }
  return out;
}

/** Errors that mean "the counterpart already happened on chain": leave completion to sync. */
export function isReplayRefusal(message: string): boolean {
  return /lock already minted|AlreadyReleased|custom program error: 0x6\b|"Custom":6\b|\bCustom: ?6\b|receipt exists/i.test(message);
}

/**
 * Batcher failures it parks and retries by itself (no dust, unreachable
 * node/indexer/prover, timeouts): the same classification as the engine's
 * BatchProcessor.isInfraFailure, which is not exported. The attempt keeps
 * waiting for its receipt instead of being abandoned.
 */
export function isInfraFailure(message: string): boolean {
  return /could not balance dust|Insufficient Funds|Unable to connect|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket|network|timed? ?out|Service Unavailable|Bad Gateway|502|503|pool timed out/i
    .test(message);
}

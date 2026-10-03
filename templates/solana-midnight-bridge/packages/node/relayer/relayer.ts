// The relayer's polling core (sub-plan T4.1/T4.5), independent of how
// transactions are submitted so the selection, backoff and bookkeeping can be
// tested over a test database with fake submitters.
//
// Each tick:
//   1. read the candidates (observed transfers with a recipient, joined with
//      relayer_jobs) and pick the due ones (policy.ts);
//   2. Midnight → Solana: if the release receipt PDA already exists, the
//      release happened (a previous attempt landed): record that and do not
//      send anything — completion is left to sync. Solana → Midnight: the same
//      with the lock nonce in the contract's mintedLocks;
//   3. record the attempt (relayer_jobs: attempts + 1, submitted_at), then
//      submit in the background and record the outcome (last_tx / last_error).
//
// It writes ONLY relayer_jobs. It never marks a transfer completed: the state
// machine does, when sync sees the counterpart on chain (FR-006).
import {
  listRelayerCandidates,
  recordRelayerAttempt,
  recordRelayerResult,
  type IListRelayerCandidatesResult,
} from "@solana-midnight-bridge/database";
import {
  DEFAULT_POLICIES,
  isReplayRefusal,
  jobKey,
  selectDueJobs,
  type BackoffPolicy,
  type Direction,
  type RelayerCandidate,
} from "./policy.ts";

/** Anything with pg's `query(text, values)` (a pg Pool, or PGLite in tests). */
export type Queryable = { query: (text: string, values?: any[]) => Promise<any> };

export type SubmitResult = { tx: string };

export type RelayerDeps = {
  db: Queryable;
  /** Wraps every DB access (the runtime's DB mutex in the node; identity in tests). */
  withDb?: <T>(fn: () => Promise<T>) => Promise<T>;
  submitMint: (job: RelayerCandidate) => Promise<SubmitResult>;
  submitRelease: (job: RelayerCandidate) => Promise<SubmitResult>;
  /** True when the release receipt PDA for this withdrawal id exists on chain. */
  releaseReceiptExists: (withdrawalId: bigint) => Promise<boolean>;
  /**
   * True when the contract's `mintedLocks` already holds this lock nonce. The
   * embedded batcher runs with its event system off, so a mint refused in the
   * circuit is never reported back (no "error" state transition) and the
   * attempt would wait for the receipt timeout; checking first keeps a
   * re-attempt after a restart from blocking the mint lane (PR-2 T6, F-T6.12).
   */
  mintExists?: (lockNonce: bigint) => Promise<boolean>;
  now?: () => number;
  policies?: Record<Direction, BackoffPolicy>;
  log?: (msg: string) => void;
};

export function toCandidate(r: IListRelayerCandidatesResult): RelayerCandidate {
  return {
    direction: r.direction as Direction,
    sourceId: BigInt(r.source_id),
    amount: BigInt(r.amount),
    // The candidate query only returns rows with a recipient.
    recipient: r.recipient ?? "",
    attempts: r.attempts ?? 0,
    lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at) : null,
    lastTx: r.last_tx ?? null,
    lastError: r.last_error ?? null,
  };
}

const errText = (e: unknown): string => {
  const parts: string[] = [];
  let cur: any = e;
  for (let i = 0; cur && i < 5; i++) {
    parts.push(cur instanceof Error ? cur.message : String(cur));
    cur = cur?.cause;
  }
  return parts.join(" <- ").slice(0, 1000);
};

export class BridgeRelayer {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly withDb: <T>(fn: () => Promise<T>) => Promise<T>;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;

  constructor(private readonly deps: RelayerDeps) {
    this.withDb = deps.withDb ?? ((fn) => fn());
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? ((m) => console.log(`[relayer] ${m}`));
  }

  inFlightKeys(): string[] {
    return [...this.inFlight.keys()];
  }

  /** Waits for every attempt started so far (tests, shutdown). */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()]);
  }

  async candidates(limit = 500): Promise<RelayerCandidate[]> {
    const rows = await this.withDb(() => listRelayerCandidates.run({ limit }, this.deps.db as any));
    return rows.map(toCandidate);
  }

  /** One polling round. Returns the job keys it started. */
  async tick(): Promise<string[]> {
    const due = selectDueJobs(await this.candidates(), {
      now: this.now(),
      inFlight: new Set(this.inFlight.keys()),
      policies: this.deps.policies ?? DEFAULT_POLICIES,
    });
    const started: string[] = [];
    for (const job of due) {
      const key = jobKey(job.direction, job.sourceId);
      started.push(key);
      const run = this.attempt(job).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, run);
    }
    return started;
  }

  private async record(job: RelayerCandidate, result: { tx?: string | null; error?: string | null }) {
    await this.withDb(() =>
      recordRelayerResult.run(
        {
          direction: job.direction,
          source_id: job.sourceId.toString(),
          last_tx: result.tx ?? null,
          last_error: result.error ?? null,
        },
        this.deps.db as any,
      )
    );
  }

  private async attempt(job: RelayerCandidate): Promise<void> {
    const key = jobKey(job.direction, job.sourceId);
    const now = new Date(this.now());
    await this.withDb(() =>
      recordRelayerAttempt.run(
        { direction: job.direction, source_id: job.sourceId.toString(), now },
        this.deps.db as any,
      )
    );
    try {
      if (job.direction === "m2s" && (await this.deps.releaseReceiptExists(job.sourceId))) {
        this.log(`${key}: release receipt already on chain; not sending, waiting for sync`);
        await this.record(job, { error: "release receipt exists on chain; waiting for sync" });
        return;
      }
      if (job.direction === "s2m" && (await this.deps.mintExists?.(job.sourceId))) {
        this.log(`${key}: lock already in mintedLocks on chain; not sending, waiting for sync`);
        await this.record(job, { error: "already settled on chain: lock already in mintedLocks; waiting for sync" });
        return;
      }
      this.log(`${key}: submitting (attempt ${job.attempts + 1}, amount ${job.amount})`);
      const r = job.direction === "s2m" ? await this.deps.submitMint(job) : await this.deps.submitRelease(job);
      this.log(`${key}: landed ${r.tx}`);
      await this.record(job, { tx: r.tx, error: null });
    } catch (e) {
      const msg = errText(e);
      if (isReplayRefusal(msg)) {
        this.log(`${key}: refused on chain as already settled (${msg}); waiting for sync`);
        await this.record(job, { error: `already settled on chain: ${msg}` });
      } else {
        this.log(`${key}: attempt failed: ${msg}`);
        await this.record(job, { error: msg });
      }
    }
  }
}

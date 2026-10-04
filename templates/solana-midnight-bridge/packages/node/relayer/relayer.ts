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
//
// 00058 (plan Interfaces D-2): a Solana → Midnight transfer to a CONTRACT goes
// through the delivery router instead of the wallet mint path:
//   recognise → refuse     → undeliverable (recordUndeliverable; no attempt, NO signature)
//             → retry      → recordRelayerCheck (attempts + 1, backoff; never submitted_at);
//                            a contract still missing after the grace window → not-a-contract
//             → deliverable→ mintedLocks pre-check → recordRelayerAttempt → the router signs the
//                            mint for right(contract) → the adapter's ONE transaction (mint +
//                            receiving call) → recordDelivery {adapter, account, coin, tx}
// Every attempt recognises again (and the adapter re-reads the account's enc_key) before it signs.
import {
  listRelayerCandidates,
  recordDelivery,
  recordRelayerAttempt,
  recordRelayerCheck,
  recordRelayerResult,
  recordUndeliverable,
  type IListRelayerCandidatesResult,
} from "@solana-midnight-bridge/database";
import { DeliveryRouter } from "@solana-midnight-bridge/delivery";
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
  /**
   * 00058: delivery into contracts. Absent (or with no adapter), every lock to a contract is
   * undeliverable(no-adapter) and nothing is signed for it.
   */
  delivery?: DeliveryRouter;
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
    recipientKind: (r.recipient_kind ?? null) as RelayerCandidate["recipientKind"],
    firstSeenAt: r.observed_at ? new Date(r.observed_at).getTime() : null,
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
    this.router = deps.delivery ?? new DeliveryRouter([], {
      signMint: () => {
        throw new Error("no delivery adapter: nothing may be signed for a contract recipient");
      },
    });
  }

  inFlightKeys(): string[] {
    return [...this.inFlight.keys()];
  }

  /** Waits for every attempt started so far (tests, shutdown). */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()]);
  }

  private readonly router: DeliveryRouter;

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
    if (job.direction === "s2m" && job.recipientKind === "contract") return this.attemptContract(job);
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

  /** 00058 D-2: a lock to a CONTRACT recipient, through the delivery router. */
  private async attemptContract(job: RelayerCandidate): Promise<void> {
    const key = jobKey(job.direction, job.sourceId);
    const ids = { direction: job.direction, source_id: job.sourceId.toString() };
    const now = new Date(this.now());
    let decision: Awaited<ReturnType<DeliveryRouter["recognise"]>>;
    try {
      decision = await this.router.recognise(job.recipient, { firstSeenAt: job.firstSeenAt ?? undefined });
    } catch (e) {
      decision = { kind: "retry", message: errText(e), missing: false };
    }
    if (decision.kind === "undeliverable") {
      await this.withDb(() =>
        recordUndeliverable.run({ ...ids, code: decision.code, reason: decision.message, now }, this.deps.db as any)
      );
      this.log(`${key}: undeliverable (${decision.code}): ${decision.message}; nothing signed`);
      return;
    }
    if (decision.kind === "retry") {
      await this.withDb(() =>
        recordRelayerCheck.run({ ...ids, now, last_error: `recognition: ${decision.message}` }, this.deps.db as any)
      );
      this.log(`${key}: cannot recognise ${job.recipient} yet (${decision.message}); retrying later`);
      return;
    }
    const adapter = decision.adapter;
    await this.withDb(() => recordRelayerAttempt.run({ ...ids, now }, this.deps.db as any));
    const writeDelivery = (coin: { nonce: string; colour: string; value: string } | null, tx: string | null) =>
      this.withDb(() =>
        recordDelivery.run(
          { ...ids, delivery: JSON.stringify({ adapter: adapter.id, account: job.recipient, coin, tx }) as never },
          this.deps.db as any,
        )
      );
    try {
      if (await this.deps.mintExists?.(job.sourceId)) {
        this.log(`${key}: lock already in mintedLocks on chain; not delivering, waiting for sync`);
        await this.record(job, { error: "already settled on chain: lock already in mintedLocks; waiting for sync" });
        return;
      }
      this.log(`${key}: delivering ${job.amount} into ${job.recipient} through ${adapter.id} (attempt ${job.attempts + 1})`);
      const r = await this.router.deliver(adapter, job.recipient, { lockNonce: job.sourceId, amount: job.amount }, {
        onComposed: (coin) => writeDelivery(coin, null),
      });
      this.log(`${key}: delivered in ${r.tx}`);
      await writeDelivery(r.coin, r.tx);
      await this.record(job, { tx: r.tx, error: null });
    } catch (e) {
      const msg = errText(e);
      if (isReplayRefusal(msg)) {
        this.log(`${key}: refused as already settled (${msg}); waiting for sync`);
        await this.record(job, { error: `already settled on chain: ${msg}` });
      } else {
        this.log(`${key}: delivery failed: ${msg}`);
        await this.record(job, { error: msg });
      }
    }
  }
}

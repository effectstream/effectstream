import type {
  BatchInputDeferral,
  BatchInputRejection,
  BatchOutcome,
  BatchSubmitResult,
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import type { DefaultBatcherInput } from "./types.ts";
import type {
  RequestState,
  RequestStatusRecord,
  RequestTransition,
  RequestTransitionDetail,
  TransitionOutcome,
} from "./storage.ts";
import { computeRequestId } from "./request-id.ts";
import { InputTerminalError, InputValidationError } from "./errors.ts";
import * as fs from "node:fs";

/**
 * The input's bounded retry budget ran out and its row was deleted.
 *
 * Stable because it is the one terminal state a caller cannot see coming: the
 * transaction never reached the chain, so there is no hash to look up and
 * nothing to inspect. Clients branch on this rather than on the message, whose
 * text carries the adapter's last diagnostic.
 */
export const RETRIES_EXHAUSTED = "RETRIES_EXHAUSTED";

/** The transaction was mined and the chain reported it failed (`status: 0`). */
export const ONCHAIN_FAILED = "ONCHAIN_FAILED";

/** Shortest rest a target gets for an infrastructure failure. */
const INFRA_COOLDOWN_FLOOR_MS = 1000;

/** Longest rest the escalation reaches; a chain that is back should be noticed. */
const INFRA_COOLDOWN_CEILING_MS = 60_000;

/**
 * How many times in a row ONE input may be parked uncharged before the batcher
 * stops believing the diagnosis and charges it anyway (spec FR-4).
 *
 * The bound exists because parking is a judgement, and a judgement can be
 * wrong. Without it, an adapter that answers "infrastructure" for an input that
 * is in fact deterministically doomed would keep that input queued, uncharged
 * and unanswerable for the rest of the process's life — trading the silent-drop
 * failure this project fixes for a silent-hang one, which is not a trade.
 *
 * 50 is chosen against the escalation, not out of the air: parks rest the
 * target for 1s, 2s, 4s … capped at 60s, so spending a whole park budget takes
 * upwards of **45 minutes of continuous outage**. That is far longer than any
 * outage a per-input retry budget was ever meant to absorb, and still finite.
 */
export const MAX_CONSECUTIVE_INFRA_PARKS = 50;

/**
 * Ceiling on the park ledger, so a batcher that has seen a great many distinct
 * inputs cannot accumulate one counter per input forever. Entries are evicted
 * oldest-first; an evicted input simply starts its count again, which is the
 * safe direction — it gets MORE patience, never less.
 */
const INFRA_PARK_LEDGER_LIMIT = 10_000;

/** The rest a target earns after `parks` consecutive infrastructure failures. */
export function infraCooldownMs(parks: number, retryDelayMs: number): number {
  const floor = Math.max(retryDelayMs, INFRA_COOLDOWN_FLOOR_MS);
  const escalated = floor * 2 ** Math.max(0, parks - 1);
  return Math.min(escalated, INFRA_COOLDOWN_CEILING_MS);
}

// Custom logger for debugging
// File logging is opt-in: appendFileSync blocks the event loop on every line,
// which is a throughput tax when several adapters share one process.
const FILE_LOGGING_ENABLED = process.env.BATCHER_DEBUG_LOG === "1";

function debugLog(message: string) {
  if (FILE_LOGGING_ENABLED) {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync("batcher-debug.log", `[${timestamp}] ${message}\n`);
    } catch {
      // Ignore if we can't write
    }
  }
  console.log(message);
}

/**
 * Read an adapter's `submitBatch` result as an outcome.
 *
 * A bare hash is the original all-or-nothing contract and normalises to an
 * outcome with no verdicts, which the processor then handles by exactly the
 * pre-existing code path.
 */
export function normalizeBatchOutcome<T extends DefaultBatcherInput>(
  result: BatchSubmitResult<DefaultBatcherInput>,
): BatchOutcome<T> {
  if (typeof result === "string") return { hash: result };
  return result as BatchOutcome<T>;
}

/**
 * Handles the complex batch processing logic for a specific target.
 * Separated from the main Batcher class to improve maintainability.
 */
export class BatchProcessor<T extends DefaultBatcherInput> {
  constructor(
    private batcher: {
      emitStateTransition: (prefix: string, payload: any) => Promise<void>;
      storage: {
        removeProcessedInputs: (inputs: T[], target: string) => Promise<void>;
        /** Returns the rows it DROPPED at the retry limit — see `chargeRetries`. */
        incrementRetryCount: (
          inputs: T[],
          target: string,
          maxRetries: number,
        ) => Promise<T[]>;
        /**
         * Optional: present only on a tracking backend. Everything the
         * processor writes through it is feature-detected, so a queue-only
         * `FileStorage` behaves exactly as it did before request tracking.
         */
        recordTransition?: (
          requestId: string,
          state: RequestState,
          detail?: RequestTransitionDetail,
        ) => Promise<TransitionOutcome>;
        recordTransitions?: (
          transitions: readonly RequestTransition[],
        ) => Promise<TransitionOutcome[]>;
        /**
         * Optional: the record for one request. Feature-detected like the rest
         * of tracking — the reconciliation below uses it to hand the adapter
         * the hash an earlier submission recorded, and does without when the
         * backend has no statuses to read.
         */
        getStatus?: (
          requestId: string,
        ) => Promise<RequestStatusRecord | undefined>;
      };
      submissionCallbacks: Map<
        string,
        {
          resolve: (result: any) => void;
          reject: (error: Error) => void;
          timeoutId: ReturnType<typeof setTimeout>;
        }
      >;
      waitForEffectStreamProcessed: (
        target: string,
        receipt: BlockchainTransactionReceipt,
        timeout: number,
      ) => Promise<{ latestBlock: number; rollup: number } | null>;
      getCallbackKey: (input: T) => string;
      getRetryPolicy: (target?: string) => { maxRetries: number; retryDelayMs: number };
      setTargetCooldown: (target: string, ms: number) => void;
    },
  ) {}

  /**
   * How many rounds in a row each input has been parked uncharged for an
   * infrastructure failure (spec FR-4). Keyed by target and request id, and
   * reset the moment the input is carried, judged or charged — a batcher that
   * has been up for a month must treat its first blip of the month as the first
   * blip, not as the continuation of one.
   */
  private readonly infraParks = new Map<string, number>();

  private parkLedgerKey(input: T, target: string): string {
    return `${target}\u0000${computeRequestId(input, target)}`;
  }

  /** Count one more consecutive park for this input and return the new total. */
  private recordInfraPark(input: T, target: string): number {
    const key = this.parkLedgerKey(input, target);
    const parks = (this.infraParks.get(key) ?? 0) + 1;
    // Re-inserting moves the entry to the back of the insertion order, which is
    // what makes the eviction below oldest-first.
    this.infraParks.delete(key);
    this.infraParks.set(key, parks);
    while (this.infraParks.size > INFRA_PARK_LEDGER_LIMIT) {
      const oldest = this.infraParks.keys().next();
      if (oldest.done) break;
      this.infraParks.delete(oldest.value);
    }
    return parks;
  }

  /** This input's streak is over: it was carried, judged or charged. */
  private clearInfraParks(inputs: readonly T[], target: string): void {
    for (const input of inputs) {
      this.infraParks.delete(this.parkLedgerKey(input, target));
    }
  }

  /**
   * Classify a batch-wide failure. INFRASTRUCTURE failures (no spendable
   * dust, unreachable node/indexer/prover, timeouts) are conditions of the
   * batcher's environment, not of the inputs — retrying the same inputs
   * later will succeed, so their retry budgets must NOT be charged.
   * Everything else is treated as an input failure.
   */
  static isInfraFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /could not balance dust|Insufficient Funds|Unable to connect|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket|network|timed? ?out|Service Unavailable|Bad Gateway|502|503|pool timed out/i
      .test(message);
  }

  // ─────────────────────────── request tracking ────────────────────────────
  //
  // Everything below is OBSERVATION. The processor's judgements — what to
  // remove, what to charge, whom to reject — are made exactly as they were
  // before; these methods only write down what was decided. So each one
  // swallows its own failures: a status store that cannot be written must not
  // become a reason a transaction does not reach the chain.

  /**
   * Move one request forward in the status store, if there is one.
   *
   * A REFUSED transition is normal operation, not a fault: a batch that
   * confirmed on chain and died before its rows were removed is re-picked on
   * restart, and every transition it then writes is correctly refused by the
   * append-only guard. That is the guard working, so it is logged and ignored.
   */
  private async transition(
    input: T,
    target: string,
    state: RequestState,
    detail?: RequestTransitionDetail,
  ): Promise<void> {
    // Call THROUGH the storage object, never through a detached reference:
    // `DatabaseStorage.recordTransition` reaches for `this.db`, so a bare
    // `const record = storage.recordTransition; record(...)` throws on every
    // single transition — and does it invisibly, because this method swallows
    // its own failures by design. Every stub in the unit tests is an arrow
    // function that ignores `this`, so nothing below the integration level can
    // see the difference (test/processor-real-storage.test.ts exists for this).
    const storage = this.batcher.storage;
    if (typeof storage.recordTransition !== "function") return; // queue-only backend
    const requestId = computeRequestId(input, target);
    try {
      const outcome = await storage.recordTransition(requestId, state, detail);
      if (outcome.applied === false) {
        debugLog(
          `[BatchProcessor] Status transition → ${state} refused for request ` +
            `${requestId.substring(0, 12)}… (${outcome.refused}); the record ` +
            `already knows better.`,
        );
      }
    } catch (error) {
      console.warn(
        `[BatchProcessor] Could not record ${state} for request ` +
          `${requestId.substring(0, 12)}…: ${error}`,
      );
    }
  }

  /** Record the same transition for a whole set of inputs. */
  private async transitionAll(
    inputs: T[],
    target: string,
    state: RequestState,
    detail?: (input: T) => RequestTransitionDetail | undefined,
  ): Promise<void> {
    const storage = this.batcher.storage;
    if (inputs.length === 0 || typeof storage.recordTransition !== "function") {
      return;
    }
    const transitions = inputs.map((input): RequestTransition => ({
      requestId: computeRequestId(input, target),
      state,
      detail: detail?.(input),
    }));
    if (typeof storage.recordTransitions === "function") {
      try {
        const outcomes = await storage.recordTransitions(transitions);
        if (outcomes.length !== transitions.length) {
          throw new Error(
            `bulk backend returned ${outcomes.length} outcomes for ` +
              `${transitions.length} transitions`,
          );
        }
        outcomes.forEach((outcome, index) => {
          if (outcome.applied === false) {
            debugLog(
              `[BatchProcessor] Status transition → ${state} refused for request ` +
                `${transitions[index].requestId.substring(0, 12)}… ` +
                `(${outcome.refused}); the record already knows better.`,
            );
          }
        });
        return;
      } catch (error) {
        console.warn(
          `[BatchProcessor] Bulk status transition → ${state} failed for ` +
            `${transitions.length} request(s); retrying individual status writes: ${error}`,
        );
      }
    }
    for (let index = 0; index < inputs.length; index++) {
      await this.transition(
        inputs[index],
        target,
        state,
        transitions[index].detail,
      );
    }
  }

  /** Announce an ending. Observability only; nothing may depend on delivery. */
  private async emitTerminal(
    input: T,
    target: string,
    state: "confirmed" | "failed",
    extra: { transactionHash?: string; errorCode?: string } = {},
  ): Promise<void> {
    try {
      await this.batcher.emitStateTransition("request:terminal", {
        requestId: computeRequestId(input, target),
        target,
        state,
        ...extra,
        time: Date.now(),
      });
    } catch {
      // An event listener's failure is never the request's problem.
    }
  }

  /**
   * Charge a retry to each input, and answer for whatever storage dropped.
   *
   * The silent-drop fix (spec FR-004) lives here rather than in storage: the
   * storage layer must never touch callbacks — it has no business knowing that
   * an HTTP request is open — but it is the only place that knows a row hit its
   * limit. So it reports, and this decides what that means: a terminal
   * `failed/RETRIES_EXHAUSTED` record for pollers, and a prompt rejection for
   * whoever is still holding the connection.
   *
   * `reasons` maps a request id to the adapter's last diagnostic. Keyed by id
   * and not by object identity on purpose: the dropped rows come back out of
   * storage as fresh objects, so nothing the adapter returned is reference-
   * equal to them any more.
   */
  private async chargeRetries(
    inputs: T[],
    target: string,
    maxRetries: number,
    reasons?: Map<string, string>,
  ): Promise<void> {
    let reported: T[] | undefined;
    try {
      reported = await this.batcher.storage.incrementRetryCount(
        inputs,
        target,
        maxRetries,
      );
    } catch (error) {
      debugLog(`[BatchProcessor] Failed to increment retry counts: ${error}`);
      return;
    }
    if (!Array.isArray(reported)) {
      // A third-party backend still on the old `Promise<void>` contract. It
      // behaves exactly as it always did — charge and drop — but cannot tell us
      // what it dropped, so its callers keep hanging. Said out loud rather than
      // crashing the batch loop on it.
      console.warn(
        `[BatchProcessor] Storage backend for target ${target} does not report ` +
          `dropped inputs from incrementRetryCount(); callers waiting on a ` +
          `retry-exhausted input will not be notified. Update the backend to ` +
          `return the rows it dropped.`,
      );
      return;
    }
    const dropped = reported;
    if (dropped.length === 0) return;

    console.warn(
      `🚫 [BatchProcessor] ${dropped.length} input(s) for target ${target} ` +
        `exhausted their retry budget and were dropped; rejecting any waiting ` +
        `caller and recording the terminal state.`,
    );

    const terminalDetails = new Map<string, RequestTransitionDetail>();
    for (const input of dropped) {
      const retryCount = input.retryCount ?? maxRetries;
      const diagnostic = reasons?.get(computeRequestId(input, target));
      const message = `Input dropped after ${retryCount} failed submission ` +
        `attempt(s) for target ${target}` +
        (diagnostic ? `: ${diagnostic}` : ".");
      terminalDetails.set(computeRequestId(input, target), {
        errorCode: RETRIES_EXHAUSTED,
        message,
        retryCount,
      });
    }
    await this.transitionAll(
      dropped,
      target,
      "failed",
      (input) => terminalDetails.get(computeRequestId(input, target)),
    );

    for (const input of dropped) {
      const detail = terminalDetails.get(computeRequestId(input, target))!;
      const message = detail.message!;

      // The callback key excludes `retryCount`, so the row storage handed back
      // still finds the caller that submitted it.
      const callbackKey = this.batcher.getCallbackKey(input);
      const callbacks = this.batcher.submissionCallbacks.get(callbackKey);
      if (callbacks) {
        callbacks.reject(
          new InputValidationError(
            message,
            500,
            RETRIES_EXHAUSTED,
            // Not retryable: the row is gone, and a resubmission of the same
            // signed request is recognised as a duplicate by the replay gate.
            false,
          ),
        );
        clearTimeout(callbacks.timeoutId);
        this.batcher.submissionCallbacks.delete(callbackKey);
      }

      await this.emitTerminal(input, target, "failed", {
        errorCode: RETRIES_EXHAUSTED,
      });
    }
  }

  /**
   * Split this round's deferrals into the ones still within their park budget
   * and the ones that have spent it (spec FR-4).
   *
   * Only `infra` deferrals are counted. A plain deferral — a validation queue
   * of ours that was full — is not a claim about the environment, so it does
   * not rest the target and it does not consume a budget; that channel behaves
   * exactly as it did before this existed.
   */
  private splitParkBudget(
    deferrals: BatchInputDeferral<T>[],
    target: string,
  ): { parked: Array<{ deferral: BatchInputDeferral<T>; parks: number }>;
    exhausted: BatchInputDeferral<T>[] } {
    const parked: Array<{ deferral: BatchInputDeferral<T>; parks: number }> = [];
    const exhausted: BatchInputDeferral<T>[] = [];
    for (const deferral of deferrals) {
      if (deferral.infra !== true) continue;
      const parks = this.recordInfraPark(deferral.input, target);
      if (parks > MAX_CONSECUTIVE_INFRA_PARKS) exhausted.push(deferral);
      else parked.push({ deferral, parks });
    }
    return { parked, exhausted };
  }

  /**
   * How long to rest this target, or `undefined` for "do not rest it".
   *
   * An explicit `cooldownMs` from the adapter wins: it knows how long its own
   * chain takes to come back. Otherwise the rest escalates with the longest
   * park streak in the batch, so a five-second blip costs a second and a
   * two-hour outage does not cost two hours of rebuilt batches.
   */
  private infraCooldownRequest(
    outcome: BatchOutcome<T>,
    parked: Array<{ deferral: BatchInputDeferral<T>; parks: number }>,
    retryDelayMs: number,
    invariantCooldownMs: number | undefined,
  ): number | undefined {
    let requested: number | undefined;
    if (typeof outcome.cooldownMs === "number" && outcome.cooldownMs > 0) {
      requested = outcome.cooldownMs;
    } else if (parked.length > 0) {
      const longestStreak = Math.max(...parked.map((entry) => entry.parks));
      requested = infraCooldownMs(longestStreak, retryDelayMs);
    }
    if (requested === undefined) return undefined;
    // Never shorten a rest something more serious already asked for.
    if (invariantCooldownMs !== undefined && invariantCooldownMs >= requested) {
      return undefined;
    }
    return requested;
  }

  /**
   * Ask the chain before charging: which of these inputs are already ON it?
   *
   * The defect this closes (spec FR-3, 00017's Q-2, measured verbatim as
   * 00020's M13): a batcher restarted while a batch is in flight loses the
   * receipts but keeps the rows. The transactions land, the surviving rows are
   * re-picked, the resubmission is refused because the spends are used, three
   * retries are charged, the rows are dropped — and the store publishes
   * `failed / RETRIES_EXHAUSTED` for requests the chain CONFIRMED. A poller is
   * then told the exact opposite of what happened, which is worse than being
   * told nothing.
   *
   * Returns the inputs that are NOT on chain and must still be charged. The
   * ones that are get the ordinary confirmation treatment — the same verdict,
   * the same removal, the same resolution, in the same order — because that is
   * what genuinely happened to them, just later than the batcher noticed.
   *
   * Everything here is best-effort by construction: no hook, a hook that
   * throws, a status store that will not answer, a removal that fails — each
   * degrades to "charge it, exactly as before". An outage in the check must
   * never be a reason a batch loop stops.
   */
  private async reconcileLandedInputs(
    adapter: BlockchainAdapter<any>,
    target: string,
    inputs: T[],
  ): Promise<T[]> {
    if (inputs.length === 0) return inputs;
    if (typeof adapter.findLandedTransaction !== "function") return inputs;

    const unresolved: T[] = [];
    for (const input of inputs) {
      let landed;
      try {
        landed = await adapter.findLandedTransaction(input, {
          target,
          transactionHash: await this.recordedTransactionHash(input, target),
        });
      } catch (error) {
        debugLog(
          `[BatchProcessor] Landed-transaction check failed for target ` +
            `${target}; charging as usual: ${error}`,
        );
        landed = undefined;
      }
      if (!landed) {
        unresolved.push(input);
        continue;
      }

      const receipt: BlockchainTransactionReceipt = {
        hash: landed.hash,
        blockNumber: landed.blockNumber ?? 0n,
        status: landed.status ?? 1,
      };
      console.warn(
        `🔎 [BatchProcessor] Request ` +
          `${computeRequestId(input, target).substring(0, 12)}… for target ` +
          `${target} failed to submit, but its earlier transaction IS on ` +
          `chain (${landed.hash}${
            landed.blockNumber === undefined
              ? ""
              : ` at block ${landed.blockNumber}`
          }). Recording the chain's verdict instead of charging a retry.`,
      );

      // Verdict BEFORE removal (00011 F-P3.14). Under kill -9 this ordering is
      // the safe one: a terminal record with a surviving row is repaired by the
      // append-only guard when the row is re-picked, whereas removing first can
      // leave an in-flight record with no row behind it.
      await this.recordChainOutcome([input], target, receipt);
      try {
        await this.batcher.storage.removeProcessedInputs([input], target);
      } catch (error) {
        // The row survives and will be re-picked — and reconciled again, which
        // is self-healing. What must not happen is that it gets charged, and
        // it will not: it is out of the charge set for good.
        console.error(
          `🛑 [BatchProcessor] Could not remove the row for a request that IS ` +
            `on chain (target ${target}, ${landed.hash}); its record is ` +
            `already terminal, so the re-picked row will be reconciled ` +
            `again: ${error}`,
        );
      }
      this.resolveInputCallbacks([input], target, receipt);
      this.clearInfraParks([input], target);
    }
    return unresolved;
  }

  /** The hash this request's last `submitted` transition wrote down, if any. */
  private async recordedTransactionHash(
    input: T,
    target: string,
  ): Promise<string | undefined> {
    const storage = this.batcher.storage;
    if (typeof storage.getStatus !== "function") return undefined;
    try {
      const record = await storage.getStatus(computeRequestId(input, target));
      return record?.transactionHash;
    } catch (error) {
      debugLog(
        `[BatchProcessor] Could not read the status record before the ` +
          `landed-transaction check for target ${target}: ${error}`,
      );
      return undefined;
    }
  }

  /**
   * Reconcile, then charge whatever the chain has never heard of.
   *
   * Every charge path in this class goes through here, so there is exactly one
   * answer to "did we check before we charged?" rather than three.
   */
  private async reconcileThenCharge(
    adapter: BlockchainAdapter<any>,
    inputs: T[],
    target: string,
    maxRetries: number,
    reasons?: Map<string, string>,
  ): Promise<void> {
    const unresolved = await this.reconcileLandedInputs(
      adapter,
      target,
      inputs,
    );
    if (unresolved.length === 0) return;
    await this.chargeRetries(unresolved, target, maxRetries, reasons);
  }

  async processBatchForTarget(
    adapter: BlockchainAdapter<any>,
    target: string,
    inputs: T[],
    timeout: number = 60000,
  ): Promise<void> {
    console.log(`🔗 Processing ${inputs.length} inputs for target: ${target}`);

    // Build batch data directly from adapter
    const batchResult = adapter.buildBatchData(inputs as DefaultBatcherInput[]);

    if (!batchResult || !batchResult.data) {
      console.log(`📭 No valid inputs for target ${target}, skipping...`);
      return;
    }

    const { selectedInputs, data } = batchResult; // data is 'unknown'

    // Selected, not judged. `batching` is the one thing that is true of every
    // input here whatever happens next, and it is what makes a poll during a
    // long proof say something more useful than `queued`.
    await this.transitionAll(selectedInputs as T[], target, "batching");

    await this.submitAndConfirmTransaction(
      adapter,
      target,
      data,
      selectedInputs as T[],
      timeout,
    );
  }

  private async submitAndConfirmTransaction(
    adapter: BlockchainAdapter<any>,
    target: string,
    data: unknown, // CHANGED from hexData: string
    selectedInputs: T[],
    timeout: number,
  ): Promise<void> {
    debugLog(
      `[BatchProcessor] Starting submitAndConfirmTransaction for target ${target} with ${selectedInputs.length} inputs`,
    );

    try {
      const estimatedFee = await adapter.estimateBatchFee(data);

      this.batcher.emitStateTransition("batch:fee-estimate", {
        target,
        estimatedFee,
        time: Date.now(),
      });

      debugLog(
        `[BatchProcessor] Calling adapter.submitBatch for target ${target}`,
      );
      // Snapshot before submitBatch: the adapter may splice elements from the
      // same array (batchData.selectedInputs === selectedInputs) before throwing,
      // so we need the original list to know which inputs actually failed.
      const inputsSnapshot = [...selectedInputs];

      const { maxRetries, retryDelayMs } = this.batcher.getRetryPolicy(target);

      let submitResult: BatchSubmitResult<DefaultBatcherInput>;
      try {
        submitResult = await adapter.submitBatch(data, estimatedFee);
      } catch (error) {
        if (BatchProcessor.isInfraFailure(error)) {
          // PARK, don't drop: the environment failed, not the inputs. Leave
          // retry counts untouched and pause the target so the poll loop
          // doesn't burn worker slots on a known-bad environment.
          const cooldownMs = Math.max(retryDelayMs, 1000);
          console.warn(
            `[BatchProcessor] Infra failure for target ${target} — parking ` +
              `${inputsSnapshot.length} input(s) untouched, cooldown ${cooldownMs}ms: ${
                error instanceof Error ? error.message : error
              }`,
          );
          this.batcher.setTargetCooldown(target, cooldownMs);
          throw error;
        }
        // Input failure — increment retry counts; storage drops those that hit
        // the configured limit and says which, so their callers are told.
        debugLog(
          `[BatchProcessor] submitBatch threw for target ${target}, incrementing retry counts for ${inputsSnapshot.length} inputs (maxRetries=${maxRetries})`,
        );
        const thrownMessage = error instanceof Error
          ? error.message
          : String(error);
        this.clearInfraParks(inputsSnapshot, target);
        await this.reconcileThenCharge(
          adapter,
          inputsSnapshot,
          target,
          maxRetries,
          new Map(
            inputsSnapshot.map((
              input,
            ) => [computeRequestId(input, target), thrownMessage]),
          ),
        );
        throw error;
      }
      const outcome = normalizeBatchOutcome<T>(submitResult);
      // A bare hash is the original contract: every selected input shares the
      // transaction's fate, and the legacy mutation-diff below still governs.
      const adapterJudgedInputs = typeof submitResult !== "string";
      debugLog(
        `[BatchProcessor] adapter.submitBatch returned ${
          adapterJudgedInputs ? "an outcome" : "hash"
        }: ${outcome.hash ?? "(no transaction)"}`,
      );

      // Phase C can scope an invariant to the worker that produced it. In that
      // case other workers' verdicts remain independent and must still be
      // honored; only the affected input stays queued and uncharged. Legacy
      // unscoped invariants retain the conservative suppress-everything guard.
      const invariant = outcome.invariantFailure;
      const invariantInputs = invariant?.inputs ?? [];
      const invariantInputSet = new Set<T>(invariantInputs);
      let invariantError: Error | undefined;
      // Remembered so the infra cooldown below can never SHORTEN it: the
      // batcher's cooldown is an absolute deadline, so a 1s infra rest applied
      // after an infinite hard pause would silently cancel the hard pause.
      let invariantCooldownMs: number | undefined;
      if (invariant) {
        const cooldownMs = invariant.hardPause
          ? Number.POSITIVE_INFINITY
          : Math.max(retryDelayMs, INFRA_COOLDOWN_FLOOR_MS);
        invariantCooldownMs = cooldownMs;
        this.batcher.setTargetCooldown(target, cooldownMs);
        invariantError = new Error(
          `Batch invariant failure for target ${target}: ` +
            invariant.message,
        );
        const parkedCount = invariantInputs.length > 0
          ? invariantInputs.length
          : inputsSnapshot.length;
        console.error(
          `🛑 [BatchProcessor] ${invariantError.message} — parking ` +
            `${parkedCount} input(s) untouched, ` +
            (invariant.hardPause
              ? "hard-paused until manual recovery"
              : `cooldown ${cooldownMs}ms`),
        );
        this.batcher.emitStateTransition("error", {
          phase: "batch",
          target,
          error: invariantError,
          time: Date.now(),
        });
        if (invariantInputs.length === 0) throw invariantError;
      }

      const permanentRejected = (outcome.permanentRejected ?? []).filter(
        (rejection) => !invariantInputSet.has(rejection.input),
      );
      const retryable = (outcome.retryable ?? []).filter(
        (deferral) => !invariantInputSet.has(deferral.input),
      );
      const failed = (outcome.failed ?? []).filter(
        (failure) => !invariantInputSet.has(failure.input),
      );

      if (permanentRejected.length > 0) {
        this.clearInfraParks(
          permanentRejected.map((rejection) => rejection.input),
          target,
        );
        await this.rejectInputsPermanently(permanentRejected, target);
      }

      // An infra deferral is the outage the retry budget was never meant to
      // absorb. It is left uncharged like any deferral, but unlike any other
      // deferral it also RESTS the target: the same doomed balance/prove
      // pipeline re-run every poll round is how a node outage used to cost a
      // batcher its whole worker pool.
      const { parked, exhausted } = this.splitParkBudget(retryable, target);
      if (exhausted.length > 0) {
        console.warn(
          `[BatchProcessor] ${exhausted.length} input(s) for target ${target} ` +
            `have now been parked ${MAX_CONSECUTIVE_INFRA_PARKS} times in a ` +
            `row without ever being carried; charging them a retry rather ` +
            `than parking uncharged forever: ${
              exhausted.map((d) => d.reason).join("; ")
            }`,
        );
      }
      if (retryable.length > 0) {
        // Left in storage with retry counts untouched: these inputs were never
        // judged, so charging them for our own trouble would eventually drop a
        // perfectly valid transaction.
        console.warn(
          `[BatchProcessor] Deferring ${retryable.length} input(s) for ` +
            `target ${target} without charging a retry: ${
              retryable.map((d) => d.reason).join("; ")
            }`,
        );
      }

      const cooldownRequest = this.infraCooldownRequest(
        outcome,
        parked,
        retryDelayMs,
        invariantCooldownMs,
      );
      if (cooldownRequest !== undefined) {
        console.warn(
          `[BatchProcessor] Infra failure reported for target ${target} — ` +
            `parking ${parked.length} input(s) untouched, cooldown ` +
            `${cooldownRequest}ms`,
        );
        this.batcher.setTargetCooldown(target, cooldownRequest);
      }

      // A judged failure ends the streak — the adapter reached a verdict, so
      // whatever the previous rounds suspected about the environment, this
      // round was not about the environment. A budget-exhausted park does NOT
      // end it: its counter is the only thing keeping the input from parking
      // for another full budget, and resetting it here would triple the bound
      // FR-4 exists to impose.
      this.clearInfraParks(failed.map((failure) => failure.input), target);
      const chargeable = [
        ...failed,
        ...exhausted.map((deferral) => ({
          input: deferral.input,
          error: deferral.reason,
        })),
      ];
      if (chargeable.length > 0) {
        debugLog(
          `[BatchProcessor] Charging one retry to ${chargeable.length} ` +
            `adapter-judged failed input(s) for target ${target} ` +
            `(maxRetries=${maxRetries}): ${
              chargeable.map((failure) => failure.error).join("; ")
            }`,
        );
        await this.reconcileThenCharge(
          adapter,
          chargeable.map((failure) => failure.input),
          target,
          maxRetries,
          new Map(
            chargeable.map((
              failure,
            ) => [computeRequestId(failure.input, target), failure.error]),
          ),
        );
      }

      const hash = outcome.hash;
      if (hash === undefined) {
        // Every input was rejected, deferred or retry-charged. There is no
        // transaction, so there is nothing to confirm.
        debugLog(
          `[BatchProcessor] No transaction submitted for target ${target}; ` +
            `nothing to confirm`,
        );
        if (invariantError) throw invariantError;
        return;
      }

      this.batcher.emitStateTransition("batch:submit", {
        target,
        estimatedFee,
        txHash: hash,
        time: Date.now(),
      });

      let finalSelectedInputs: T[];
      if (adapterJudgedInputs) {
        // The adapter said exactly what it carried. Anything it did not
        // mention, and did not reject or defer, rode along with the hash.
        const accountedFor = new Set<T>([
          ...permanentRejected.map((r) => r.input),
          ...retryable.map((d) => d.input),
          ...failed.map((failure) => failure.input),
          ...invariantInputs,
        ]);
        finalSelectedInputs = outcome.submitted
          ? outcome.submitted.filter((input) => !invariantInputSet.has(input))
          : inputsSnapshot.filter((input) => !accountedFor.has(input));
      } else {
        // Check if the adapter mutated selectedInputs in the data object
        // This is a pattern used by some adapters (like midnight-balancing) to handle partial failures
        finalSelectedInputs = selectedInputs;
        if (
          data && typeof data === "object" && "selectedInputs" in data &&
          Array.isArray((data as any).selectedInputs)
        ) {
          finalSelectedInputs = (data as any).selectedInputs as T[];
          debugLog(
            `[BatchProcessor] Adapter mutated selectedInputs. New length: ${finalSelectedInputs.length}`,
          );
          // Diff against the snapshot (not the mutated selectedInputs) to find failed inputs
          const finalSet = new Set(finalSelectedInputs);
          const failedInputs = inputsSnapshot.filter((i) => !finalSet.has(i));
          if (failedInputs.length > 0) {
            debugLog(
              `[BatchProcessor] Incrementing retry count for ${failedInputs.length} failed inputs (maxRetries=${maxRetries})`,
            );
            // The legacy protocol says nothing about WHY an input was spliced
            // out, so the exhaustion report carries no diagnostic here.
            this.clearInfraParks(failedInputs, target);
            await this.reconcileThenCharge(
              adapter,
              failedInputs,
              target,
              maxRetries,
            );
          }
        }
      }

      debugLog(
        `[BatchProcessor] Submitting ${finalSelectedInputs.length} inputs for target ${target} with hash ${hash}`,
      );

      // Carried at last: whatever the previous rounds thought of these inputs,
      // the environment worked this time.
      this.clearInfraParks(finalSelectedInputs, target);

      // Recorded before the receipt wait, which can take a minute: a poll in
      // that window should say "submitted, here is the hash" rather than
      // "batching", so the caller can watch the chain themselves.
      //
      // Each input gets its OWN hash, by the same rule the receipt already uses
      // (`splitReceiptHashes`). An adapter that submits one transaction per
      // input reports them comma-joined, and recording the joined string here
      // would hand every caller a hash that matches nothing on chain — and
      // would give `reconcileLandedInputs` a batch-level answer to a per-input
      // question, confirming everyone the moment anyone was found.
      const submitHashes = this.splitReceiptHashes(finalSelectedInputs, {
        hash,
        blockNumber: 0n,
        status: 1,
      });
      await this.transitionAll(
        finalSelectedInputs,
        target,
        "submitted",
        (input) => ({
          transactionHash: submitHashes.isMultiHash
            ? submitHashes.hashes[finalSelectedInputs.indexOf(input)]
            : hash,
        }),
      );

      // Wait for confirmation and EffectStream processing
      // Use the adapter's specific timeout if available, otherwise fallback to the default
      const adapterTimeout = (adapter as any).config?.receiptTimeoutMs ||
        timeout;

      debugLog(
        `[BatchProcessor] Calling handleTransactionConfirmation for hash ${hash} with timeout ${adapterTimeout}`,
      );
      await this.handleTransactionConfirmation(
        adapter,
        target,
        hash,
        finalSelectedInputs,
        adapterTimeout,
      );
      if (invariantError) throw invariantError;
    } finally {
      // Release all batch resources (workers + input reservations).
      // This runs AFTER all storage operations (removeProcessedInputs on
      // success, incrementRetryCount on failure), preventing the race where
      // a poll tick re-picks an input that is still in storage.
      if (typeof adapter.releaseBatchResources === "function") {
        try {
          adapter.releaseBatchResources(data);
        } catch (releaseError) {
          debugLog(
            `[BatchProcessor] releaseBatchResources failed: ${releaseError}`,
          );
        }
      }
    }
  }

  /**
   * Drop inputs that can never succeed and tell whoever is waiting.
   *
   * Removal is attempted first but never blocks the rejection: a caller
   * holding an open request must not be left hanging because storage
   * misbehaved. If a row survives removal, hard-pause the target in this
   * process: repeatedly re-picking a known-doomed row would create an unbounded,
   * uncounted loop, while charging the user's retry budget for our storage
   * failure would violate permanent-rejection semantics.
   */
  private async rejectInputsPermanently(
    rejections: BatchInputRejection<T>[],
    target: string,
  ): Promise<void> {
    console.warn(
      `🚫 [BatchProcessor] Permanently rejecting ${rejections.length} input(s) ` +
        `for target ${target}: ${
          rejections.map((r) => r.errorCode ?? r.error).join("; ")
        }`,
    );

    try {
      await this.batcher.storage.removeProcessedInputs(
        rejections.map((r) => r.input),
        target,
      );
    } catch (error) {
      this.batcher.setTargetCooldown(target, Number.POSITIVE_INFINITY);
      console.error(
        `🛑 [BatchProcessor] Failed to remove permanently rejected inputs for ` +
          `target ${target}; hard-pausing the target while still rejecting its ` +
          `waiting caller(s): ${error}`,
      );
    }

    const rejectionDetails = new Map<string, RequestTransitionDetail>(
      rejections.map((rejection) => [
        computeRequestId(rejection.input, target),
        { errorCode: rejection.errorCode, message: rejection.error },
      ]),
    );
    await this.transitionAll(
      rejections.map((rejection) => rejection.input),
      target,
      "failed",
      (input) => rejectionDetails.get(computeRequestId(input, target)),
    );

    for (const rejection of rejections) {
      // The adapter's own verdict, recorded verbatim: a poller and a waiting
      // caller must be told the same thing, and the errorCode is what a client
      // is supposed to branch on.
      await this.emitTerminal(rejection.input, target, "failed", {
        errorCode: rejection.errorCode,
      });

      const callbackKey = this.batcher.getCallbackKey(rejection.input);
      const callbacks = this.batcher.submissionCallbacks.get(callbackKey);
      if (!callbacks) continue;

      // Rejected with the input's own verdict — never resolved against some
      // other transaction's receipt.
      callbacks.reject(
        new InputValidationError(
          rejection.error,
          rejection.statusCode ?? 400,
          rejection.errorCode,
          false,
        ),
      );
      clearTimeout(callbacks.timeoutId);
      this.batcher.submissionCallbacks.delete(callbackKey);
    }
  }

  private async handleTransactionConfirmation(
    adapter: BlockchainAdapter<any>,
    target: string,
    hash: string,
    selectedInputs: T[],
    timeout: number,
  ): Promise<void> {
    debugLog(
      `[BatchProcessor] Waiting for transaction receipt for ${hash} (timeout: ${timeout}ms)...`,
    );
    const receipt = await adapter.waitForTransactionReceipt(hash, timeout);
    debugLog(
      `[BatchProcessor] Got transaction receipt for ${hash} at block ${receipt.blockNumber}`,
    );

    this.batcher.emitStateTransition("batch:receipt", {
      target,
      blockNumber: receipt.blockNumber,
      time: Date.now(),
    });

    // Record the verdict BEFORE the rows go. Under kill -9 this ordering is
    // the safe one: a `confirmed` record with a surviving row is repaired by
    // the append-only guard when the row is re-picked, whereas removing first
    // can leave a `submitted` record with no row behind it — an in-flight
    // request nothing will ever resolve.
    await this.recordChainOutcome(selectedInputs, target, receipt);

    // Remove processed inputs from storage after successful receipt
    debugLog(
      `[BatchProcessor] Removing ${selectedInputs.length} processed inputs from storage for target ${target}...`,
    );
    await this.batcher.storage.removeProcessedInputs(selectedInputs, target);
    debugLog(`[BatchProcessor] Successfully removed inputs from storage.`);

    // Resolve all callbacks with the receipt
    // Individual callers will decide if they want to continue waiting for EffectStream
    this.resolveInputCallbacks(selectedInputs, target, receipt);

    // Optional: Still trigger EffectStream processing check for event emission
    this.waitForEffectStreamProcessing(
      receipt,
      adapter,
      target,
      timeout,
    ).catch((error) => {
      console.error(
        `⚠️ Error waiting for EffectStream processing for target ${target}:`,
        error,
      );
    });
  }

  private async waitForEffectStreamProcessing(
    receipt: BlockchainTransactionReceipt,
    _adapter: BlockchainAdapter<any>,
    target: string,
    timeout: number,
  ): Promise<void> {
    try {
      const processingResult = await this.batcher.waitForEffectStreamProcessed(
        target,
        receipt,
        timeout,
      );

      if (processingResult) {
        this.batcher.emitStateTransition("batch:effectstream-processed", {
          target,
          latestBlock: processingResult.latestBlock,
          rollup: processingResult.rollup,
          time: Date.now(),
        });
      } else {
        console.error(
          `❌ EffectStream processing validation failed for target ${target}`,
        );
        this.batcher.emitStateTransition("error", {
          phase: "effectstream",
          target,
          error: new Error("EffectStream processing validation failed"),
          time: Date.now(),
        });
      }
    } catch (error) {
      console.error(
        `❌ Error waiting for EffectStream processing for target ${target}:`,
        error,
      );
      this.batcher.emitStateTransition("error", {
        phase: "effectstream",
        target,
        error,
        time: Date.now(),
      });
    }
  }

  /**
   * Write down what the chain said about each input.
   *
   * Per-input hashes come from the same multi-hash split `resolveInputCallbacks`
   * uses, so a poller and a waiting caller are told about the same transaction.
   *
   * A failed chain receipt is terminal for a shared transaction and is
   * recorded with the same hash/classification the waiting caller receives.
   * Genuinely per-input hashes remain the adapter's existing protocol: one
   * shared receipt cannot reveal an individual hash's status.
   */
  private async recordChainOutcome(
    selectedInputs: T[],
    target: string,
    receipt: BlockchainTransactionReceipt,
  ): Promise<void> {
    const { hashes, isMultiHash } = this.splitReceiptHashes(
      selectedInputs,
      receipt,
    );

    const details = new Map<string, RequestTransitionDetail>();
    selectedInputs.forEach((input, index) => {
      const inputHash = isMultiHash ? hashes[index] : receipt.hash;
      details.set(
        computeRequestId(input, target),
        receipt.status === 0
          ? {
            transactionHash: inputHash,
            errorCode: ONCHAIN_FAILED,
            message: `Transaction failed on-chain: ${inputHash}`,
          }
          : { transactionHash: inputHash, blockNumber: receipt.blockNumber },
      );
    });
    await this.transitionAll(
      selectedInputs,
      target,
      receipt.status === 0 ? "failed" : "confirmed",
      (input) => details.get(computeRequestId(input, target)),
    );

    for (let i = 0; i < selectedInputs.length; i++) {
      const input = selectedInputs[i];
      const inputHash = isMultiHash ? hashes[i] : receipt.hash;

      if (receipt.status === 0) {
        await this.emitTerminal(input, target, "failed", {
          transactionHash: inputHash,
          errorCode: ONCHAIN_FAILED,
        });
        continue;
      }

      await this.emitTerminal(input, target, "confirmed", {
        transactionHash: inputHash,
      });
    }
  }

  /**
   * One transaction for the whole batch, or one per input?
   *
   * Adapters that submit per input report a comma-joined hash whose parts line
   * up with a multi-input `selectedInputs` list. Any other count means the
   * batch shares one hash. A one-input batch is always shared/single-
   * transaction semantics, even for a pathological hash containing a comma.
   */
  private splitReceiptHashes(
    selectedInputs: T[],
    receipt: BlockchainTransactionReceipt,
  ): { hashes: string[]; isMultiHash: boolean } {
    const hashes = receipt.hash.split(",");
    return {
      hashes,
      isMultiHash: selectedInputs.length > 1 &&
        hashes.length === selectedInputs.length,
    };
  }

  private resolveInputCallbacks(
    selectedInputs: T[],
    target: string,
    receipt: BlockchainTransactionReceipt,
  ): void {
    const { hashes, isMultiHash } = this.splitReceiptHashes(
      selectedInputs,
      receipt,
    );

    for (let i = 0; i < selectedInputs.length; i++) {
      const input = selectedInputs[i];
      const callbackKey = this.batcher.getCallbackKey(input);
      const callbacks = this.batcher.submissionCallbacks.get(callbackKey);
      if (callbacks) {
        const inputHash = isMultiHash ? hashes[i] : receipt.hash;

        // Consume the waiter before invoking user-owned resolve/reject code so
        // re-entrancy cannot settle it twice. Both terminal branches cancel
        // the timeout and release the map entry identically.
        clearTimeout(callbacks.timeoutId);
        this.batcher.submissionCallbacks.delete(callbackKey);

        if (receipt.status === 0 && !isMultiHash) {
          callbacks.reject(
            new InputTerminalError(
              `Transaction failed on-chain: ${inputHash}`,
              computeRequestId(input, target),
              inputHash,
            ),
          );
        } else {
          const inputReceipt = isMultiHash
            ? { ...receipt, hash: inputHash }
            : receipt;
          callbacks.resolve(inputReceipt);
        }
      }
    }
  }
}

// What the processor RECORDS, and who it tells.
//
// The processor already knew every outcome in this file; it just never wrote
// any of them down, and in one case never told the caller either. Two promises
// are under test:
//
//  - FR-005: every terminal transition the processor knows about lands in the
//    status store, and only those. A `retryable` deferral and an infra park are
//    NOT verdicts — the input was never judged — so they must write nothing.
//    Recording a failure there would report something the chain never said.
//  - FR-004: retry exhaustion tells the waiting caller. This was the standing
//    silent-drop bug: storage deleted the row with a console.warn and the
//    `wait-receipt` caller hung until its own timeout, which defaults to five
//    minutes, for a request that no longer existed.
//
// The harness drives BatchProcessor directly — it takes its collaborators as a
// plain object, so no chain, no server, no storage engine.

import { describe, expect, test } from "bun:test";
import { BatchProcessor } from "./batch-processor.ts";
import { InputTerminalError, InputValidationError } from "./errors.ts";
import { computeRequestId } from "./request-id.ts";
import type {
  RequestState,
  RequestStatusRecord,
  RequestTransitionDetail,
  TransitionOutcome,
} from "./storage.ts";
import type { DefaultBatcherInput } from "./types.ts";
import type {
  BatchSubmitResult,
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";

const TARGET = "test-target";

function makeInput(address: string): DefaultBatcherInput {
  return {
    addressType: 1 as DefaultBatcherInput["addressType"],
    input: `input-from-${address}`,
    address,
    timestamp: "2026-08-18T00:00:00.000Z",
    target: TARGET,
  };
}

interface Recorded {
  requestId: string;
  state: RequestState;
  detail?: RequestTransitionDetail;
}

interface HarnessOptions {
  /** Which inputs storage drops when charged a retry. */
  dropOnRetry?: (inputs: DefaultBatcherInput[]) => DefaultBatcherInput[];
  /** Make every transition come back refused, as a re-picked batch would. */
  refuseTransitions?: boolean;
  /** Make the status write blow up. */
  transitionError?: Error;
  /** Drop `recordTransition` entirely — a queue-only backend. */
  untracked?: boolean;
}

interface Harness {
  processor: BatchProcessor<DefaultBatcherInput>;
  recorded: Recorded[];
  events: { prefix: string; payload: any }[];
  removed: DefaultBatcherInput[];
  /** Transitions already recorded at the moment removal was attempted. */
  recordedAtRemoval: Recorded[];
  settled: Map<string, { status: "resolved" | "rejected"; value: any }>;
  /**
   * Register a caller waiting on this input. Returns an ALREADY-handled
   * promise — `{ ok }` or `{ err }` — because the processor rejects it
   * synchronously and an unattached rejection would surface as an unhandled
   * one before the assertion gets a chance to look at it.
   */
  waitOn: (
    input: DefaultBatcherInput,
  ) => Promise<{ ok?: unknown; err?: unknown }>;
  statesOf: (input: DefaultBatcherInput) => RequestState[];
  detailOf: (
    input: DefaultBatcherInput,
    state: RequestState,
  ) => RequestTransitionDetail | undefined;
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const recorded: Recorded[] = [];
  const events: { prefix: string; payload: any }[] = [];
  const removed: DefaultBatcherInput[] = [];
  let recordedAtRemoval: Recorded[] = [];
  const callbacks = new Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>();
  const settled: Harness["settled"] = new Map();

  const recordTransition = async (
    requestId: string,
    state: RequestState,
    detail?: RequestTransitionDetail,
  ): Promise<TransitionOutcome> => {
    if (options.transitionError) throw options.transitionError;
    recorded.push({ requestId, state, detail });
    if (options.refuseTransitions) {
      return {
        applied: false,
        refused: "already-terminal",
        current: { requestId, state: "confirmed" } as RequestStatusRecord,
      };
    }
    return { applied: true, record: { requestId, state } as RequestStatusRecord };
  };

  const storage: Record<string, unknown> = {
    removeProcessedInputs: async (inputs: DefaultBatcherInput[]) => {
      recordedAtRemoval = [...recorded];
      removed.push(...inputs);
    },
    incrementRetryCount: async (inputs: DefaultBatcherInput[]) =>
      options.dropOnRetry?.(inputs) ?? [],
  };
  if (!options.untracked) storage.recordTransition = recordTransition;

  const processor = new BatchProcessor<DefaultBatcherInput>({
    emitStateTransition: async (prefix: string, payload: any) => {
      events.push({ prefix, payload });
    },
    storage: storage as never,
    submissionCallbacks: callbacks,
    waitForEffectStreamProcessed: async () => null,
    getCallbackKey: (input) => input.address,
    getRetryPolicy: () => ({ maxRetries: 3, retryDelayMs: 10 }),
    setTargetCooldown: () => {},
  });

  return {
    processor,
    recorded,
    events,
    removed,
    get recordedAtRemoval() {
      return recordedAtRemoval;
    },
    settled,
    waitOn: (input) =>
      new Promise<unknown>((resolve, reject) => {
        callbacks.set(input.address, {
          resolve: (value) => {
            settled.set(input.address, { status: "resolved", value });
            resolve(value);
          },
          reject: (value) => {
            settled.set(input.address, { status: "rejected", value });
            reject(value);
          },
          timeoutId: setTimeout(() => {}, 60_000),
        });
      }).then((ok) => ({ ok }), (err) => ({ err })),
    statesOf: (input) =>
      recorded
        .filter((r) => r.requestId === computeRequestId(input, TARGET))
        .map((r) => r.state),
    detailOf: (input, state) =>
      recorded
        .filter((r) =>
          r.requestId === computeRequestId(input, TARGET) && r.state === state
        )
        .at(-1)?.detail,
  } as Harness;
}

function makeAdapter(
  inputs: DefaultBatcherInput[],
  submit: () => Promise<BatchSubmitResult<DefaultBatcherInput>>,
  receipt: Partial<BlockchainTransactionReceipt> = {},
): BlockchainAdapter<any> {
  return {
    buildBatchData: () => ({
      selectedInputs: inputs,
      data: { selectedInputs: [...inputs] },
    }),
    estimateBatchFee: () => "1",
    submitBatch: submit,
    waitForTransactionReceipt: async () => ({
      hash: "0xhash",
      blockNumber: 77n,
      status: 1,
      ...receipt,
    }),
    getAccountAddress: () => "batcher",
    getChainName: () => "test",
    isReady: () => true,
    getBlockNumber: async () => 1n,
  };
}

/**
 * Settled already, or settled within a beat — never "eventually".
 *
 * A wall-clock bound would be flaky and would also miss the point: the fix is
 * that the caller is told inside the batch cycle that dropped its input, not
 * that it is told quickly. `DID-NOT-SETTLE` is what the bug looked like — the
 * caller waiting on its own `timeoutMs`, five minutes by default.
 */
async function settlesPromptly(
  promise: Promise<{ ok?: unknown; err?: unknown }>,
): Promise<unknown> {
  return await Promise.race([
    promise,
    Bun.sleep(100).then(() => "DID-NOT-SETTLE"),
  ]);
}

// --- The happy path is recorded, step by step -------------------------

describe("recording a batch that reaches the chain", () => {
  test("an input the batch carries goes batching → submitted → confirmed", async () => {
    const h = makeHarness();
    const good = makeInput("good");
    const adapter = makeAdapter([good], async () => "0xhash");

    await h.processor.processBatchForTarget(adapter, TARGET, [good]);

    expect(h.statesOf(good)).toEqual(["batching", "submitted", "confirmed"]);
    expect(h.detailOf(good, "submitted")?.transactionHash).toBe("0xhash");
    expect(h.detailOf(good, "confirmed")).toMatchObject({
      transactionHash: "0xhash",
      blockNumber: 77n,
    });
  });

  test("the verdict is written BEFORE the row is removed", async () => {
    const h = makeHarness();
    const good = makeInput("good");

    await h.processor.processBatchForTarget(
      makeAdapter([good], async () => "0xhash"),
      TARGET,
      [good],
    );

    // Order matters under kill -9. Record-then-remove leaves `confirmed` with
    // a surviving row, and the re-picked row's `batching` is refused by the
    // append-only guard. Remove-then-record leaves a `submitted` status with no
    // row — an orphan nothing will ever resolve.
    expect(h.recordedAtRemoval.map((r) => r.state)).toContain("confirmed");
  });

  test("a multi-hash receipt gives each input its OWN hash", async () => {
    const h = makeHarness();
    const a = makeInput("a");
    const b = makeInput("b");
    const adapter = makeAdapter([a, b], async () => "0xhash", {
      hash: "0xhash-a,0xhash-b",
    });

    await h.processor.processBatchForTarget(adapter, TARGET, [a, b]);

    // Adapters that submit one transaction per input report a comma-joined
    // hash. Recording the joined string would give every caller a hash that
    // matches nothing on chain.
    expect(h.detailOf(a, "confirmed")?.transactionHash).toBe("0xhash-a");
    expect(h.detailOf(b, "confirmed")?.transactionHash).toBe("0xhash-b");
  });

  test("an on-chain failure is recorded failed, not confirmed", async () => {
    const h = makeHarness();
    const a = makeInput("a");
    const b = makeInput("b");
    const waiting = h.waitOn(a);
    const adapter = makeAdapter([a, b], async () => "0xhash", { status: 0 });

    await h.processor.processBatchForTarget(adapter, TARGET, [a, b]);

    expect(h.statesOf(a).at(-1)).toBe("failed");
    expect(h.detailOf(a, "failed")).toMatchObject({
      errorCode: "ONCHAIN_FAILED",
      transactionHash: "0xhash",
    });
    expect(h.statesOf(b).at(-1)).toBe("failed");
    // The caller is rejected too, by the pre-existing callback path.
    expect(await settlesPromptly(waiting)).toHaveProperty("err");
    expect(h.settled.get("a")?.status).toBe("rejected");
  });

  test("a ONE-input batch that fails on chain is still recorded failed", async () => {
    const h = makeHarness();
    const lonely = makeInput("lonely");
    const waiting = h.waitOn(lonely);
    const adapter = makeAdapter([lonely], async () => "0xhash", { status: 0 });

    await h.processor.processBatchForTarget(adapter, TARGET, [lonely]);

    // One input is shared/single-transaction semantics. A failed receipt must
    // reject the waiter with the same verdict already written for polling.
    expect(h.statesOf(lonely).at(-1)).toBe("failed");
    expect(h.detailOf(lonely, "failed")?.errorCode).toBe("ONCHAIN_FAILED");
    const outcome = await settlesPromptly(waiting) as { err?: unknown };
    expect(outcome.err).toBeInstanceOf(InputTerminalError);
    expect(outcome.err).toMatchObject({
      statusCode: 422,
      errorCode: "ONCHAIN_FAILED",
      requestId: computeRequestId(lonely, TARGET),
      transactionHash: "0xhash",
      retryable: false,
    });
  });
});

// --- Verdicts that are NOT verdicts -----------------------------------

describe("outcomes that must record nothing terminal", () => {
  test("a deferred input stays queued with no verdict", async () => {
    const h = makeHarness();
    const deferred = makeInput("deferred");
    const adapter = makeAdapter([deferred], async () => ({
      retryable: [{ input: deferred, reason: "validation queue saturated" }],
    }));

    await h.processor.processBatchForTarget(adapter, TARGET, [deferred]);

    // FR-005: it was never judged. `batching` is honest — it WAS picked — but
    // nothing terminal may follow from our own saturation.
    expect(h.statesOf(deferred)).toEqual(["batching"]);
    expect(h.events.filter((e) => e.prefix === "request:terminal")).toEqual([]);
  });

  test("an infra failure records nothing at all beyond being picked", async () => {
    const h = makeHarness();
    const parked = makeInput("parked");
    const adapter = makeAdapter([parked], async () => {
      throw new Error("Unable to connect to the indexer");
    });

    await expect(
      h.processor.processBatchForTarget(adapter, TARGET, [parked]),
    ).rejects.toThrow(/Unable to connect/);

    // Our environment failed, not the input. Charging it a retry is already
    // refused; blaming it in the status store would be the same mistake
    // written down where a user can read it.
    expect(h.statesOf(parked)).toEqual(["batching"]);
  });

  test("an adapter-judged failure below the limit records no verdict", async () => {
    const h = makeHarness();
    const failed = makeInput("failed");
    const adapter = makeAdapter([failed], async () => ({
      failed: [{ input: failed, error: "balance failed" }],
    }));

    await h.processor.processBatchForTarget(adapter, TARGET, [failed]);

    // One retry spent, budget not exhausted: still in flight.
    expect(h.statesOf(failed)).toEqual(["batching"]);
    expect(h.settled.size).toBe(0);
  });
});

// --- Permanent rejection ----------------------------------------------

describe("permanent rejection", () => {
  test("is recorded failed with the adapter's own errorCode", async () => {
    const h = makeHarness();
    const doomed = makeInput("doomed");
    const waiting = h.waitOn(doomed);
    const adapter = makeAdapter([doomed], async () => ({
      permanentRejected: [{
        input: doomed,
        error: "transaction is not well formed",
        errorCode: "NOT_WELL_FORMED",
        statusCode: 400,
      }],
    }));

    await h.processor.processBatchForTarget(adapter, TARGET, [doomed]);

    expect(h.statesOf(doomed).at(-1)).toBe("failed");
    expect(h.detailOf(doomed, "failed")).toMatchObject({
      errorCode: "NOT_WELL_FORMED",
      message: "transaction is not well formed",
    });
    expect(await settlesPromptly(waiting)).toHaveProperty("err");
  });
});

// --- Retry exhaustion: the silent-drop fix ----------------------------

describe("retry exhaustion", () => {
  test("writes failed/RETRIES_EXHAUSTED and tells the waiting caller AT ONCE", async () => {
    const doomed = makeInput("doomed");
    const h = makeHarness({
      dropOnRetry: () => [{ ...doomed, retryCount: 3 }],
    });
    const waiting = h.waitOn(doomed);
    const adapter = makeAdapter([doomed], async () => ({
      failed: [{ input: doomed, error: "balance failed" }],
    }));

    await h.processor.processBatchForTarget(adapter, TARGET, [doomed]);

    // The bug: the row was deleted and the caller kept waiting for its own
    // timeout — five minutes by default — for a request that no longer
    // existed. It must be told before the batch cycle even finishes.
    const outcome = await settlesPromptly(waiting);
    expect(outcome).toHaveProperty("err");
    const error = (outcome as { err: unknown }).err;
    expect(error).toBeInstanceOf(InputValidationError);
    expect((error as InputValidationError).errorCode).toBe("RETRIES_EXHAUSTED");
    // Retrying is not the advice: the row is gone AND the replay key would
    // now recognise a resubmission as a duplicate.
    expect((error as InputValidationError).retryable).toBe(false);
    expect((error as InputValidationError).message).toContain("3");

    expect(h.statesOf(doomed).at(-1)).toBe("failed");
    expect(h.detailOf(doomed, "failed")).toMatchObject({
      errorCode: "RETRIES_EXHAUSTED",
      retryCount: 3,
    });
  });

  test("carries the adapter's last diagnostic into the report", async () => {
    const doomed = makeInput("doomed");
    const h = makeHarness({ dropOnRetry: () => [{ ...doomed, retryCount: 3 }] });
    const waiting = h.waitOn(doomed);
    const adapter = makeAdapter([doomed], async () => ({
      failed: [{ input: doomed, error: "dust lane never freed" }],
    }));

    await h.processor.processBatchForTarget(adapter, TARGET, [doomed]);

    const outcome = await settlesPromptly(waiting) as { err: Error };
    expect(outcome.err.message).toContain("dust lane never freed");
  });

  test("also fires when submitBatch throws an input-shaped error", async () => {
    const doomed = makeInput("doomed");
    const h = makeHarness({ dropOnRetry: () => [{ ...doomed, retryCount: 3 }] });
    const waiting = h.waitOn(doomed);
    const adapter = makeAdapter([doomed], async () => {
      throw new Error("transaction rejected by the node");
    });

    await expect(
      h.processor.processBatchForTarget(adapter, TARGET, [doomed]),
    ).rejects.toThrow(/rejected by the node/);

    // The throw still propagates — the batch DID fail — but the input that got
    // dropped on the way out is not left silent.
    expect(await settlesPromptly(waiting)).toHaveProperty("err");
    expect(h.detailOf(doomed, "failed")?.errorCode).toBe("RETRIES_EXHAUSTED");
  });

  test("also fires on the legacy splice protocol", async () => {
    const kept = makeInput("kept");
    const dropped = makeInput("dropped");
    const h = makeHarness({ dropOnRetry: () => [{ ...dropped, retryCount: 3 }] });
    const waiting = h.waitOn(dropped);

    const adapter = makeAdapter([kept, dropped], async () => "0xhash");
    const original = adapter.buildBatchData;
    adapter.buildBatchData = (...args) => {
      const built = original.apply(adapter, args as any)!;
      (built.data as any).selectedInputs = [kept];
      return built;
    };

    await h.processor.processBatchForTarget(adapter, TARGET, [kept, dropped]);

    expect(await settlesPromptly(waiting)).toHaveProperty("err");
    expect(h.detailOf(dropped, "failed")?.errorCode).toBe("RETRIES_EXHAUSTED");
    expect(h.statesOf(kept).at(-1)).toBe("confirmed");
  });

  test("a no-wait caller has no callback, and that is not an error", async () => {
    const doomed = makeInput("doomed");
    const h = makeHarness({ dropOnRetry: () => [{ ...doomed, retryCount: 3 }] });
    const adapter = makeAdapter([doomed], async () => ({
      failed: [{ input: doomed, error: "balance failed" }],
    }));

    await h.processor.processBatchForTarget(adapter, TARGET, [doomed]);

    // Nobody is holding a connection, but the record is what they will poll.
    expect(h.settled.size).toBe(0);
    expect(h.detailOf(doomed, "failed")?.errorCode).toBe("RETRIES_EXHAUSTED");
  });
});

// --- The plan's headline: four verdicts, four fates -------------------

describe("a mixed batch", () => {
  test("four verdicts in one BatchOutcome produce four different fates", async () => {
    const carried = makeInput("carried");
    const doomed = makeInput("doomed");
    const deferred = makeInput("deferred");
    const exhausted = makeInput("exhausted");
    const h = makeHarness({
      dropOnRetry: (inputs) =>
        inputs
          .filter((i) => i.address === "exhausted")
          .map((i) => ({ ...i, retryCount: 3 })),
    });
    const waiters = {
      carried: h.waitOn(carried),
      doomed: h.waitOn(doomed),
      exhausted: h.waitOn(exhausted),
    };

    const adapter = makeAdapter(
      [carried, doomed, deferred, exhausted],
      async () => ({
        hash: "0xhash",
        submitted: [carried],
        permanentRejected: [{
          input: doomed,
          error: "not well formed",
          errorCode: "NOT_WELL_FORMED",
        }],
        retryable: [{ input: deferred, reason: "executor saturated" }],
        failed: [{ input: exhausted, error: "balance failed" }],
      }),
    );

    await h.processor.processBatchForTarget(adapter, TARGET, [
      carried,
      doomed,
      deferred,
      exhausted,
    ]);

    // Each id's status matches the verdict the adapter actually returned for
    // it — SC-003, checked against the BatchOutcome rather than against a
    // narrative about it.
    expect(h.statesOf(carried)).toEqual(["batching", "submitted", "confirmed"]);
    expect(h.detailOf(doomed, "failed")?.errorCode).toBe("NOT_WELL_FORMED");
    expect(h.statesOf(deferred)).toEqual(["batching"]);
    expect(h.detailOf(exhausted, "failed")?.errorCode).toBe("RETRIES_EXHAUSTED");

    expect(h.settled.get("carried")?.status).toBe("resolved");
    expect(h.settled.get("doomed")?.status).toBe("rejected");
    expect(h.settled.get("exhausted")?.status).toBe("rejected");
    expect(await settlesPromptly(waiters.carried)).toHaveProperty("ok");
    expect(await settlesPromptly(waiters.doomed)).toHaveProperty("err");
    expect(await settlesPromptly(waiters.exhausted)).toHaveProperty("err");
  });
});

// --- Recording must never be able to break a batch ---------------------

describe("the status write is observation, never judgement", () => {
  test("a refused transition is normal operation, not a batch failure", async () => {
    const h = makeHarness({ refuseTransitions: true });
    const good = makeInput("good");
    const waiting = h.waitOn(good);

    // A batch that confirmed on chain and died before its rows were removed is
    // re-picked on restart; every transition it writes is refused by the
    // append-only guard. That is the guard WORKING.
    await h.processor.processBatchForTarget(
      makeAdapter([good], async () => "0xhash"),
      TARGET,
      [good],
    );

    expect(h.removed).toEqual([good]);
    expect(await settlesPromptly(waiting)).toHaveProperty("ok");
  });

  test("a status store that throws does not stop the chain work", async () => {
    const h = makeHarness({ transitionError: new Error("database is read-only") });
    const good = makeInput("good");
    const waiting = h.waitOn(good);

    await h.processor.processBatchForTarget(
      makeAdapter([good], async () => "0xhash"),
      TARGET,
      [good],
    );

    // The transaction is on chain either way. Failing the batch because we
    // could not write a note about it would turn an observability outage into
    // a submission outage.
    expect(h.removed).toEqual([good]);
    expect(await settlesPromptly(waiting)).toHaveProperty("ok");
  });

  test("a queue-only backend behaves exactly as before, plus the drop fix", async () => {
    const doomed = makeInput("doomed");
    const h = makeHarness({
      untracked: true,
      dropOnRetry: () => [{ ...doomed, retryCount: 3 }],
    });
    const waiting = h.waitOn(doomed);
    const adapter = makeAdapter([doomed], async () => ({
      failed: [{ input: doomed, error: "balance failed" }],
    }));

    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    try {
      await h.processor.processBatchForTarget(adapter, TARGET, [doomed]);
    } finally {
      console.warn = realWarn;
    }

    // FileStorage cannot record anything…
    expect(h.recorded).toEqual([]);
    // …and it must do so QUIETLY. Every write is feature-detected, so a
    // queue-only deployment does not earn a warning per input per batch for a
    // capability it deliberately opted out of.
    expect(warnings.filter((w) => w.includes("Could not record"))).toEqual([]);
    // …but the caller-notification half of FR-004 is storage-agnostic and
    // must still happen.
    expect(await settlesPromptly(waiting)).toHaveProperty("err");
  });
});

// --- Events ------------------------------------------------------------

describe("per-request events", () => {
  test("a confirmed request emits exactly one terminal event", async () => {
    const h = makeHarness();
    const good = makeInput("good");

    await h.processor.processBatchForTarget(
      makeAdapter([good], async () => "0xhash"),
      TARGET,
      [good],
    );

    const terminal = h.events.filter((e) => e.prefix === "request:terminal");
    expect(terminal.length).toBe(1);
    expect(terminal[0].payload).toMatchObject({
      requestId: computeRequestId(good, TARGET),
      target: TARGET,
      state: "confirmed",
      transactionHash: "0xhash",
    });
  });

  test("a failed request emits its errorCode", async () => {
    const doomed = makeInput("doomed");
    const h = makeHarness({ dropOnRetry: () => [{ ...doomed, retryCount: 3 }] });

    await h.processor.processBatchForTarget(
      makeAdapter([doomed], async () => ({
        failed: [{ input: doomed, error: "balance failed" }],
      })),
      TARGET,
      [doomed],
    );

    expect(h.events.filter((e) => e.prefix === "request:terminal")[0].payload)
      .toMatchObject({ state: "failed", errorCode: "RETRIES_EXHAUSTED" });
  });

  test("a deferred request emits nothing terminal", async () => {
    const h = makeHarness();
    const deferred = makeInput("deferred");

    await h.processor.processBatchForTarget(
      makeAdapter([deferred], async () => ({
        retryable: [{ input: deferred, reason: "saturated" }],
      })),
      TARGET,
      [deferred],
    );

    expect(h.events.filter((e) => e.prefix === "request:terminal")).toEqual([]);
  });
});

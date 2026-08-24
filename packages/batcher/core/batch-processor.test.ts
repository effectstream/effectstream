import { expect, test } from "bun:test";
import { BatchProcessor, normalizeBatchOutcome } from "./batch-processor.ts";
import { InputValidationError } from "./errors.ts";
import type { DefaultBatcherInput } from "./types.ts";
import type {
  BatchSubmitResult,
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";

// --- Harness -----------------------------------------------------------
//
// BatchProcessor takes its collaborators as a plain object, so these tests
// drive it directly: no chain, no server, no storage engine.

const TARGET = "test-target";

function makeInput(address: string): DefaultBatcherInput {
  return {
    addressType: 1 as DefaultBatcherInput["addressType"],
    input: `input-from-${address}`,
    address,
    timestamp: "2026-08-13T00:00:00.000Z",
    target: TARGET,
  };
}

interface Harness {
  processor: BatchProcessor<DefaultBatcherInput>;
  removed: DefaultBatcherInput[];
  retried: DefaultBatcherInput[];
  cooldowns: number[];
  callbacks: Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>;
  /** Settled callback results, keyed by the input's address. */
  settled: Map<string, { status: "resolved" | "rejected"; value: any }>;
  waitOn: (input: DefaultBatcherInput) => void;
}

function makeHarness(options: { removeError?: Error } = {}): Harness {
  const removed: DefaultBatcherInput[] = [];
  const retried: DefaultBatcherInput[] = [];
  const cooldowns: number[] = [];
  const callbacks: Harness["callbacks"] = new Map();
  const settled: Harness["settled"] = new Map();

  const processor = new BatchProcessor<DefaultBatcherInput>({
    emitStateTransition: async () => {},
    storage: {
      removeProcessedInputs: async (inputs) => {
        if (options.removeError) throw options.removeError;
        removed.push(...inputs);
      },
      incrementRetryCount: async (inputs) => {
        retried.push(...inputs);
      },
    },
    submissionCallbacks: callbacks,
    waitForEffectStreamProcessed: async () => null,
    getCallbackKey: (input) => input.address,
    getRetryPolicy: () => ({ maxRetries: 3, retryDelayMs: 10 }),
    setTargetCooldown: (_target, ms) => {
      cooldowns.push(ms);
    },
  });

  // Register a caller waiting on this input, recording how it settles.
  const waitOn = (input: DefaultBatcherInput) => {
    const key = input.address;
    callbacks.set(key, {
      resolve: (value) => settled.set(key, { status: "resolved", value }),
      reject: (value) => settled.set(key, { status: "rejected", value }),
      timeoutId: setTimeout(() => {}, 60_000),
    });
  };

  return { processor, removed, retried, cooldowns, callbacks, settled, waitOn };
}

function makeAdapter(
  inputs: DefaultBatcherInput[],
  submit: () => Promise<BatchSubmitResult<DefaultBatcherInput>>,
): BlockchainAdapter<any> {
  const receipt: BlockchainTransactionReceipt = {
    hash: "0xhash",
    blockNumber: 1n,
    status: 1,
  };
  return {
    buildBatchData: () => ({ selectedInputs: inputs, data: { selectedInputs: [...inputs] } }),
    estimateBatchFee: () => "1",
    submitBatch: submit,
    waitForTransactionReceipt: async () => receipt,
    getAccountAddress: () => "batcher",
    getChainName: () => "test",
    isReady: () => true,
    getBlockNumber: async () => 1n,
  };
}

// --- normalizeBatchOutcome --------------------------------------------

test("a bare hash normalises to a submitted-everything outcome", () => {
  expect(normalizeBatchOutcome("0xabc")).toEqual({ hash: "0xabc" });
});

test("an outcome object passes through untouched", () => {
  const outcome = { hash: "0xabc", retryable: [] };
  expect(normalizeBatchOutcome(outcome)).toBe(outcome);
});

// --- Permanent rejection ----------------------------------------------

test("a permanently rejected input is removed and its caller rejected", async () => {
  const h = makeHarness();
  const doomed = makeInput("doomed");
  h.waitOn(doomed);

  const adapter = makeAdapter([doomed], async () => ({
    // No hash: nothing was submitted.
    permanentRejected: [{
      input: doomed,
      error: "transaction is not well formed",
      errorCode: "NOT_WELL_FORMED",
      statusCode: 400,
    }],
  }));

  await h.processor.processBatchForTarget(adapter, TARGET, [doomed]);

  expect(h.removed).toEqual([doomed]);
  // The retry budget exists to bound bad inputs, not to re-run doomed ones.
  expect(h.retried).toEqual([]);

  const settled = h.settled.get("doomed");
  expect(settled?.status).toEqual("rejected");
  expect(settled?.value).toBeInstanceOf(InputValidationError);
  expect((settled?.value as InputValidationError).statusCode).toEqual(400);
  expect((settled?.value as InputValidationError).errorCode).toEqual(
    "NOT_WELL_FORMED",
  );
  // The callback is consumed, so a later receipt cannot settle it twice.
  expect(h.callbacks.has("doomed")).toBe(false);
});

test("a permanent rejection defaults to status 400", async () => {
  const h = makeHarness();
  const doomed = makeInput("doomed");
  h.waitOn(doomed);

  const adapter = makeAdapter([doomed], async () => ({
    permanentRejected: [{ input: doomed, error: "nope" }],
  }));
  await h.processor.processBatchForTarget(adapter, TARGET, [doomed]);

  expect((h.settled.get("doomed")?.value as InputValidationError).statusCode)
    .toEqual(400);
});

test("failed permanent-row removal rejects the caller and hard-pauses the target", async () => {
  const h = makeHarness({ removeError: new Error("storage is read-only") });
  const doomed = makeInput("doomed");
  h.waitOn(doomed);

  const adapter = makeAdapter([doomed], async () => ({
    permanentRejected: [{
      input: doomed,
      error: "not well formed",
      errorCode: "NOT_WELL_FORMED",
    }],
  }));

  await h.processor.processBatchForTarget(adapter, TARGET, [doomed]);

  expect(h.settled.get("doomed")?.status).toBe("rejected");
  expect(h.retried).toEqual([]);
  // The surviving row cannot be picked again in this process and loop without
  // a retry count while the operator repairs storage.
  expect(h.cooldowns).toEqual([Number.POSITIVE_INFINITY]);
});

// --- Deferral ----------------------------------------------------------

test("a deferred input is left queued and charged no retry", async () => {
  const h = makeHarness();
  const deferred = makeInput("deferred");
  h.waitOn(deferred);

  const adapter = makeAdapter([deferred], async () => ({
    retryable: [{ input: deferred, reason: "validation queue saturated" }],
  }));

  await h.processor.processBatchForTarget(adapter, TARGET, [deferred]);

  expect(h.removed).toEqual([]);
  expect(h.retried).toEqual([]);
  // Still waiting: the input was never judged, so its caller keeps waiting
  // for a later round rather than being told it failed.
  expect(h.settled.has("deferred")).toBe(false);
  expect(h.callbacks.has("deferred")).toBe(true);
});

// --- Retry-charged failure --------------------------------------------

test("an adapter-judged legacy failure charges one retry and leaves the row", async () => {
  const h = makeHarness();
  const failed = makeInput("failed");
  h.waitOn(failed);

  const adapter = makeAdapter([failed], async () => ({
    failed: [{ input: failed, error: "balance failed" }],
  }));

  await h.processor.processBatchForTarget(adapter, TARGET, [failed]);

  expect(h.retried).toEqual([failed]);
  expect(h.removed).toEqual([]);
  // A bounded retry is neither a permanent verdict nor a successful receipt.
  expect(h.settled.has("failed")).toBe(false);
  expect(h.callbacks.has("failed")).toBe(true);
});

// --- Mixed batch -------------------------------------------------------

test("one batch can submit, reject and defer different inputs", async () => {
  const h = makeHarness();
  const good = makeInput("good");
  const doomed = makeInput("doomed");
  const deferred = makeInput("deferred");
  for (const input of [good, doomed, deferred]) h.waitOn(input);

  const adapter = makeAdapter([good, doomed, deferred], async () => ({
    hash: "0xhash",
    submitted: [good],
    permanentRejected: [{
      input: doomed,
      error: "not well formed",
      errorCode: "NOT_WELL_FORMED",
    }],
    retryable: [{ input: deferred, reason: "executor saturated" }],
  }));

  await h.processor.processBatchForTarget(adapter, TARGET, [
    good,
    doomed,
    deferred,
  ]);

  // The doomed input is removed by rejection; the good one by its receipt.
  expect(h.removed).toContain(doomed);
  expect(h.removed).toContain(good);
  expect(h.removed).not.toContain(deferred);
  expect(h.retried).toEqual([]);

  expect(h.settled.get("doomed")?.status).toEqual("rejected");
  expect(h.settled.get("good")?.status).toEqual("resolved");
  expect(h.settled.has("deferred")).toBe(false);
});

test("submitted, permanently rejected and retry-charged inputs stay distinct", async () => {
  const h = makeHarness();
  const good = makeInput("good");
  const doomed = makeInput("doomed");
  const failed = makeInput("failed");
  for (const input of [good, doomed, failed]) h.waitOn(input);

  const adapter = makeAdapter([good, doomed, failed], async () => ({
    hash: "0xhash",
    submitted: [good],
    permanentRejected: [{
      input: doomed,
      error: "not well formed",
      errorCode: "NOT_WELL_FORMED",
    }],
    failed: [{ input: failed, error: "submit failed" }],
  }));

  await h.processor.processBatchForTarget(adapter, TARGET, [
    good,
    doomed,
    failed,
  ]);

  expect(h.removed).toContain(good);
  expect(h.removed).toContain(doomed);
  expect(h.removed).not.toContain(failed);
  expect(h.retried).toEqual([failed]);
  expect(h.settled.get("good")?.status).toEqual("resolved");
  expect(h.settled.get("doomed")?.status).toEqual("rejected");
  expect(h.settled.has("failed")).toBe(false);
});

test("inputs the adapter does not mention ride along with the hash", async () => {
  const h = makeHarness();
  const quiet = makeInput("quiet");
  const doomed = makeInput("doomed");
  for (const input of [quiet, doomed]) h.waitOn(input);

  // `submitted` omitted: everything not rejected or deferred was carried.
  const adapter = makeAdapter([quiet, doomed], async () => ({
    hash: "0xhash",
    permanentRejected: [{ input: doomed, error: "nope" }],
  }));

  await h.processor.processBatchForTarget(adapter, TARGET, [quiet, doomed]);

  expect(h.settled.get("quiet")?.status).toEqual("resolved");
  expect(h.settled.get("doomed")?.status).toEqual("rejected");
});

// --- Batches that produce no transaction -------------------------------

test("an all-rejected batch completes without waiting for a receipt", async () => {
  const h = makeHarness();
  const a = makeInput("a");
  const b = makeInput("b");
  for (const input of [a, b]) h.waitOn(input);

  let receiptWaits = 0;
  const adapter = makeAdapter([a, b], async () => ({
    permanentRejected: [
      { input: a, error: "nope" },
      { input: b, error: "nope" },
    ],
  }));
  adapter.waitForTransactionReceipt = async () => {
    receiptWaits += 1;
    throw new Error("must not wait for a receipt that was never submitted");
  };

  await h.processor.processBatchForTarget(adapter, TARGET, [a, b]);

  expect(receiptWaits).toEqual(0);
  expect(h.settled.get("a")?.status).toEqual("rejected");
  expect(h.settled.get("b")?.status).toEqual("rejected");
});

test("an all-deferred batch leaves everything queued and untouched", async () => {
  const h = makeHarness();
  const a = makeInput("a");

  const adapter = makeAdapter([a], async () => ({
    retryable: [{ input: a, reason: "cache not ready" }],
  }));

  await h.processor.processBatchForTarget(adapter, TARGET, [a]);

  expect(h.removed).toEqual([]);
  expect(h.retried).toEqual([]);
});

// --- Invariant failure -------------------------------------------------

test("an invariant failure parks the whole batch and charges nothing", async () => {
  const h = makeHarness();
  const a = makeInput("a");
  const b = makeInput("b");
  for (const input of [a, b]) h.waitOn(input);

  const adapter = makeAdapter([a, b], async () => ({
    invariantFailure: { message: "revalidated clean after finalize failure" },
  }));

  await expect(
    h.processor.processBatchForTarget(adapter, TARGET, [a, b]),
  ).rejects.toThrow(/invariant failure/i);

  // Nothing removed, nothing charged, nothing settled: the batcher cannot
  // tell which input is at fault, so it blames none of them.
  expect(h.removed).toEqual([]);
  expect(h.retried).toEqual([]);
  expect(h.settled.size).toEqual(0);
  expect(h.cooldowns.length).toEqual(1);
});

test("an unscoped invariant suppresses the batch's own per-input verdicts", async () => {
  const h = makeHarness();
  const doomed = makeInput("doomed");
  h.waitOn(doomed);

  const adapter = makeAdapter([doomed], async () => ({
    permanentRejected: [{ input: doomed, error: "nope" }],
    invariantFailure: { message: "internal inconsistency" },
  }));

  await expect(
    h.processor.processBatchForTarget(adapter, TARGET, [doomed]),
  ).rejects.toThrow(/invariant failure/i);

  expect(h.removed).toEqual([]);
  expect(h.settled.size).toEqual(0);
});

test("a scoped invariant parks its input but preserves independent worker outcomes", async () => {
  const h = makeHarness();
  const submitted = makeInput("submitted");
  const doomed = makeInput("doomed");
  const affected = makeInput("affected");
  for (const input of [submitted, doomed, affected]) h.waitOn(input);

  const adapter = makeAdapter([submitted, doomed, affected], async () => ({
    hash: "0xhash",
    submitted: [submitted],
    permanentRejected: [{ input: doomed, error: "not well formed" }],
    invariantFailure: {
      message: "finalized output failed while original stayed valid",
      inputs: [affected],
    },
  }));

  await expect(
    h.processor.processBatchForTarget(adapter, TARGET, [
      submitted,
      doomed,
      affected,
    ]),
  ).rejects.toThrow(/invariant failure/i);

  expect(h.removed).toContain(submitted);
  expect(h.removed).toContain(doomed);
  expect(h.removed).not.toContain(affected);
  expect(h.settled.get("submitted")?.status).toBe("resolved");
  expect(h.settled.get("doomed")?.status).toBe("rejected");
  expect(h.settled.has("affected")).toBe(false);
  expect(h.retried).toEqual([]);
  expect(h.cooldowns).toHaveLength(1);
});

test("a hard invariant applies an infinite cooldown for manual recovery", async () => {
  const h = makeHarness();
  const affected = makeInput("affected");
  h.waitOn(affected);

  const adapter = makeAdapter([affected], async () => ({
    invariantFailure: {
      message: "finalized rollback failed",
      inputs: [affected],
      hardPause: true,
    },
  }));

  await expect(
    h.processor.processBatchForTarget(adapter, TARGET, [affected]),
  ).rejects.toThrow(/invariant failure/i);

  expect(h.cooldowns).toEqual([Number.POSITIVE_INFINITY]);
  expect(h.removed).toEqual([]);
  expect(h.retried).toEqual([]);
  expect(h.settled.has("affected")).toBe(false);
});

// --- Bare-hash adapters are untouched ----------------------------------

test("a bare-hash adapter still resolves every input from the receipt", async () => {
  const h = makeHarness();
  const a = makeInput("a");
  const b = makeInput("b");
  for (const input of [a, b]) h.waitOn(input);

  const adapter = makeAdapter([a, b], async () => "0xhash");

  await h.processor.processBatchForTarget(adapter, TARGET, [a, b]);

  expect(h.removed).toEqual([a, b]);
  expect(h.retried).toEqual([]);
  expect(h.settled.get("a")?.status).toEqual("resolved");
  expect(h.settled.get("b")?.status).toEqual("resolved");
});

test("a bare-hash adapter that splices inputs still charges them a retry", async () => {
  const h = makeHarness();
  const kept = makeInput("kept");
  const dropped = makeInput("dropped");
  for (const input of [kept, dropped]) h.waitOn(input);

  // The legacy partial-failure protocol: mutate data.selectedInputs, return a
  // bare hash. This must keep working exactly as before.
  const adapter = makeAdapter([kept, dropped], async () => "0xhash");
  const original = adapter.buildBatchData;
  adapter.buildBatchData = (...args) => {
    const built = original.apply(adapter, args as any)!;
    (built.data as any).selectedInputs = [kept];
    return built;
  };

  await h.processor.processBatchForTarget(adapter, TARGET, [kept, dropped]);

  expect(h.retried).toEqual([dropped]);
  expect(h.removed).toEqual([kept]);
  expect(h.settled.get("kept")?.status).toEqual("resolved");
  expect(h.settled.has("dropped")).toBe(false);
});

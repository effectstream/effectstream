/**
 * When a submission fails for a reason that is not the environment's
 * (`BatchProcessor.isInfraFailure` is false), `incrementRetryCount` charges
 * the inputs a retry and drops those that reach `maxRetries`. A dropped input
 * is never submitted again, so its `wait-receipt` /
 * `wait-effectstream-processed` caller is rejected right away with the submit
 * error, instead of waiting for its receipt timeout. Inputs with retries left
 * and infrastructure failures (parked, not charged) keep their callers
 * waiting, as before.
 *
 * The Batcher-level tests use the real file storage (temporary directory), so
 * the real drop rule runs. No broker is needed: `EventManager.Instance`
 * `subscribe` / `unsubscribe` are replaced by recording stubs.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventManager } from "@effectstream/event-client";

import type {
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import { BatchProcessor } from "../core/batch-processor.ts";
import { Batcher } from "../core/batcher.ts";
import { FileStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const TARGET = "stubChain";
/** A verdict on the input (what Q24 measured), not an environment failure. */
const REFUSAL = "failed assert: lock already minted";
/** Matches `BatchProcessor.isInfraFailure`: parked, never charged. */
const OUTAGE = "fetch failed";

// ── event-bus stubs (nothing here may reach a broker) ────────────────────────

let subscribeCalls = 0;
const originalSubscribe = EventManager.Instance.subscribe;
const originalUnsubscribe = EventManager.Instance.unsubscribe;

// ── per-test resources ───────────────────────────────────────────────────────

const dirs: string[] = [];
const pendingCallers: Array<Promise<unknown>> = [];
const batchers: Array<Batcher<DefaultBatcherInput>> = [];

beforeEach(() => {
  subscribeCalls = 0;
  // deno-lint-ignore no-explicit-any
  (EventManager.Instance as any).subscribe = async () => {
    subscribeCalls++;
    return Symbol("subscription");
  };
  // deno-lint-ignore no-explicit-any
  (EventManager.Instance as any).unsubscribe = async () => {};
});

afterEach(async () => {
  // Settle callers a test left waiting, so no receipt timer outlives it.
  for (const batcher of batchers.splice(0)) {
    for (const cb of callbacksOf(batcher).values()) {
      cb.reject(new Error("test cleanup"));
    }
    callbacksOf(batcher).clear();
  }
  await Promise.allSettled(pendingCallers.splice(0));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  EventManager.Instance.subscribe = originalSubscribe;
  EventManager.Instance.unsubscribe = originalUnsubscribe;
});

// ── helpers ──────────────────────────────────────────────────────────────────

type Callbacks = Map<string, {
  resolve: (r: BlockchainTransactionReceipt) => void;
  reject: (e: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}>;

function callbacksOf(batcher: Batcher<DefaultBatcherInput>): Callbacks {
  // deno-lint-ignore no-explicit-any
  return (batcher as any).submissionCallbacks as Callbacks;
}

/** Wait until `n` receipt callbacks are registered (batchInput is async). */
async function queued(batcher: Batcher<DefaultBatcherInput>, n = 1) {
  const deadline = Date.now() + 2_000;
  while (callbacksOf(batcher).size < n) {
    if (Date.now() > deadline) throw new Error("input was never queued");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

type Outcome =
  | { state: "resolved"; value: unknown; ms: number }
  | { state: "rejected"; error: unknown; ms: number }
  | { state: "pending"; ms: number };

/** How `promise` settles within `ms` (measured from now). */
async function outcomeWithin(promise: Promise<unknown>, ms: number): Promise<Outcome> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => resolve({ state: "pending", ms: Date.now() - start }), ms);
  });
  const settled = promise.then(
    (value): Outcome => ({ state: "resolved", value, ms: Date.now() - start }),
    (error): Outcome => ({ state: "rejected", error, ms: Date.now() - start }),
  );
  try {
    return await Promise.race([settled, pending]);
  } finally {
    clearTimeout(timer);
  }
}

/** Track a caller's promise so afterEach can settle it. */
function track<P extends Promise<unknown>>(promise: P): P {
  pendingCallers.push(promise.catch(() => {}));
  return promise;
}

let counter = 0;
function input(extra: Partial<DefaultBatcherInput> = {}): DefaultBatcherInput {
  counter++;
  return {
    addressType: 0,
    address: "0x0000000000000000000000000000000000000001",
    input: `payload-${counter}`,
    signature: "0xsig",
    timestamp: String(Date.now() + counter),
    target: TARGET,
    ...extra,
  };
}

/** An adapter whose `submitBatch` always throws `error`. */
class FailingAdapter implements BlockchainAdapter<{ n: number }> {
  submitted = 0;
  constructor(private readonly error: Error) {}
  buildBatchData(
    inputs: DefaultBatcherInput[],
  ): BatchBuildingResult<{ n: number }> | null {
    return inputs.length === 0
      ? null
      : { selectedInputs: inputs, data: { n: inputs.length } };
  }
  estimateBatchFee(): bigint {
    return 0n;
  }
  async submitBatch(): Promise<string> {
    this.submitted++;
    throw this.error;
  }
  async waitForTransactionReceipt(
    hash: string,
  ): Promise<BlockchainTransactionReceipt> {
    return { hash, blockNumber: 1n, status: 1 };
  }
  getAccountAddress(): string {
    return "stub-account";
  }
  getChainName(): string {
    return "stub";
  }
  isReady(): boolean {
    return true;
  }
  async getBlockNumber(): Promise<bigint> {
    return 1n;
  }
  verifySignature(): boolean {
    return true;
  }
}

/** An embedded batcher (no HTTP server, event system off), real file storage. */
function embeddedBatcher(error: Error, maxRetries: number) {
  const dir = mkdtempSync(join(tmpdir(), "batcher-t5f-"));
  dirs.push(dir);
  const storage = new FileStorage<DefaultBatcherInput>(dir);
  const adapter = new FailingAdapter(error);
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    enableHttpServer: false,
    enableEventSystem: false,
    maxRetries,
    retryDelayMs: 0,
    adapters: { [TARGET]: adapter },
    defaultTarget: TARGET,
  }, storage);
  batchers.push(batcher);
  return { batcher, storage, adapter };
}

// ── through the real Batcher wiring ──────────────────────────────────────────

describe("Batcher (embedded) — a dropped input's waiting caller", () => {
  test("maxRetries 1, refused submission: 'wait-receipt' rejects at once with the submit error", async () => {
    const refusal = new Error(REFUSAL);
    const { batcher, storage, adapter } = embeddedBatcher(refusal, 1);
    const pending = track(batcher.batchInput(input(), "wait-receipt", 60_000));
    await queued(batcher);
    const [entry] = [...callbacksOf(batcher).values()];

    const cleared: unknown[] = [];
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = ((id?: Parameters<typeof clearTimeout>[0]) => {
      cleared.push(id);
      return originalClearTimeout(id);
    }) as typeof clearTimeout;
    let outcome: Outcome;
    try {
      await batcher.forceProcessBatches();
      outcome = await outcomeWithin(pending, 1_000);
    } finally {
      globalThis.clearTimeout = originalClearTimeout;
    }

    expect(adapter.submitted).toBe(1);
    expect(outcome.state).toBe("rejected");
    if (outcome.state === "rejected") expect(outcome.error).toBe(refusal);
    expect(outcome.ms).toBeLessThan(1_000);
    expect(await storage.getAllInputs()).toHaveLength(0); // dropped
    expect(callbacksOf(batcher).size).toBe(0);
    expect(cleared).toContain(entry.timeoutId); // its receipt timer is gone
    expect(subscribeCalls).toBe(0);
  });

  test("the same for 'wait-effectstream-processed' (the receipt stage is shared)", async () => {
    const refusal = new Error(REFUSAL);
    const { batcher, storage } = embeddedBatcher(refusal, 1);
    const pending = track(
      batcher.batchInput(input(), "wait-effectstream-processed", 60_000),
    );
    await queued(batcher);
    await batcher.forceProcessBatches();
    const outcome = await outcomeWithin(pending, 1_000);

    expect(outcome.state).toBe("rejected");
    if (outcome.state === "rejected") expect(outcome.error).toBe(refusal);
    expect(await storage.getAllInputs()).toHaveLength(0);
    expect(callbacksOf(batcher).size).toBe(0);
    expect(subscribeCalls).toBe(0);
  });

  test("infrastructure failure: the input is parked and the caller is NOT rejected early", async () => {
    const { batcher, storage, adapter } = embeddedBatcher(new Error(OUTAGE), 1);
    const pending = track(batcher.batchInput(input(), "wait-receipt", 1_500));
    await queued(batcher);
    await batcher.forceProcessBatches();

    expect(adapter.submitted).toBe(1);
    expect((await outcomeWithin(pending, 800)).state).toBe("pending");
    const kept = await storage.getAllInputs();
    expect(kept).toHaveLength(1); // parked, not charged
    expect(kept[0].retryCount ?? 0).toBe(0);
    expect(callbacksOf(batcher).size).toBe(1);

    // Today's behaviour is kept: only the receipt timeout ends the wait.
    const final = await outcomeWithin(pending, 3_000);
    expect(final.state).toBe("rejected");
    if (final.state === "rejected") {
      expect((final.error as Error).message).toBe("Receipt confirmation timeout");
    }
  });

  test("retries left: the caller keeps waiting, and is rejected when the last retry drops the input", async () => {
    const refusal = new Error(REFUSAL);
    const { batcher, storage, adapter } = embeddedBatcher(refusal, 3);
    const pending = track(batcher.batchInput(input(), "wait-receipt", 60_000));
    await queued(batcher);

    for (const attempt of [1, 2]) {
      await batcher.forceProcessBatches();
      expect((await outcomeWithin(pending, 200)).state).toBe("pending");
      const kept = await storage.getAllInputs();
      expect(kept).toHaveLength(1);
      expect(kept[0].retryCount).toBe(attempt);
      expect(callbacksOf(batcher).size).toBe(1);
    }

    await batcher.forceProcessBatches();
    const outcome = await outcomeWithin(pending, 1_000);
    expect(adapter.submitted).toBe(3);
    expect(outcome.state).toBe("rejected");
    if (outcome.state === "rejected") expect(outcome.error).toBe(refusal);
    expect(await storage.getAllInputs()).toHaveLength(0);
    expect(callbacksOf(batcher).size).toBe(0);
  });

  test("a batch with one input on its last retry: only that caller is rejected", async () => {
    const refusal = new Error(REFUSAL);
    const { batcher, storage } = embeddedBatcher(refusal, 3);
    const fresh = input();
    const lastTry = input({ retryCount: 2 });
    const freshCaller = track(batcher.batchInput(fresh, "wait-receipt", 60_000));
    const lastTryCaller = track(batcher.batchInput(lastTry, "wait-receipt", 60_000));
    await queued(batcher, 2);
    await batcher.forceProcessBatches();

    const last = await outcomeWithin(lastTryCaller, 1_000);
    expect(last.state).toBe("rejected");
    if (last.state === "rejected") expect(last.error).toBe(refusal);
    expect((await outcomeWithin(freshCaller, 200)).state).toBe("pending");
    const kept = await storage.getAllInputs();
    expect(kept.map((i) => i.input)).toEqual([fresh.input]);
    expect(kept[0].retryCount).toBe(1);
    expect(callbacksOf(batcher).size).toBe(1);
  });
});

// ── BatchProcessor's hook contract ───────────────────────────────────────────

/** `inputs`: what the stub storage holds; `added`: every input ever queued. */
type Queue = { inputs: DefaultBatcherInput[]; added: DefaultBatcherInput[] };

function processorWith(opts: {
  maxRetries: number;
  /** The storage hook's `getAllInputs`; omitted = the historical hook shape. */
  getAllInputs?: (queue: Queue) => Promise<DefaultBatcherInput[]>;
  incrementFails?: boolean;
}) {
  const queue: Queue = { inputs: [], added: [] };
  const rejected: Error[] = [];
  let reads = 0;
  const callbacks: Callbacks = new Map();
  const key = (i: DefaultBatcherInput) => i.timestamp + i.input;
  const storage = {
    removeProcessedInputs: async () => {},
    incrementRetryCount: async (
      inputs: DefaultBatcherInput[],
      _target: string,
      maxRetries: number,
    ) => {
      if (opts.incrementFails) throw new Error("disk full");
      const charged = new Set(inputs.map(key));
      queue.inputs = queue.inputs.flatMap((i) => {
        if (!charged.has(key(i))) return [i];
        const retryCount = (i.retryCount ?? 0) + 1;
        return retryCount >= maxRetries ? [] : [{ ...i, retryCount }];
      });
    },
    ...(opts.getAllInputs
      ? {
        getAllInputs: () => {
          reads++;
          return opts.getAllInputs!(queue);
        },
      }
      : {}),
  };
  const processor = new BatchProcessor<DefaultBatcherInput>({
    emitStateTransition: async () => {},
    storage,
    submissionCallbacks: callbacks,
    waitForEffectStreamProcessed: async () => null,
    getCallbackKey: key,
    getRetryPolicy: () => ({ maxRetries: opts.maxRetries, retryDelayMs: 0 }),
    setTargetCooldown: () => {},
    isEventSystemEnabled: () => false,
  });
  const refusal = new Error(REFUSAL);
  const run = async (extra: Partial<DefaultBatcherInput> = {}) => {
    const i = input(extra);
    queue.inputs.push(i);
    queue.added.push(i);
    callbacks.set(key(i), {
      resolve: () => {},
      reject: (e) => rejected.push(e),
      timeoutId: setTimeout(() => {}, 0),
    });
    await expect(
      processor.processBatchForTarget(new FailingAdapter(refusal), TARGET, [i]),
    ).rejects.toBe(refusal); // the submit error is still rethrown
  };
  return { run, rejected, callbacks, queue, reads: () => reads, refusal };
}

describe("BatchProcessor — rejecting the callers of dropped inputs", () => {
  test("the storage dropped the input: its caller is rejected with the submit error", async () => {
    const p = processorWith({ maxRetries: 1, getAllInputs: async (q) => [...q.inputs] });
    await p.run();
    expect(p.rejected).toEqual([p.refusal]);
    expect(p.callbacks.size).toBe(0);
    expect(p.queue.inputs).toHaveLength(0);
  });

  test("storage hook without getAllInputs (historical shape): the caller is not rejected", async () => {
    const p = processorWith({ maxRetries: 1 });
    await p.run();
    expect(p.rejected).toHaveLength(0);
    expect(p.callbacks.size).toBe(1);
  });

  test("incrementRetryCount fails (storage state unknown): the caller is not rejected", async () => {
    const p = processorWith({
      maxRetries: 1,
      incrementFails: true,
      getAllInputs: async () => [],
    });
    await p.run();
    expect(p.rejected).toHaveLength(0);
    expect(p.callbacks.size).toBe(1);
  });

  test("on its last retry but still queued (the storage kept it): the caller is not rejected", async () => {
    const p = processorWith({
      maxRetries: 1,
      // A storage that did not drop it: the input is still reported queued.
      getAllInputs: async (q) => [...q.added],
    });
    await p.run();
    expect(p.reads()).toBe(1);
    expect(p.rejected).toHaveLength(0);
    expect(p.callbacks.size).toBe(1);
  });

  test("retries left: the queue is not even read", async () => {
    const p = processorWith({ maxRetries: 3, getAllInputs: async (q) => [...q.inputs] });
    await p.run();
    expect(p.reads()).toBe(0);
    expect(p.rejected).toHaveLength(0);
    expect(p.queue.inputs[0].retryCount).toBe(1);
  });

  test("the queue read fails: the caller is not rejected and the submit error is still rethrown", async () => {
    const p = processorWith({
      maxRetries: 1,
      getAllInputs: async () => {
        throw new Error("read failed");
      },
    });
    await p.run();
    expect(p.rejected).toHaveLength(0);
    expect(p.callbacks.size).toBe(1);
  });
});

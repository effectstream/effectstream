/**
 * The post-receipt EffectStream wait in `BatchProcessor` only emits
 * `batch:effectstream-processed` / `error` state transitions. With the
 * batcher's event system off it is skipped, so an embedded batcher opens no
 * event-bus (MQTT) subscription after a receipt. With the event system on, or
 * when the hook is absent (historical `BatchProcessor` shape), it still runs.
 *
 * No broker is needed: `EventManager.Instance.subscribe` / `unsubscribe` are
 * replaced by recording stubs for the duration of each test.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BuiltinEvents, EventManager } from "@effectstream/event-client";

import type {
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import { BatchProcessor } from "../core/batch-processor.ts";
import { Batcher } from "../core/batcher.ts";
import type { BatcherStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const TARGET = "stubChain";
const SYNC_PROTOCOL = "stubSync";
const RECEIPT_BLOCK = 42n;
const ROLLUP = 7;

// ── event-bus stubs ──────────────────────────────────────────────────────────

type SubscribeCall = { topic: unknown; filter: unknown };
let subscribeCalls: SubscribeCall[] = [];
let unsubscribeCalls: symbol[] = [];
const originalSubscribe = EventManager.Instance.subscribe;
const originalUnsubscribe = EventManager.Instance.unsubscribe;

beforeEach(() => {
  subscribeCalls = [];
  unsubscribeCalls = [];
  // deno-lint-ignore no-explicit-any
  (EventManager.Instance as any).subscribe = async (
    // deno-lint-ignore no-explicit-any
    event: { topic: unknown; filter: any },
    // deno-lint-ignore no-explicit-any
    callback: (e: any) => void,
  ) => {
    subscribeCalls.push({ topic: event.topic, filter: event.filter });
    // The sync node reports the receipt's block right away.
    queueMicrotask(() =>
      callback({ block: Number(RECEIPT_BLOCK), rollup: ROLLUP })
    );
    return Symbol("subscription");
  };
  // deno-lint-ignore no-explicit-any
  (EventManager.Instance as any).unsubscribe = async (s: symbol) => {
    unsubscribeCalls.push(s);
  };
});

afterEach(() => {
  EventManager.Instance.subscribe = originalSubscribe;
  EventManager.Instance.unsubscribe = originalUnsubscribe;
});

/** Let fire-and-forget work (the post-receipt wait) run to completion. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/**
 * `batchInput` validates, stores the input and then registers its receipt
 * callback, all asynchronously: wait for the callback before forcing a batch.
 */
async function queued(batcher: Batcher<DefaultBatcherInput>, n = 1) {
  // deno-lint-ignore no-explicit-any
  const callbacks = (batcher as any).submissionCallbacks as Map<string, unknown>;
  const deadline = Date.now() + 2_000;
  while (callbacks.size < n) {
    if (Date.now() > deadline) throw new Error("input was never queued");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

// ── a minimal adapter and storage ────────────────────────────────────────────

class StubAdapter implements BlockchainAdapter<{ n: number }> {
  submitted = 0;
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
    return `0xstub${this.submitted}`;
  }
  async waitForTransactionReceipt(
    hash: string,
  ): Promise<BlockchainTransactionReceipt> {
    return { hash, blockNumber: RECEIPT_BLOCK, status: 1 };
  }
  getAccountAddress(): string {
    return "stub-account";
  }
  getChainName(): string {
    return "stub";
  }
  getSyncProtocolName(): string {
    return SYNC_PROTOCOL;
  }
  isReady(): boolean {
    return true;
  }
  async getBlockNumber(): Promise<bigint> {
    return RECEIPT_BLOCK;
  }
  verifySignature(): boolean {
    return true;
  }
}

class MemoryStorage implements BatcherStorage<DefaultBatcherInput> {
  inputs: DefaultBatcherInput[] = [];
  async init(): Promise<void> {}
  async addInput(input: DefaultBatcherInput): Promise<void> {
    this.inputs.push(input);
  }
  async getAllInputs(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async removeProcessedInputs(processed: DefaultBatcherInput[]): Promise<void> {
    this.inputs = this.inputs.filter((i) => !processed.includes(i));
  }
  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    return { count: this.inputs.length, size: 0 };
  }
  async getInputsByTarget(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async incrementRetryCount(): Promise<void> {}
  async clearAllInputs(): Promise<void> {
    this.inputs = [];
  }
}

let counter = 0;
function input(): DefaultBatcherInput {
  counter++;
  return {
    addressType: 0,
    address: "0x0000000000000000000000000000000000000001",
    input: `payload-${counter}`,
    signature: "0xsig",
    timestamp: String(Date.now() + counter),
    target: TARGET,
  };
}

// ── through the real Batcher wiring (embedded: no HTTP server) ───────────────

function embeddedBatcher(enableEventSystem: boolean | undefined) {
  const storage = new MemoryStorage();
  const adapter = new StubAdapter();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    enableHttpServer: false,
    ...(enableEventSystem === undefined ? {} : { enableEventSystem }),
    adapters: { [TARGET]: adapter },
    defaultTarget: TARGET,
  }, storage);
  // Count the batcher's own EffectStream waits (both callers go through it).
  let waits = 0;
  // deno-lint-ignore no-explicit-any
  const b = batcher as any;
  const original = b.waitForEffectStreamProcessed.bind(batcher);
  b.waitForEffectStreamProcessed = (...args: unknown[]) => {
    waits++;
    return original(...args);
  };
  return { batcher, storage, adapter, waits: () => waits };
}

describe("Batcher (embedded) — post-receipt EffectStream wait", () => {
  test("event system off: a receipt opens no event-bus subscription", async () => {
    const { batcher, storage, adapter, waits } = embeddedBatcher(false);
    const pending = batcher.batchInput(input(), "wait-receipt");
    await queued(batcher);
    await batcher.forceProcessBatches();
    const receipt = await pending;
    await settle();

    expect(adapter.submitted).toBe(1);
    expect(receipt?.status).toBe(1);
    expect(receipt?.blockNumber).toBe(RECEIPT_BLOCK);
    expect(storage.inputs).toHaveLength(0);
    expect(waits()).toBe(0);
    expect(subscribeCalls).toHaveLength(0);
  });

  test("event system left at its default (off): same, no subscription", async () => {
    const { batcher, adapter, waits } = embeddedBatcher(undefined);
    const pending = batcher.batchInput(input(), "wait-receipt");
    await queued(batcher);
    await batcher.forceProcessBatches();
    await pending;
    await settle();

    expect(adapter.submitted).toBe(1);
    expect(waits()).toBe(0);
    expect(subscribeCalls).toHaveLength(0);
  });

  test("event system on: the wait runs, subscribes to SyncChains and emits batch:effectstream-processed", async () => {
    const { batcher, adapter, waits } = embeddedBatcher(true);
    const processed: Array<{ target: string; latestBlock: number; rollup: number }> = [];
    batcher.addStateTransition("batch:effectstream-processed", (payload) => {
      processed.push(payload);
    });
    const pending = batcher.batchInput(input(), "wait-receipt");
    await queued(batcher);
    await batcher.forceProcessBatches();
    await pending;
    await settle();

    expect(adapter.submitted).toBe(1);
    expect(waits()).toBe(1);
    expect(subscribeCalls).toEqual([{
      topic: BuiltinEvents.SyncChains,
      filter: { chain: SYNC_PROTOCOL, block: undefined },
    }]);
    expect(unsubscribeCalls).toHaveLength(1);
    expect(processed).toHaveLength(1);
    expect(processed[0]).toMatchObject({
      target: TARGET,
      latestBlock: Number(RECEIPT_BLOCK),
      rollup: ROLLUP,
    });
  });

  test("event system off: 'wait-effectstream-processed' still waits on its own path", async () => {
    const { batcher, adapter, waits } = embeddedBatcher(false);
    const pending = batcher.batchInput(input(), "wait-effectstream-processed");
    await queued(batcher);
    await batcher.forceProcessBatches();
    const receipt = await pending;
    await settle();

    expect(adapter.submitted).toBe(1);
    expect(receipt?.rollup).toBe(ROLLUP);
    // Exactly one wait/subscription: the caller's, not the processor's.
    expect(waits()).toBe(1);
    expect(subscribeCalls).toHaveLength(1);
  });
});

// ── BatchProcessor's hook contract ───────────────────────────────────────────

function processorWith(isEventSystemEnabled?: () => boolean) {
  const waitCalls: Array<{ target: string; receipt: BlockchainTransactionReceipt; timeout: number }> = [];
  const resolved: BlockchainTransactionReceipt[] = [];
  const callbacks = new Map<string, {
    resolve: (r: BlockchainTransactionReceipt) => void;
    reject: (e: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>();
  const hooks = {
    emitStateTransition: async () => {},
    storage: {
      removeProcessedInputs: async () => {},
      incrementRetryCount: async () => {},
    },
    submissionCallbacks: callbacks,
    waitForEffectStreamProcessed: async (
      target: string,
      receipt: BlockchainTransactionReceipt,
      timeout: number,
    ) => {
      waitCalls.push({ target, receipt, timeout });
      return { latestBlock: Number(receipt.blockNumber), rollup: ROLLUP };
    },
    getCallbackKey: (i: DefaultBatcherInput) => i.timestamp + i.input,
    getRetryPolicy: () => ({ maxRetries: 3, retryDelayMs: 10 }),
    setTargetCooldown: () => {},
    ...(isEventSystemEnabled ? { isEventSystemEnabled } : {}),
  };
  const processor = new BatchProcessor<DefaultBatcherInput>(hooks);
  const run = async () => {
    const i = input();
    callbacks.set(i.timestamp + i.input, {
      resolve: (r) => resolved.push(r),
      reject: (e) => {
        throw e;
      },
      timeoutId: setTimeout(() => {}, 0),
    });
    await processor.processBatchForTarget(new StubAdapter(), TARGET, [i], 1_234);
    await settle();
  };
  return { run, waitCalls, resolved };
}

describe("BatchProcessor — isEventSystemEnabled hook", () => {
  test("returns false: the receipt resolves, no EffectStream wait", async () => {
    let asked = 0;
    const p = processorWith(() => {
      asked++;
      return false;
    });
    await p.run();
    expect(p.resolved).toHaveLength(1);
    expect(asked).toBe(1);
    expect(p.waitCalls).toHaveLength(0);
  });

  test("returns true: the wait runs once with the receipt and timeout", async () => {
    const p = processorWith(() => true);
    await p.run();
    expect(p.resolved).toHaveLength(1);
    expect(p.waitCalls).toHaveLength(1);
    expect(p.waitCalls[0].target).toBe(TARGET);
    expect(p.waitCalls[0].receipt.blockNumber).toBe(RECEIPT_BLOCK);
    expect(p.waitCalls[0].timeout).toBe(1_234);
  });

  test("hook absent (historical shape): the wait still runs", async () => {
    const p = processorWith(undefined);
    await p.run();
    expect(p.resolved).toHaveLength(1);
    expect(p.waitCalls).toHaveLength(1);
  });
});

import { expect, test } from "bun:test";
import { run, sleep } from "effection";
import { readFileSync } from "node:fs";
import type { BlockchainAdapter } from "../adapters/adapter.ts";
import { Batcher } from "./batcher.ts";
import { attachDefaultConsoleListeners } from "./batcher-events.ts";
import type { BatcherStorage } from "./storage.ts";
import type { DefaultBatcherInput } from "./types.ts";

const TARGET = "events-test";

function makeInput(address = "event-wallet"): DefaultBatcherInput {
  return {
    addressType: 0 as DefaultBatcherInput["addressType"],
    address,
    input: "event-payload",
    signature: "event-signature",
    timestamp: "2026-08-20T00:00:00.000Z",
    target: TARGET,
  };
}

class MemoryStorage implements BatcherStorage<DefaultBatcherInput> {
  constructor(readonly inputs: DefaultBatcherInput[] = []) {}
  async init(): Promise<void> {}
  async addInput(input: DefaultBatcherInput): Promise<void> {
    this.inputs.push(input);
  }
  async getAllInputs(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async removeProcessedInputs(inputs: DefaultBatcherInput[]): Promise<void> {
    for (const input of inputs) {
      const index = this.inputs.indexOf(input);
      if (index >= 0) this.inputs.splice(index, 1);
    }
  }
  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    return { count: this.inputs.length, size: 0 };
  }
  async getInputsByTarget(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async incrementRetryCount(): Promise<DefaultBatcherInput[]> {
    return [];
  }
  async clearAllInputs(): Promise<void> {
    this.inputs.length = 0;
  }
}

function makeAdapter(concurrent = false): BlockchainAdapter<any> {
  return {
    verifySignature: () => true,
    getChainName: () => "events-test",
    getAccountAddress: () => "batcher",
    isReady: () => true,
    getBlockNumber: async () => 1n,
    buildBatchData: (inputs: DefaultBatcherInput[]) => ({
      selectedInputs: inputs,
      data: { selectedInputs: inputs },
    }),
    estimateBatchFee: () => 1n,
    submitBatch: async () => "0xevents",
    waitForTransactionReceipt: async () => ({
      hash: "0xevents",
      blockNumber: 1n,
      status: 1,
    }),
    ...(concurrent
      ? {
        hasAvailableCapacity: () => true,
        isFullyIdle: () => true,
      }
      : {}),
  };
}

function listenForAsyncEvents(
  batcher: Batcher<DefaultBatcherInput>,
  seen: string[],
): void {
  batcher.addStateTransition("startup", () => {
    seen.push("startup");
  });
  batcher.addStateTransition("http:start", () => {
    seen.push("http:start");
  });
  batcher.addStateTransition("http:stop", () => {
    seen.push("http:stop");
  });
  batcher.addStateTransition(
    "poll:targets-ready",
    () => {
      seen.push("poll:targets-ready");
    },
  );
  batcher.addStateTransition(
    "batch:process:start",
    () => {
      seen.push("batch:process:start");
    },
  );
  batcher.addStateTransition("error", ({ error }) => {
    seen.push(`error:${error instanceof Error ? error.message : String(error)}`);
  });
}

test("ordinary async lifecycle sites deliver all seven emissions", async () => {
  const seen: string[] = [];
  const storage = new MemoryStorage([makeInput()]);
  const port = Number(process.env.BATCHER_TEST_PORT ?? "18372");
  const batcher = new Batcher({
    adapters: { [TARGET]: makeAdapter() },
    defaultTarget: TARGET,
    enableHttpServer: true,
    enableEventSystem: true,
    pollingIntervalMs: 1_000_000,
    port,
  }, storage);
  listenForAsyncEvents(batcher, seen);

  await batcher.init({ startPolling: false });

  const internals = batcher as any;
  const processTargets = internals.processBatchesForTargets.bind(batcher);
  internals.isTargetReadyForBatching = async () => true;
  internals.processBatchesForTargets = async () => {};
  await batcher.pollBatcher();
  internals.processBatchesForTargets = processTargets;

  internals.batchProcessor.processBatchForTarget = async () => {
    throw new Error("sequential-site");
  };
  await batcher.processBatchesForTargets([TARGET]);
  await batcher.stopHttpServer();

  const concurrent = new Batcher({
    adapters: { [TARGET]: makeAdapter(true) },
    defaultTarget: TARGET,
    enableHttpServer: false,
    enableEventSystem: true,
    pollingIntervalMs: 1_000_000,
  }, new MemoryStorage([makeInput("concurrent-wallet")]));
  concurrent.addStateTransition("error", ({ error }) => {
    seen.push(`error:${error instanceof Error ? error.message : String(error)}`);
  });
  (concurrent as any).batchProcessor.processBatchForTarget = async () => {
    throw new Error("concurrent-site");
  };
  await concurrent.processBatchesForTargets([TARGET]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(seen).toEqual([
    "http:start",
    "startup",
    "poll:targets-ready",
    "batch:process:start",
    "error:sequential-site",
    "http:stop",
    "error:concurrent-site",
  ]);
});

test("the Effection generator emitter still invokes its listener", async () => {
  const batcher = new Batcher({
    adapters: { [TARGET]: makeAdapter() },
    defaultTarget: TARGET,
    enableHttpServer: false,
    enableEventSystem: true,
    pollingIntervalMs: 1_000_000,
  }, new MemoryStorage());
  let calls = 0;
  batcher.addStateTransition("startup", () => {
    calls += 1;
  });

  await run(function* () {
    yield* batcher.emitStateTransition("startup", {
      publicConfig: batcher.getPublicConfig(),
      time: Date.now(),
    });
    yield* sleep(10);
  });

  expect(calls).toBe(1);
});

test("ordinary async code never awaits the Effection generator emitter", () => {
  const source = readFileSync(new URL("./batcher.ts", import.meta.url), "utf8");
  expect(source.match(/await this\.emitStateTransition\(/g) ?? []).toHaveLength(0);
  expect(source.match(/yield\* (?:this|batcher)\.emitStateTransition\(/g) ?? [])
    .toHaveLength(5);
});

test("disabling the event system suppresses async and Effection listeners", async () => {
  const batcher = new Batcher({
    adapters: { [TARGET]: makeAdapter() },
    defaultTarget: TARGET,
    enableHttpServer: false,
    enableEventSystem: false,
    pollingIntervalMs: 1_000_000,
  }, new MemoryStorage());
  let calls = 0;
  batcher.addStateTransition("startup", () => {
    calls += 1;
  });
  const payload = {
    publicConfig: batcher.getPublicConfig(),
    time: Date.now(),
  };

  await (batcher as any).emitStateTransitionAsync("startup", payload);
  await run(function* () {
    yield* batcher.emitStateTransition("startup", payload);
    yield* sleep(10);
  });

  expect(calls).toBe(0);
});

test("the default startup listener prints its banner on async init", async () => {
  const batcher = new Batcher({
    adapters: { [TARGET]: makeAdapter() },
    defaultTarget: TARGET,
    enableHttpServer: false,
    enableEventSystem: true,
    pollingIntervalMs: 1_000_000,
  }, new MemoryStorage());
  attachDefaultConsoleListeners(batcher);
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    await batcher.init({ startPolling: false });
  } finally {
    console.log = originalLog;
  }

  expect(logs.filter((line) => line.includes("Batcher started"))).toHaveLength(1);
});

test("throwing async listeners do not break init, poll, or batch work", async () => {
  const storage = new MemoryStorage([makeInput("throwing-listener")]);
  const batcher = new Batcher({
    adapters: { [TARGET]: makeAdapter() },
    defaultTarget: TARGET,
    enableHttpServer: false,
    enableEventSystem: true,
    pollingIntervalMs: 1_000_000,
  }, storage);
  const reportedPhases: string[] = [];
  batcher.addStateTransition("startup", () => {
    throw new Error("startup-listener");
  });
  batcher.addStateTransition("poll:targets-ready", () => {
    throw new Error("poll-listener");
  });
  batcher.addStateTransition("batch:process:start", () => {
    throw new Error("batch-listener");
  });
  batcher.addStateTransition("error", ({ phase }) => {
    reportedPhases.push(phase);
  });

  await batcher.init({ startPolling: false });
  const internals = batcher as any;
  const processTargets = internals.processBatchesForTargets.bind(batcher);
  internals.isTargetReadyForBatching = async () => true;
  internals.processBatchesForTargets = async () => {};
  await batcher.pollBatcher();
  internals.processBatchesForTargets = processTargets;

  let batchesProcessed = 0;
  internals.batchProcessor.processBatchForTarget = async () => {
    batchesProcessed += 1;
  };
  await batcher.processBatchesForTargets([TARGET]);

  expect(batchesProcessed).toBe(1);
  expect(reportedPhases).toEqual([
    "event-listener:startup",
    "event-listener:poll:targets-ready",
    "event-listener:batch:process:start",
  ]);
});

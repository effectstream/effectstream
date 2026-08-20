import { expect, test } from "bun:test";
import { run, sleep } from "effection";
import type { BlockchainAdapter } from "../adapters/adapter.ts";
import { Batcher } from "./batcher.ts";
import type { BatcherStorage } from "./storage.ts";
import type { DefaultBatcherInput } from "./types.ts";

const TARGET = "events-test";
const redProofTest = process.env.BATCHER_RED_PROOF === "1" ? test : test.skip;

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
  async incrementRetryCount(): Promise<void> {}
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
  batcher.addStateTransition("startup", () => seen.push("startup"));
  batcher.addStateTransition("http:start", () => seen.push("http:start"));
  batcher.addStateTransition("http:stop", () => seen.push("http:stop"));
  batcher.addStateTransition(
    "poll:targets-ready",
    () => seen.push("poll:targets-ready"),
  );
  batcher.addStateTransition(
    "batch:process:start",
    () => seen.push("batch:process:start"),
  );
  batcher.addStateTransition("error", ({ error }) => {
    seen.push(`error:${error instanceof Error ? error.message : String(error)}`);
  });
}

redProofTest("ordinary async lifecycle sites deliver all seven emissions", async () => {
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

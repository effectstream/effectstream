// A permanent rejection decided AFTER intake, asserted at the wire.
//
// Some verdicts cannot be reached while the caller is still on the request:
// full transaction validation is too expensive to run at intake, so an input
// is queued first and judged when the batch is built. When that later verdict
// is "this can never succeed", the waiting caller must learn why — with the
// adapter's own status and code — instead of hanging until timeout or being
// handed someone else's receipt.
//
// The processor-level unit tests cover the bookkeeping. This one covers the
// seam they cannot see: that the rejection survives the callback, the batcher,
// and serialisation, and arrives as a typed 4xx.

import { expect, test } from "bun:test";
import { Batcher } from "../core/batcher.ts";
import type { BatcherStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { startBatcherHttpServer } from "./batcher-server.ts";

// Fresh: the admission window (spec FR-011) refuses a signed timestamp older
// than `maxInputAgeMs`, so a fixture pinned to a fixed instant would fail for
// a reason it is not about. Read once, so ids stay stable within a run.
const FRESH = String(Date.now());

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
  // Returns the rows it dropped (none — this stub never drops). The
  // interface changed when storage became responsible for REPORTING
  // dropped inputs, which is what lets the processor reject a waiting
  // caller instead of letting it hang to its own timeout.
  async incrementRetryCount(
    inputs: DefaultBatcherInput[],
  ): Promise<DefaultBatcherInput[]> {
    for (const input of inputs) {
      input.retryCount = (input.retryCount ?? 0) + 1;
    }
    return [];
  }
  async clearAllInputs(): Promise<void> {
    this.inputs.length = 0;
  }
}

function lateRejectingAdapter(storage: MemoryStorage) {
  return {
    // This test is about what happens after authentication; a 401 here would
    // be a pass for the wrong reason.
    verifySignature: () => true,
    getChainName: () => "test",
    getAccountAddress: () => "batcher",
    isReady: () => true,
    getBlockNumber: async () => 0n,
    buildBatchData: (inputs: DefaultBatcherInput[]) =>
      inputs.length === 0
        ? null
        : { selectedInputs: inputs, data: { selectedInputs: [...inputs] } },
    estimateBatchFee: () => 0n,
    // The verdict only reachable once the batch is being built.
    submitBatch: async () => ({
      permanentRejected: storage.inputs.map((input) => ({
        input,
        error: "transaction is not well formed",
        errorCode: "NOT_WELL_FORMED",
        statusCode: 422,
      })),
    }),
    waitForTransactionReceipt: async () => ({
      hash: "hash",
      blockNumber: 0n,
      status: 1,
    }),
  };
}

test("an input rejected after intake reaches its caller as a typed 4xx", async () => {
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1_000_000, // never polls on its own; this test drives it
    adapters: { test: lateRejectingAdapter(storage) },
    defaultTarget: "test",
  }, storage);
  await batcher.init({ startPolling: false });
  const server = await startBatcherHttpServer(batcher, 0);

  try {
    // Do NOT await yet: with wait-receipt the request stays open until the
    // batch is processed, which is what this test is about.
    const pending = server.inject({
      method: "POST",
      url: "/send-input",
      payload: {
        confirmationLevel: "wait-receipt",
        data: {
          address: "wallet",
          addressType: 0,
          input: "payload",
          signature: "sig",
          timestamp: FRESH,
          target: "test",
        },
      },
    });

    // Let the request reach storage before the batch is built.
    while (storage.inputs.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    await batcher.forceProcessBatches("test");

    const res = await pending;
    expect(res.statusCode).toBe(422);
    const payload = res.json();
    expect(payload.errorCode).toBe("NOT_WELL_FORMED");
    expect(payload.message).toContain("not well formed");

    // The input is gone: a permanent rejection must not leave a row behind to
    // be re-picked, re-validated and re-rejected forever.
    expect(storage.inputs.length).toBe(0);
  } finally {
    await server.close();
  }
}, 20_000);

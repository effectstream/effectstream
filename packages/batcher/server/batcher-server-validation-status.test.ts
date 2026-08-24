// Structured validation errors, asserted at the WIRE, not at batchInput().
//
// An adapter that cannot COMPLETE a check — its own dependency is unavailable —
// must be able to say so. Reporting that as 400 tells the caller their
// transaction is malformed, which is both wrong and unactionable: the only
// useful response is "retry later". A companion unit test drives batchInput()
// directly, but that cannot see the status line, the response body, or whether
// the fields survive serialisation, which is where this one earns its keep.

import { expect, test } from "bun:test";
import { Batcher } from "../core/batcher.ts";
import type { BatcherStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import type { ValidationResult } from "../adapters/adapter.ts";
import { startBatcherHttpServer } from "./batcher-server.ts";

class MemoryStorage implements BatcherStorage<DefaultBatcherInput> {
  readonly inputs: DefaultBatcherInput[] = [];
  async init(): Promise<void> {}
  async addInput(input: DefaultBatcherInput): Promise<void> {
    this.inputs.push(input);
  }
  async getAllInputs(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async removeProcessedInputs(): Promise<void> {}
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

const adapterWith = (validationResult: ValidationResult) => ({
  // No signature check: this test is about what happens AFTER authentication,
  // and a 401 here would be a pass for the wrong reason.
  verifySignature: () => true,
  validateInput: () => validationResult,
  getChainName: () => "test",
  getAccountAddress: () => "batcher",
  isReady: () => true,
  getBlockNumber: async () => 0n,
  buildBatchData: () => null,
  estimateBatchFee: () => 0n,
  submitBatch: async () => "hash",
  waitForTransactionReceipt: async () => ({
    hash: "hash",
    blockNumber: 0n,
    status: 1,
  }),
});

const body = () => ({
  confirmationLevel: "no-wait",
  data: {
    address: "wallet",
    addressType: 0,
    input: "payload",
    signature: "sig",
    timestamp: "1",
    target: "test",
  },
});

async function post(validationResult: ValidationResult) {
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: { test: adapterWith(validationResult) },
    defaultTarget: "test",
  }, storage);
  const server = await startBatcherHttpServer(batcher, 0);
  try {
    const res = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: body(),
    });
    return { res, queued: storage.inputs.length };
  } finally {
    await server.close();
  }
}

test("a check that could not COMPLETE returns 503, not 400", async () => {
  const { res, queued } = await post({
    valid: false,
    error: "ledger parameters unavailable",
    errorCode: "PARAMS_UNAVAILABLE",
    statusCode: 503,
    retryable: true,
  });

  expect(res.statusCode).toBe(503);
  const payload = res.json();
  expect(payload.errorCode).toBe("PARAMS_UNAVAILABLE");
  expect(payload.retryable).toBe(true);
  expect(payload.message).toContain("ledger parameters unavailable");
  // Nothing we cannot validate may be accepted onto the queue — otherwise the
  // failure is merely deferred past the point of no return.
  expect(queued).toBe(0);
});

test("a judged-and-rejected input still returns 400", async () => {
  const { res, queued } = await post({
    valid: false,
    error: "transaction is not well-formed",
    errorCode: "NOT_WELL_FORMED",
  });

  expect(res.statusCode).toBe(400);
  expect(res.json().errorCode).toBe("NOT_WELL_FORMED");
  expect(queued).toBe(0);
});

test("a plain rejection is unchanged — no code, no retryable, still 400", async () => {
  // Back-compat: adapters that never learned about the new fields must behave
  // exactly as before.
  const { res } = await post({ valid: false, error: "bad input" });

  expect(res.statusCode).toBe(400);
  const payload = res.json();
  expect(payload.message).toContain("bad input");
  expect(payload.errorCode).toBeUndefined();
  expect(payload.retryable).toBeUndefined();
});

test("a valid input is still accepted", async () => {
  const { res, queued } = await post({ valid: true });
  expect(res.statusCode).toBe(200);
  expect(queued).toBe(1);
});

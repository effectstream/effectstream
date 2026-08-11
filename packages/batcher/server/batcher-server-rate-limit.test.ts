import { expect, test } from "bun:test";
import { Batcher } from "../core/batcher.ts";
import type { BatcherStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
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

const adapter = {
  verifySignature: (input: DefaultBatcherInput) =>
    input.signature === "valid-signature",
  getRateLimitKeyStrategy: () => "ip-and-address" as const,
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
};

function requestBody(address: string, signature: string) {
  return {
    confirmationLevel: "no-wait",
    data: {
      address,
      addressType: 0,
      input: "payload",
      signature,
      timestamp: "1",
      target: "test",
    },
  };
}

test("HTTP rate limiting starts after authentication and preserves 429 metadata", async () => {
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: { test: adapter },
    defaultTarget: "test",
    rateLimit: {
      maxRequests: 1,
      globalMaxRequests: 1,
      windowMs: 60_000,
    },
  }, storage);
  const server = await startBatcherHttpServer(batcher, 0);

  try {
    const forged = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: requestBody("victim-wallet", "forged-signature"),
    });
    expect(forged.statusCode).toBe(401);

    const genuine = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: requestBody("victim-wallet", "valid-signature"),
    });
    expect(genuine.statusCode).toBe(200);
    expect(storage.inputs).toHaveLength(1);

    const exhausted = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: requestBody("another-wallet", "valid-signature"),
    });
    expect(exhausted.statusCode).toBe(429);
    expect(Number(exhausted.headers["retry-after"])).toBeGreaterThan(0);
    expect(exhausted.json()).toMatchObject({
      success: false,
      error: "Rate limit exceeded",
    });
    expect(storage.inputs).toHaveLength(1);
  } finally {
    await server.close();
  }
});

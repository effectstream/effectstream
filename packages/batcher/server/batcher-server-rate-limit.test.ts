import { expect, test } from "bun:test";
import { Batcher } from "../core/batcher.ts";
import type { BatcherStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import {
  InMemoryRateLimitStore,
  type RateLimitBucket,
  type RateLimitCheckResult,
  type RateLimitStore,
} from "../core/rate-limiter.ts";
import { startBatcherHttpServer } from "./batcher-server.ts";

// Fresh: the admission window (spec FR-011) refuses a signed timestamp older
// than `maxInputAgeMs`, so a fixture pinned to a fixed instant would fail for
// a reason it is not about. Read once, so ids stay stable within a run.
const NOW = Date.now();
const FRESH = String(NOW);
const FRESH_ALT = String(NOW - 1_000);

class RecordingStore implements RateLimitStore {
  readonly calls: RateLimitBucket[][] = [];
  readonly inner = new InMemoryRateLimitStore();

  async consume(
    buckets: readonly RateLimitBucket[],
    nowMs: number,
    windowMs: number,
  ): Promise<RateLimitCheckResult> {
    this.calls.push(buckets.map((bucket) => ({ ...bucket })));
    return await this.inner.consume(buckets, nowMs, windowMs);
  }

  async cleanup(nowMs: number, windowMs: number): Promise<void> {
    await this.inner.cleanup(nowMs, windowMs);
  }
}

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
  // Returns the rows it dropped (none — this stub never drops). The
  // interface changed when storage became responsible for REPORTING
  // dropped inputs, which is what lets the processor reject a waiting
  // caller instead of letting it hang to its own timeout.
  async incrementRetryCount(): Promise<DefaultBatcherInput[]> {
    return [];
  }
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

function requestBody(
  address: string,
  signature: string,
  overrides: Partial<DefaultBatcherInput> = {},
) {
  return {
    confirmationLevel: "no-wait",
    data: {
      address,
      addressType: 0,
      input: "payload",
      signature,
      timestamp: FRESH,
      target: "test",
      ...overrides,
    },
  };
}

test("HTTP rate limiting uses disjoint pre-auth and authenticated bucket sets", async () => {
  const store = new RecordingStore();
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: { test: adapter },
    defaultTarget: "test",
    rateLimit: {
      maxRequests: 1,
      globalMaxRequests: 2,
      preAuthMaxRequests: 10,
      windowMs: 60_000,
      store,
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
    expect(store.calls).toEqual([[
      { key: "pre-auth:ip:127.0.0.1", maxRequests: 10 },
    ]]);

    const genuine = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: requestBody("victim-wallet", "valid-signature"),
    });
    expect(genuine.statusCode).toBe(200);
    expect(storage.inputs).toHaveLength(1);
    expect(store.calls.slice(1)).toEqual([
      [{ key: "pre-auth:ip:127.0.0.1", maxRequests: 10 }],
      [
        { key: "target:test:global", maxRequests: 2 },
        { key: "target:test:ip:127.0.0.1", maxRequests: 2 },
        { key: "target:test:addr:victim-wallet", maxRequests: 1 },
      ],
    ]);
  } finally {
    await server.close();
  }
});

test("untrusted body fields cannot mint pre-auth buckets or spend identity quotas", async () => {
  const store = new RecordingStore();
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: { test: adapter },
    defaultTarget: "test",
    rateLimit: {
      maxRequests: 10,
      globalMaxRequests: 10,
      preAuthMaxRequests: 4,
      windowMs: 60_000,
      store,
    },
  }, storage);
  const server = await startBatcherHttpServer(batcher, 0);

  try {
    const attackerRequests = [
      requestBody("victim-a", "forged-a"),
      requestBody("victim-b", "forged-b", { input: "different-payload" }),
      requestBody("victim-c", "forged-c", { target: "invented-target" }),
      requestBody("victim-d", "forged-d", { timestamp: FRESH_ALT }),
    ];
    for (const payload of attackerRequests) {
      const forged = await server.inject({
        method: "POST",
        url: "/send-input",
        payload,
      });
      expect(forged.statusCode).not.toBe(429);
    }

    const exhausted = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: requestBody("victim-c", "forged-signature"),
    });
    expect(exhausted.statusCode).toBe(429);
    expect(Number(exhausted.headers["retry-after"])).toBeGreaterThan(0);
    expect(exhausted.json()).toMatchObject({
      success: false,
      error: "Rate limit exceeded",
    });
    expect(store.calls).toHaveLength(5);
    expect(store.calls.every((buckets) => buckets.length === 1)).toBe(true);
    expect(
      store.calls.every((buckets) =>
        buckets[0].key === "pre-auth:ip:127.0.0.1"
      ),
    ).toBe(true);
    expect(storage.inputs).toHaveLength(0);
  } finally {
    await server.close();
  }
});

test("authenticated target-global exhaustion preserves 429 metadata", async () => {
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: { test: adapter },
    defaultTarget: "test",
    rateLimit: {
      maxRequests: 1,
      globalMaxRequests: 1,
      preAuthMaxRequests: 10,
      windowMs: 60_000,
    },
  }, storage);
  const server = await startBatcherHttpServer(batcher, 0);

  try {
    const genuine = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: requestBody("victim-wallet", "valid-signature"),
    });
    expect(genuine.statusCode).toBe(200);

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

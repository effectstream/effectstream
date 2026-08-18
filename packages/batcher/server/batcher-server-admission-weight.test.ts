// Weighted admission, asserted at the wire.
//
// A request's cost is not knowable when it arrives: only after the adapter has
// deserialized the payload do we know how much verification work it will
// cause. So admission is charged in two phases — a flat unit at
// authentication, the remainder once the adapter reports a weight — and both
// land before anything is written to storage.
//
// The property that matters is not "a surcharge happens" but "an expensive
// input cannot reach the queue on the flat unit it paid on arrival".

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

/** Reports a fixed weight, and records when validation ran. */
function adapterWithWeight(weight: number | undefined, order: string[]) {
  return {
    verifySignature: () => true,
    validateInput: () => {
      order.push("validate");
      return weight === undefined
        ? { valid: true as const }
        : { valid: true as const, admissionWeight: weight };
    },
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
}

async function withServer(
  weight: number | undefined,
  maxRequests: number,
  run: (
    post: () => Promise<{ statusCode: number }>,
    storage: MemoryStorage,
    order: string[],
  ) => Promise<void>,
) {
  const order: string[] = [];
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1_000_000,
    adapters: { test: adapterWithWeight(weight, order) },
    defaultTarget: "test",
    rateLimit: { maxRequests, windowMs: 60_000 },
  }, storage);
  const originalAdd = storage.addInput.bind(storage);
  storage.addInput = async (input) => {
    order.push("store");
    return originalAdd(input);
  };
  const server = await startBatcherHttpServer(batcher, 0);
  try {
    const post = () =>
      server.inject({
        method: "POST",
        url: "/send-input",
        payload: {
          confirmationLevel: "no-wait",
          data: {
            address: "wallet",
            addressType: 0,
            input: "payload",
            signature: "sig",
            timestamp: FRESH,
            target: "test",
          },
        },
      }) as unknown as Promise<{ statusCode: number }>;
    await run(post, storage, order);
  } finally {
    await server.close();
  }
}

test("an input costs its weight, not one request", async () => {
  // Budget 10. At weight 4 the third request needs 12 of 10 and is refused —
  // where an unweighted limiter would have allowed ten.
  await withServer(4, 10, async (post, storage) => {
    expect((await post()).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(429);
    expect(storage.inputs.length).toBe(2);
  });
});

test("an unweighted adapter still costs exactly one request", async () => {
  // Back-compat: an adapter that never learned about weight is unchanged.
  await withServer(undefined, 3, async (post, storage) => {
    expect((await post()).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(429);
    expect(storage.inputs.length).toBe(3);
  });
});

test("a weight of 1 behaves exactly like no weight at all", async () => {
  await withServer(1, 3, async (post, storage) => {
    for (let i = 0; i < 3; i += 1) expect((await post()).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(429);
    expect(storage.inputs.length).toBe(3);
  });
});

test("a refused input never reaches storage", async () => {
  // The surcharge is charged BEFORE the storage write. Getting this ordering
  // wrong would queue the expensive input and only then complain.
  //
  // Weight 50 against a budget of 10 cannot fit at any future moment, so the
  // refusal is the permanent 413 rather than a 429 — the retryable/permanent
  // split is asserted separately below. What this test pins is the ordering:
  // validation ran, the write did not.
  await withServer(50, 10, async (post, storage, order) => {
    expect((await post()).statusCode).toBe(413);
    expect(storage.inputs.length).toBe(0);
    expect(order).toEqual(["validate"]);
    expect(order).not.toContain("store");
  });
});

test("the surcharge is charged after validation, before the write", async () => {
  await withServer(2, 100, async (post, storage, order) => {
    expect((await post()).statusCode).toBe(200);
    // Validation must precede the surcharge (it is what produces the weight),
    // and the write must follow both.
    expect(order).toEqual(["validate", "store"]);
    expect(storage.inputs.length).toBe(1);
  });
});

// --- Too expensive, ever --------------------------------------------------

test("a transaction heavier than the whole budget is refused permanently", async () => {
  // The limiter reports no retry time when a request cannot fit its bucket at
  // any point in the future. Returning 429 there would tell the caller to keep
  // retrying something that can never succeed.
  await withServer(500, 10, async (post, storage) => {
    const res = await post() as { statusCode: number; json: () => any };
    expect(res.statusCode).toBe(413);
    expect(res.json().errorCode).toBe("TRANSACTION_TOO_EXPENSIVE");
    expect(res.json().retryable).toBe(false);
    expect(storage.inputs.length).toBe(0);
  });
});

test("ordinary saturation is still a retryable 429", async () => {
  // The distinction that matters: this one WOULD succeed later, so it must not
  // be reported as permanently too expensive.
  await withServer(6, 10, async (post) => {
    expect((await post()).statusCode).toBe(200);
    const res = await post() as { statusCode: number; json: () => any };
    expect(res.statusCode).toBe(429);
    expect(res.json().errorCode).not.toBe("TRANSACTION_TOO_EXPENSIVE");
  });
});

test("an unmeasurable transaction is refused as too expensive", async () => {
  // admissionWeight returns UNMEASURABLE_ADMISSION_WEIGHT when the shape
  // cannot be read, which lands on exactly this path by arithmetic.
  const { UNMEASURABLE_ADMISSION_WEIGHT } = await import(
    "../adapters/shape-limits.ts"
  );
  await withServer(UNMEASURABLE_ADMISSION_WEIGHT, 1000, async (post, storage) => {
    const res = await post() as { statusCode: number; json: () => any };
    expect(res.statusCode).toBe(413);
    expect(res.json().errorCode).toBe("TRANSACTION_TOO_EXPENSIVE");
    expect(storage.inputs.length).toBe(0);
  });
});

import { expect, test } from "bun:test";
import { Batcher, InputValidationError } from "./batcher.ts";
import type { BatcherStorage } from "./storage.ts";
import type { DefaultBatcherInput } from "./types.ts";

// Fresh: the admission window (spec FR-011) refuses a signed timestamp older
// than `maxInputAgeMs`, so a fixture pinned to a fixed instant would fail for
// a reason it is not about. Read once, so ids stay stable within a run.
const FRESH = String(Date.now());

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

const input: DefaultBatcherInput = {
  address: "verified-wallet",
  addressType: 0,
  input: "payload",
  signature: "signature",
  timestamp: FRESH,
  target: "test",
};

function adapterWith(
  verifySignature: () => boolean,
  validateInput: () => { valid: boolean; error?: string } = () => ({
    valid: true,
  }),
) {
  return {
    verifySignature,
    validateInput,
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

test("invalid signatures never reach the authenticated quota hook", async () => {
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: { test: adapterWith(() => false) },
    defaultTarget: "test",
  }, storage);
  let hookCalls = 0;

  try {
    await batcher.batchInput(input, "no-wait", 1000, () => {
      hookCalls += 1;
    });
    throw new Error("expected batchInput to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(InputValidationError);
    expect((error as InputValidationError).statusCode).toBe(401);
  }

  expect(hookCalls).toBe(0);
  expect(storage.inputs).toHaveLength(0);
});

test("authenticated hook runs after signature verification and before semantic validation", async () => {
  const order: string[] = [];
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: {
      test: adapterWith(
        () => {
          order.push("signature");
          return true;
        },
        () => {
          order.push("semantic");
          return { valid: false, error: "semantic rejection" };
        },
      ),
    },
    defaultTarget: "test",
  }, storage);

  try {
    await batcher.batchInput(input, "no-wait", 1000, ({ target }) => {
      expect(target).toBe("test");
      order.push("quota");
    });
    throw new Error("expected batchInput to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(InputValidationError);
    expect((error as Error).message).toBe("semantic rejection");
  }

  expect(order).toEqual(["signature", "quota", "semantic"]);
  expect(storage.inputs).toHaveLength(0);
});

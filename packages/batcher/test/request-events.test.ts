// Per-request lifecycle events, end to end through a real Batcher.
//
// The processor's half is asserted against its collaborator in
// `core/batch-processor-status.test.ts`; this file exists because the wiring
// between them is where an event quietly stops arriving. In particular
// `Batcher.emitStateTransition` is a GENERATOR — `await`ing one returns the
// generator and runs no body — so an emission from the async accept path only
// works if it goes through the async emitter. That is a mistake that produces
// no error, no warning and no event, which is exactly the kind worth pinning.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import type { Batcher } from "../core/batcher.ts";
import { DatabaseStorage } from "../core/storage.ts";
import { computeRequestId } from "../core/request-id.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

// Fresh: the admission window (spec FR-011) refuses a signed timestamp older
// than `maxInputAgeMs`, so a fixture pinned to a fixed instant would fail for
// a reason it is not about. Read once, so ids stay stable within a run.
const FRESH = String(Date.now());

const TARGET = "product-a";

const input = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: FRESH,
  signature: "0xsignature-1",
  target: TARGET,
  ...overrides,
});

function stubAdapter() {
  return {
    verifySignature: () => true,
    validateInput: async () => ({ valid: true }),
    buildBatchData: (inputs: DefaultBatcherInput[]) => ({
      selectedInputs: inputs,
      data: { inputs },
    }),
    estimateBatchFee: () => "0",
    submitBatch: async () => "0xbatch",
    waitForTransactionReceipt: async () => ({
      hash: "0xbatch",
      blockNumber: 4242n,
      status: 1,
    }),
    getChainName: () => "stub",
    isReady: () => true,
  };
}

interface Ctx {
  batcher: Batcher<DefaultBatcherInput>;
  accepted: any[];
  terminal: any[];
}

async function withBatcher(fn: (ctx: Ctx) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-request-events-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const batcher = createNewBatcher(
    {
      pollingIntervalMs: 1_000_000,
      enableHttpServer: false,
      enableEventSystem: true,
    },
    storage as any,
  );
  batcher.addBlockchainAdapter(
    TARGET,
    stubAdapter() as unknown as Parameters<
      Batcher<DefaultBatcherInput>["addBlockchainAdapter"]
    >[1],
    { criteriaType: "size", maxBatchSize: 1 },
  );
  const accepted: any[] = [];
  const terminal: any[] = [];
  batcher.addStateTransition(
    "request:accepted" as never,
    ((payload: unknown) => {
      accepted.push(payload);
    }) as never,
  );
  batcher.addStateTransition(
    "request:terminal" as never,
    ((payload: unknown) => {
      terminal.push(payload);
    }) as never,
  );
  try {
    await batcher.init({ startPolling: false });
    await fn({ batcher: batcher as Batcher<DefaultBatcherInput>, accepted, terminal });
  } finally {
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("per-request events through a live batcher", () => {
  test("an accepted submission announces itself before the caller is answered", async () => {
    await withBatcher(async ({ batcher, accepted }) => {
      const payload = input();
      const result = await batcher.batchInput(payload, "no-wait");

      // Already delivered by the time `batchInput` resolves — an operator
      // hooking the lifecycle should not have to poll to learn about a request
      // the caller already holds an id for.
      expect(accepted.length).toBe(1);
      expect(accepted[0]).toMatchObject({
        requestId: result.requestId,
        target: TARGET,
        duplicate: false,
      });
      expect(typeof accepted[0].time).toBe("number");
    });
  });

  test("a duplicate announces itself as one, under the ORIGINAL id", async () => {
    await withBatcher(async ({ batcher, accepted }) => {
      const payload = input();
      const first = await batcher.batchInput(payload, "no-wait");
      await batcher.batchInput(payload, "no-wait");

      expect(accepted.length).toBe(2);
      expect(accepted[1]).toMatchObject({
        requestId: first.requestId,
        duplicate: true,
      });
    });
  });

  test("a confirmed request announces its ending, once", async () => {
    await withBatcher(async ({ batcher, terminal }) => {
      const payload = input();
      const { requestId } = await batcher.batchInput(payload, "no-wait");

      await batcher.pollBatcher();

      expect(terminal.length).toBe(1);
      expect(terminal[0]).toMatchObject({
        requestId,
        target: TARGET,
        state: "confirmed",
        transactionHash: "0xbatch",
      });
      expect(requestId).toBe(computeRequestId(payload, TARGET));
    });
  }, { timeout: 30_000 });

  test("a listener that throws is not the request's problem", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-request-events-bad-"));
    const storage = new DatabaseStorage({ dataDirectory: dir });
    const batcher = createNewBatcher(
      {
        pollingIntervalMs: 1_000_000,
        enableHttpServer: false,
        enableEventSystem: true,
      },
      storage as any,
    );
    batcher.addBlockchainAdapter(
      TARGET,
      stubAdapter() as unknown as Parameters<
        Batcher<DefaultBatcherInput>["addBlockchainAdapter"]
      >[1],
      { criteriaType: "size", maxBatchSize: 1 },
    );
    batcher.addStateTransition(
      "request:accepted" as never,
      (() => {
        throw new Error("listener exploded");
      }) as never,
    );
    try {
      await batcher.init({ startPolling: false });

      // Events are observability. A metrics sink that falls over must not turn
      // every submission into a 500.
      const result = await batcher.batchInput(input(), "no-wait");
      expect(result.requestId).toBeTruthy();
      expect((await storage.getAllInputs()).length).toBe(1);
    } finally {
      await storage.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

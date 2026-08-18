// Every OTHER test of the status wiring drives storage through a stub whose
// methods are arrow functions closing over test state. That is a fine way to
// assert WHAT the processor decides — and it is structurally blind to HOW it
// calls storage, because an arrow function does not care what `this` is.
//
// `DatabaseStorage` does care: its methods reach for `this.db`. So a processor
// that detaches a storage method from its receiver before calling it passes
// every stub-based test and fails against the only backend the batcher
// actually ships with — leaving every request stuck at `queued` forever.
//
// This file closes that gap the only way it can be closed: run the real
// processor against the real backend and ask what the poller would see.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import { DatabaseStorage } from "../core/storage.ts";
import { RETRIES_EXHAUSTED } from "../core/batch-processor.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const TARGET = "product-a";

// Fresh, read once: the admission window refuses stale signed timestamps, and
// re-reading the clock per input would change the request id (Q-P11.1).
const NOW = Date.now();

const input = (
  verdict: "CONFIRM" | "REJECT" | "FAIL",
  nonce: string,
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ verdict, nonce }),
  timestamp: String(NOW),
  signature: `0xsignature-${nonce}`,
  target: TARGET,
});

/** Routes each input by the verdict encoded in its payload. */
const scriptedAdapter = () => ({
  verifySignature: () => true,
  validateInput: () => ({ valid: true }),
  buildBatchData: (inputs: DefaultBatcherInput[]) =>
    inputs.length === 0 ? null : { selectedInputs: inputs, data: { inputs } },
  estimateBatchFee: () => 0n,
  submitBatch: async (data: { inputs: DefaultBatcherInput[] }) => {
    const submitted: DefaultBatcherInput[] = [];
    const permanentRejected: unknown[] = [];
    const failed: unknown[] = [];
    for (const i of data.inputs) {
      const verdict = JSON.parse(i.input).verdict;
      if (verdict === "REJECT") {
        permanentRejected.push({
          input: i,
          error: "scripted permanent rejection",
          errorCode: "SCRIPTED_REJECT",
        });
      } else if (verdict === "FAIL") {
        failed.push({ input: i, error: "scripted transient failure" });
      } else submitted.push(i);
    }
    const outcome: Record<string, unknown> = {};
    if (submitted.length > 0) {
      outcome.hash = "0xbatch";
      outcome.submitted = submitted;
    }
    if (permanentRejected.length > 0) outcome.permanentRejected = permanentRejected;
    if (failed.length > 0) outcome.failed = failed;
    return outcome;
  },
  waitForTransactionReceipt: async () => ({
    hash: "0xbatch",
    blockNumber: 4242n,
    status: 1,
  }),
  getAccountAddress: () => "scripted",
  getChainName: () => "scripted",
  isReady: () => true,
  getBlockNumber: async () => 4242n,
});

async function withBatcher(
  fn: (ctx: {
    batcher: ReturnType<typeof createNewBatcher>;
    storage: DatabaseStorage;
  }) => Promise<void>,
  config: Record<string, unknown> = {},
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-real-storage-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
    ...config,
  }, storage as any);
  batcher.addBlockchainAdapter(TARGET, scriptedAdapter() as any, {
    criteriaType: "size",
    maxBatchSize: 1,
  });
  await batcher.init({ startPolling: false });
  try {
    await fn({ batcher, storage });
  } finally {
    // Same shutdown path `retention-timer.test.ts` uses: `cleanupResources`
    // is protected, and shutting down through the public route also stops the
    // retention sweep before the storage handle closes (F-P4.17).
    await (batcher as any).gracefulShutdown().catch(() => {});
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

test("against the real database backend, a confirmed request actually reads confirmed", async () => {
  await withBatcher(async ({ batcher }) => {
    const { requestId } = await batcher.batchInput(input("CONFIRM", "a"), "no-wait");

    await batcher.forceProcessBatches();

    const status = await batcher.getRequestStatus(requestId);
    // The whole point: `queued` here means every transition write was thrown
    // away, and no amount of waiting would ever change the answer.
    expect(status?.state).toBe("confirmed");
    expect(status?.transactionHash).toBe("0xbatch");
    expect(status?.blockNumber).toBe(4242n);
  });
});

test("against the real database backend, a permanent rejection reads failed with its code", async () => {
  await withBatcher(async ({ batcher }) => {
    const { requestId } = await batcher.batchInput(input("REJECT", "b"), "no-wait");

    await batcher.forceProcessBatches();

    const status = await batcher.getRequestStatus(requestId);
    expect(status?.state).toBe("failed");
    expect(status?.errorCode).toBe("SCRIPTED_REJECT");
  });
});

test("against the real database backend, retry exhaustion reads failed/RETRIES_EXHAUSTED", async () => {
  await withBatcher(async ({ batcher }) => {
    const { requestId } = await batcher.batchInput(input("FAIL", "c"), "no-wait");

    // maxRetries: 1 — the first charge is already the last.
    await batcher.forceProcessBatches();

    const status = await batcher.getRequestStatus(requestId);
    expect(status?.state).toBe("failed");
    expect(status?.errorCode).toBe(RETRIES_EXHAUSTED);
  }, { maxRetries: 1 });
});

test("a mid-flight request reads submitted, with the hash, while the batch is still in the air", async () => {
  // The three tests above only observe TERMINAL states, so a processor that
  // wrote nothing until the end would still satisfy them. This one pins the
  // intermediate state a caller polling a live request actually sees.
  //
  // It observes by holding the receipt open, NOT by wrapping the storage
  // method: the first draft of this test spied by assigning a bound wrapper
  // over `storage.recordTransition`, which repaired the exact detached-receiver
  // bug it was written to catch, and passed against the broken code.
  await withBatcher(async ({ batcher }) => {
    let releaseReceipt: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releaseReceipt = resolve;
    });
    const adapter = (batcher as any).adapters[TARGET];
    adapter.waitForTransactionReceipt = async () => {
      await held;
      return { hash: "0xbatch", blockNumber: 4242n, status: 1 };
    };

    const { requestId } = await batcher.batchInput(input("CONFIRM", "d"), "no-wait");
    const processing = batcher.forceProcessBatches();

    // Poll while the transaction is unconfirmed.
    let midFlight = await batcher.getRequestStatus(requestId);
    for (let i = 0; i < 100 && midFlight?.state !== "submitted"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      midFlight = await batcher.getRequestStatus(requestId);
    }
    expect(midFlight?.state).toBe("submitted");
    expect(midFlight?.transactionHash).toBe("0xbatch");
    // Not complete yet: nothing has confirmed.
    expect(midFlight?.blockNumber).toBeUndefined();

    releaseReceipt();
    await processing;
    expect((await batcher.getRequestStatus(requestId))?.state).toBe("confirmed");
  });
});

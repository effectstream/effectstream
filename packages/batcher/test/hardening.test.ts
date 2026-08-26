// Unit tests for the dust-doom-loop hardening (see templates/midnight-batcher/TESTING.md):
//  - worker pool must NOT hand out workers from dust-exhausted wallets
//  - infra failures must be classified (park) vs input failures (retry-charge)
//  - storage must retry-charge and then DROP with a visible warning at the
//    CONFIGURED limit (previously hardcoded to 3)

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { WorkerPool } from "../adapters/worker-pool.ts";
import { BatchProcessor } from "../core/batch-processor.ts";
import { FileStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

describe("WorkerPool exhaustion filter", () => {
  test("returns null when every free worker's wallet is filtered out (no fallback)", () => {
    const pool = new WorkerPool([2, 2]); // 2 wallets × 2 slots
    const worker = pool.acquireWorker(() => false);
    expect(worker).toBeNull();
  });

  test("only assigns workers from wallets passing the filter", () => {
    const pool = new WorkerPool([1, 1]);
    const worker = pool.acquireWorker((walletIdx) => walletIdx === 1);
    expect(worker).not.toBeNull();
    expect(worker!.walletIdx).toBe(1);
  });

  test("still assigns freely without a filter", () => {
    const pool = new WorkerPool([1]);
    expect(pool.acquireWorker()).not.toBeNull();
  });
});

describe("WorkerPool desired slot budgets", () => {
  test("retires busy excess workers on release and permits only the desired budget", () => {
    const pool = new WorkerPool([2]);
    const firstBusy = pool.acquireWorker();
    const secondBusy = pool.acquireWorker();
    expect(firstBusy).not.toBeNull();
    expect(secondBusy).not.toBeNull();

    pool.setSlots(0, 1);
    expect(pool.getTotalWorkerCount()).toBe(2);

    pool.releaseWorker(firstBusy!.walletIdx, firstBusy!.slotIdx);
    pool.releaseWorker(secondBusy!.walletIdx, secondBusy!.slotIdx);

    expect(pool.getTotalWorkerCount()).toBe(1);
    expect(pool.getFreeWorkerCount()).toBe(1);
    expect(pool.acquireWorker()).not.toBeNull();
    expect(pool.acquireWorker()).toBeNull();
  });

  test("shrink and regrow preserves unique worker slot IDs", () => {
    const pool = new WorkerPool([3]);
    const busy = [pool.acquireWorker(), pool.acquireWorker(), pool.acquireWorker()];
    expect(busy.every(Boolean)).toBe(true);

    pool.setSlots(0, 1);
    for (const worker of busy) {
      pool.releaseWorker(worker!.walletIdx, worker!.slotIdx);
    }
    expect(pool.getTotalWorkerCount()).toBe(1);

    pool.setSlots(0, 3);
    const regrown = [pool.acquireWorker(), pool.acquireWorker(), pool.acquireWorker()];
    const slotIds = regrown.map((worker) => worker!.slotIdx).sort((a, b) => a - b);
    expect(slotIds).toEqual([0, 1, 2]);
    expect(new Set(slotIds).size).toBe(3);
    expect(pool.acquireWorker()).toBeNull();
  });

  test("recovers from a zero desired budget without duplicate IDs", () => {
    const pool = new WorkerPool([1]);
    const busy = pool.acquireWorker();
    expect(busy).not.toBeNull();

    pool.setSlots(0, 0);
    pool.releaseWorker(busy!.walletIdx, busy!.slotIdx);
    expect(pool.getTotalWorkerCount()).toBe(0);
    expect(pool.hasAvailableWorker()).toBe(false);

    pool.setSlots(0, 2);
    const recovered = [pool.acquireWorker(), pool.acquireWorker()];
    expect(recovered.map((worker) => worker!.slotIdx).sort((a, b) => a - b)).toEqual([0, 1]);
    expect(pool.acquireWorker()).toBeNull();
  });
});

describe("BatchProcessor.isInfraFailure", () => {
  const infra = [
    "All 5 transactions failed. First error: Insufficient Funds: could not balance dust",
    "Unable to connect. Is the computer able to access the url?",
    "fetch failed",
    "connect ECONNREFUSED 127.0.0.1:8088",
    "submitTransaction timed out",
    "Request failed: 503 Service Unavailable",
    "index_wallets_task failed: pool timed out while waiting for an open connection",
  ];
  for (const message of infra) {
    test(`infra: ${message.slice(0, 50)}`, () => {
      expect(BatchProcessor.isInfraFailure(new Error(message))).toBe(true);
    });
  }

  const input = [
    "All 1 transactions failed. First error: Invalid Transaction: Custom error: 103",
    "Transaction failed to deserialize: unexpected byte",
    "All 2 inputs failed to deserialize (invalid input)",
    "txStage must be 'unproven', 'unbound', or 'finalized'",
  ];
  for (const message of input) {
    test(`input: ${message.slice(0, 50)}`, () => {
      expect(BatchProcessor.isInfraFailure(new Error(message))).toBe(false);
    });
  }
});

describe("FileStorage retry-then-drop honors the configured limit", () => {
  const makeInput = (n: number): DefaultBatcherInput => ({
    address: `addr-${n}`,
    addressType: 5,
    input: JSON.stringify({ tx: "aa".repeat(8) }),
    timestamp: String(1000 + n),
    target: "midnight-balancer",
  } as DefaultBatcherInput);

  test("input survives below maxRetries and is dropped at the limit", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-hardening-"));
    try {
      const storage = new FileStorage(dir);
      await storage.init?.();
      const input = makeInput(1);
      await storage.addInput(input);

      // maxRetries=5: four increments keep it, the fifth drops it.
      for (let i = 0; i < 4; i++) {
        const [current] = await storage.getAllInputs();
        await storage.incrementRetryCount([current], "midnight-balancer", 5);
        const remaining = await storage.getAllInputs();
        expect(remaining.length).toBe(1);
        expect(remaining[0].retryCount).toBe(i + 1);
      }
      const [current] = await storage.getAllInputs();
      await storage.incrementRetryCount([current], "midnight-balancer", 5);
      expect((await storage.getAllInputs()).length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

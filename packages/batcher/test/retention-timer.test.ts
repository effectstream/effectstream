// Retention actually runs (spec FR-007).
//
// `pruneTerminal` has existed since Phase 1 and nothing called it, so a
// long-lived batcher accumulated terminal records forever — and, because the
// replay gate matches against those records, "we never pay twice" was being
// held up by a table nobody was bounding. This wires the sweep to a timer.
//
// The timer belongs to the Batcher, not the HTTP server: tracking exists
// without HTTP (`enableHttpServer: false` is a supported deployment), so
// hanging the lifecycle off the server would leave those batchers unbounded.
// The corollary is that the Batcher must also STOP it — an interval that
// outlives its owner is the classic way a test suite or an embedding process
// ends up holding a database handle open forever.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import type { Batcher } from "../core/batcher.ts";
import { DatabaseStorage, FileStorage } from "../core/storage.ts";
import { computeRequestId } from "../core/request-id.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { startBatcherHttpServer } from "../server/batcher-server.ts";

const TARGET = "product-a";
const NOW = Date.now();

const input = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: String(NOW),
  signature: "0xsignature-1",
  target: TARGET,
  ...overrides,
});

const stubAdapter = () => ({
  verifySignature: () => true,
  validateInput: () => ({ valid: true }),
  buildBatchData: (inputs: DefaultBatcherInput[]) => ({
    selectedInputs: inputs,
    data: { inputs },
  }),
  estimateBatchFee: () => 0n,
  submitBatch: async () => "0xbatch",
  waitForTransactionReceipt: async () => ({
    hash: "0xbatch",
    blockNumber: 1n,
    status: 1,
  }),
  getChainName: () => "stub",
  isReady: () => true,
});

/** Seed `count` TERMINAL records — the only kind retention removes. */
async function seedTerminal(
  storage: DatabaseStorage,
  count: number,
  label = "seed",
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const payload = input({ signature: `0xsig-${label}-${i}` });
    const id = computeRequestId(payload, TARGET);
    await storage.recordAccepted(id, payload, TARGET, `replay-${label}-${i}`);
    await storage.recordTransition(id, "confirmed", {
      transactionHash: `0xhash-${i}`,
      blockNumber: BigInt(i + 1),
    });
    ids.push(id);
  }
  return ids;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withBatcher(
  fn: (ctx: {
    batcher: Batcher<DefaultBatcherInput>;
    storage: DatabaseStorage;
  }) => Promise<void>,
  config: Record<string, unknown> = {},
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-retention-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
    ...config,
  } as any, storage as any);
  batcher.addBlockchainAdapter(TARGET, stubAdapter() as any, {
    criteriaType: "size",
    maxBatchSize: 1_000_000,
  });
  try {
    await batcher.init({ startPolling: false });
    await fn({ batcher: batcher as Batcher<DefaultBatcherInput>, storage });
  } finally {
    await (batcher as any).gracefulShutdown().catch(() => {});
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the retention sweep", () => {
  test("terminal records are pruned without anyone asking", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const ids = await seedTerminal(storage, 3);
      expect(await storage.getStatus(ids[0]!)).toBeDefined();

      // The timer, not a manual call: what was missing was the SCHEDULE.
      await sleep(1_600);

      for (const id of ids) {
        expect(await storage.getStatus(id)).toBeUndefined();
      }
      const metrics = batcher.getRetentionStatus();
      expect(metrics.prunedTotal).toBeGreaterThanOrEqual(3);
      expect(metrics.lastRunAt).toBeDefined();
    }, { statusRetentionKeepCount: 0, statusPruneIntervalMs: 1_000 });
  }, 20_000);

  test("after the sweep, the same spend can be submitted again", async () => {
    // Retention and replay protection share fate. Once a record is gone the
    // batcher has no basis to refuse the work, so the request must become
    // submittable — otherwise an aged-out id is permanently stuck: refused as a
    // duplicate, with nothing left to poll.
    //
    // Asserted end to end through `batchInput` rather than by looking for the
    // absence of a storage row. The live `request_status` row now owns its
    // replay key directly, so pruning that record atomically releases the key;
    // an assertion phrased against the historical mirror table would no longer
    // prove anything. This asserts the behaviour the user gets.
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input({ signature: "0xspend-once" });
      const first = await batcher.batchInput(payload, "no-wait");
      expect(first.duplicate).toBeFalsy();
      await storage.recordTransition(first.requestId, "confirmed", {
        transactionHash: "0xdone",
      });
      // Still within retention: refused, and told which request answers for it.
      expect((await batcher.batchInput(payload, "no-wait")).duplicate).toBe(
        true,
      );

      await sleep(1_600);

      const afterSweep = await batcher.batchInput(payload, "no-wait");
      expect(afterSweep.duplicate).toBeFalsy();
      expect(await storage.getStatus(afterSweep.requestId)).toBeDefined();
    }, { statusRetentionKeepCount: 0, statusPruneIntervalMs: 1_000 });
  }, 20_000);

  test("a sweep that throws is survivable — the next one still runs", async () => {
    // A retention failure is an operational problem, not a reason to take the
    // accept path down with it. An unhandled rejection inside a bare
    // setInterval callback is a process-level crash.
    await withBatcher(async ({ batcher, storage }) => {
      let calls = 0;
      const real = storage.pruneTerminal.bind(storage);
      (storage as any).pruneTerminal = async (keep: number, ttl: number) => {
        calls++;
        if (calls === 1) throw new Error("disk on fire");
        return real(keep, ttl);
      };

      await seedTerminal(storage, 2);
      await sleep(2_600);

      expect(calls).toBeGreaterThanOrEqual(2);
      const metrics = batcher.getRetentionStatus();
      expect(metrics.prunedTotal).toBeGreaterThanOrEqual(2);
      expect(metrics.lastError).toContain("disk on fire");
    }, { statusRetentionKeepCount: 0, statusPruneIntervalMs: 1_000 });
  }, 20_000);
});

describe("the timer's lifetime", () => {
  test("shutdown stops it — nothing keeps sweeping afterwards", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-retention-stop-"));
    const storage = new DatabaseStorage({ dataDirectory: dir });
    const batcher = createNewBatcher({
      pollingIntervalMs: 1_000_000,
      enableHttpServer: false,
      enableEventSystem: false,
      statusRetentionKeepCount: 0,
      statusPruneIntervalMs: 1_000,
    } as any, storage as any);
    batcher.addBlockchainAdapter(TARGET, stubAdapter() as any, {
      criteriaType: "size",
      maxBatchSize: 1_000_000,
    });
    try {
      await batcher.init({ startPolling: false });

      // Count the SWEEPS, not their effect. Shutdown closes the storage
      // handle, so nothing can be seeded afterwards to observe surviving — and
      // a leaked timer firing against a closed database would show up as an
      // error rather than as a deletion, which is exactly the failure mode this
      // test needs to catch. The spy sees the call either way.
      let sweeps = 0;
      const real = storage.pruneTerminal.bind(storage);
      (storage as any).pruneTerminal = async (keep: number, ttl: number) => {
        sweeps++;
        return real(keep, ttl);
      };

      await seedTerminal(storage, 1, "before");
      await sleep(1_500);
      expect(sweeps).toBeGreaterThanOrEqual(1);

      await (batcher as any).gracefulShutdown();
      const sweptWhileRunning = sweeps;

      await sleep(2_400);

      // Two-plus intervals with nothing running: the timer is gone, not merely
      // idle.
      expect(sweeps).toBe(sweptWhileRunning);
      expect((batcher as any).getRetentionStatus().enabled).toBe(false);
    } finally {
      await storage.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  test("queue-only storage never starts a sweep at all", async () => {
    // There is nothing to retain, and a timer firing against a backend with no
    // status table would be a recurring error in the log forever.
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-retention-file-"));
    const storage = new FileStorage<DefaultBatcherInput>(dir);
    const batcher = createNewBatcher({
      pollingIntervalMs: 1_000_000,
      enableHttpServer: false,
      enableEventSystem: false,
      statusPruneIntervalMs: 1_000,
    } as any, storage as any);
    batcher.addBlockchainAdapter(TARGET, stubAdapter() as any, {
      criteriaType: "size",
      maxBatchSize: 1_000_000,
    });
    try {
      await batcher.init({ startPolling: false });
      await sleep(1_500);
      const metrics = (batcher as any).getRetentionStatus();
      expect(metrics.enabled).toBe(false);
      expect(metrics.lastRunAt).toBeUndefined();
      expect(metrics.prunedTotal).toBe(0);
    } finally {
      await (batcher as any).gracefulShutdown().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("what /queue-stats reports", () => {
  test("retention and reconciliation counters are visible to an operator", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      await seedTerminal(storage, 2);
      await sleep(1_600);

      const server = await startBatcherHttpServer(batcher as any, 0);
      try {
        const res = await server.inject({ method: "GET", url: "/queue-stats" });
        expect(res.statusCode).toBe(200);
        const stats = res.json();

        // Batcher-level, beside totalPendingInputs — retention is a property of
        // the batcher, not of any one product's adapter.
        expect(stats.retention).toBeDefined();
        expect(stats.retention.enabled).toBe(true);
        expect(stats.retention.prunedTotal).toBeGreaterThanOrEqual(2);
        expect(typeof stats.retention.lastRunAt).toBe("string");

        // Phase 2's boot repair counters: an operator seeing these move after a
        // restart is seeing evidence of an unclean stop.
        expect(stats.reconciliation).toBeDefined();
        expect(typeof stats.reconciliation.synthesizedFromRows).toBe("number");
        expect(typeof stats.reconciliation.orphanedStatuses).toBe("number");

        // Nothing that was there before is gone.
        expect(typeof stats.totalPendingInputs).toBe("number");
        expect(Array.isArray(stats.targets)).toBe(true);
      } finally {
        await server.close();
      }
    }, { statusRetentionKeepCount: 0, statusPruneIntervalMs: 1_000 });
  }, 20_000);

  test("on queue-only storage the stats say so instead of lying", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-retention-stats-"));
    const storage = new FileStorage<DefaultBatcherInput>(dir);
    const batcher = createNewBatcher({
      pollingIntervalMs: 1_000_000,
      enableHttpServer: false,
      enableEventSystem: false,
    } as any, storage as any);
    batcher.addBlockchainAdapter(TARGET, stubAdapter() as any, {
      criteriaType: "size",
      maxBatchSize: 1_000_000,
    });
    await batcher.init({ startPolling: false });
    const server = await startBatcherHttpServer(batcher as any, 0);
    try {
      const stats = (await server.inject({
        method: "GET",
        url: "/queue-stats",
      })).json();
      expect(stats.retention.enabled).toBe(false);
      expect(stats.reconciliation).toBeUndefined();
    } finally {
      await server.close();
      await (batcher as any).gracefulShutdown().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

// `DatabaseStorage` behaviour that has no FileStorage counterpart, so the
// shared contract suite cannot cover it:
//
//  - importing a queue written by FileStorage, exactly once
//  - the retention primitive for terminal request records
//
// Both are one-way doors. An import that runs twice resubmits every input in
// the file; a retention sweep that takes the wrong row deletes the only record
// a caller has of what happened to their request.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseStorage } from "../core/database-storage.ts";
import { computeRequestId } from "../core/request-id.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const legacyRow = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: "payload",
  timestamp: "1754350000000",
  signature: "sig-1",
  ...overrides,
});

async function withDir(
  fn: (ctx: {
    dir: string;
    queueFile: string;
    open(defaultTarget?: string): Promise<DatabaseStorage>;
  }) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-database-storage-"));
  const open: DatabaseStorage[] = [];
  try {
    await fn({
      dir,
      queueFile: path.join(dir, "pending-inputs.jsonl"),
      open: async (defaultTarget?: string) => {
        // Only one process may hold an embedded database, so a re-open closes
        // whatever came before it — the same thing a restart does.
        await open[open.length - 1]?.close();
        const storage = new DatabaseStorage({ dataDirectory: dir });
        open.push(storage);
        await storage.init(defaultTarget);
        return storage;
      },
    });
  } finally {
    for (const storage of open) {
      try {
        await storage.close();
      } catch {
        // never mask the assertion that failed first
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

const seedQueueFile = (file: string, rows: unknown[]): void => {
  writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
};

describe("legacy queue import", () => {
  test("imports a FileStorage queue and renames the file", async () => {
    await withDir(async ({ queueFile, open }) => {
      seedQueueFile(queueFile, [
        legacyRow({ timestamp: "1" }),
        legacyRow({ timestamp: "2", target: "product-b" }),
      ]);

      const storage = await open("product-a");

      const rows = await storage.getAllInputs();
      expect(rows.length).toBe(2);
      expect(rows.find((r) => r.timestamp === "1")?.target).toBe("product-a");
      expect(rows.find((r) => r.timestamp === "2")?.target).toBe("product-b");

      expect(existsSync(queueFile)).toBe(false);
      expect(existsSync(`${queueFile}.imported`)).toBe(true);
    });
  });

  test("a second boot imports nothing", async () => {
    await withDir(async ({ queueFile, open }) => {
      seedQueueFile(queueFile, [legacyRow({ timestamp: "1" })]);

      await open("product-a");
      const restarted = await open("product-a");

      // The row must be here exactly once. Twice would mean the batcher pays
      // for the same input a second time.
      expect((await restarted.getAllInputs()).length).toBe(1);
    });
  });

  test("a queue file that reappears next to a non-empty table is refused", async () => {
    await withDir(async ({ queueFile, open }) => {
      const first = await open("product-a");
      await first.addInput(legacyRow({ timestamp: "live" }), "product-a");

      // Something dropped an old queue file back into the data directory.
      seedQueueFile(queueFile, [legacyRow({ timestamp: "stale" })]);
      const restarted = await open("product-a");

      const rows = await restarted.getAllInputs();
      expect(rows.length).toBe(1);
      expect(rows[0].timestamp).toBe("live");
      // Left in place, not silently consumed: an operator has to look at it.
      expect(existsSync(queueFile)).toBe(true);
    });
  });

  test("untargeted rows with no default target are refused, and recovered later", async () => {
    await withDir(async ({ queueFile, open }) => {
      seedQueueFile(queueFile, [legacyRow({ timestamp: "1" })]);

      // No default target: there is no honest target to stamp, and guessing
      // would hand the row to whichever product read it first.
      const blind = await open(undefined);
      expect(await blind.getAllInputs()).toEqual([]);
      expect(existsSync(queueFile)).toBe(true);

      // Once a target is known the queue is still recoverable.
      const informed = await open("product-a");
      const rows = await informed.getAllInputs();
      expect(rows.length).toBe(1);
      expect(rows[0].target).toBe("product-a");
      expect(existsSync(queueFile)).toBe(false);
    });
  });

  test("a corrupt line is skipped, the rest of the queue is imported", async () => {
    await withDir(async ({ queueFile, open }) => {
      writeFileSync(
        queueFile,
        [
          JSON.stringify(legacyRow({ timestamp: "1" })),
          "{ this is not json",
          JSON.stringify(legacyRow({ timestamp: "2" })),
        ].join("\n") + "\n",
      );

      const storage = await open("product-a");
      expect((await storage.getAllInputs()).map((r) => r.timestamp))
        .toEqual(["1", "2"]);
    });
  });

  test("no queue file is a no-op, not an error", async () => {
    await withDir(async ({ open }) => {
      const storage = await open("product-a");
      expect(await storage.getAllInputs()).toEqual([]);
    });
  });
});

describe("terminal-record retention", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  test("terminal records older than the TTL are dropped, younger ones kept", async () => {
    await withDir(async ({ open }) => {
      const storage = await open("product-a");
      const now = Date.now();
      const [old, fresh] = await seedStatuses(storage, [
        { label: "old", updatedAt: new Date(now - 2 * ONE_DAY_MS) },
        { label: "fresh", updatedAt: new Date(now - 60_000) },
      ]);

      const pruned = await storage.pruneTerminal(1_000_000, ONE_DAY_MS);

      expect(pruned.prunedByAge).toBe(1);
      expect(await terminalIds(storage)).toEqual([fresh]);
      expect(await storage.getStatus(old)).toBeUndefined();
    });
  });

  test("only the newest keepCount terminal records survive", async () => {
    await withDir(async ({ open }) => {
      const storage = await open("product-a");
      const now = Date.now();
      // 60 records, one second apart; record i is i seconds old.
      const ids = await seedStatuses(
        storage,
        Array.from({ length: 60 }, (_, i) => ({
          label: `req-${String(i).padStart(3, "0")}`,
          updatedAt: new Date(now - i * 1000),
        })),
      );

      const pruned = await storage.pruneTerminal(40, ONE_DAY_MS);

      expect(pruned.prunedByAge).toBe(0);
      expect(pruned.prunedByCount).toBe(20);
      // Exact survivor set, by recency: the 40 newest, no more and no fewer.
      expect(new Set(await terminalIds(storage)))
        .toEqual(new Set(ids.slice(0, 40)));
    });
  });

  test("in-flight records are never pruned, however old", async () => {
    await withDir(async ({ open }) => {
      const storage = await open("product-a");
      const [queued] = await seedStatuses(storage, [
        {
          label: "still-queued",
          terminal: false,
          updatedAt: new Date(Date.now() - 30 * ONE_DAY_MS),
        },
      ]);

      // Aggressive on both axes: everything terminal would go.
      const pruned = await storage.pruneTerminal(0, 1);

      expect(pruned).toEqual({ prunedByAge: 0, prunedByCount: 0 });
      expect(await allStatusIds(storage)).toEqual([queued]);
      expect((await storage.getStatus(queued))?.state).toBe("queued");
    });
  });

  test("a replay key dies with the record it belongs to", async () => {
    await withDir(async ({ open }) => {
      const storage = await open("product-a");
      await seedStatuses(storage, [
        {
          label: "expired",
          replayKey: "replay-expired",
          updatedAt: new Date(Date.now() - 2 * ONE_DAY_MS),
        },
        { label: "kept", replayKey: "replay-kept" },
      ]);

      await storage.pruneTerminal(1_000_000, ONE_DAY_MS);

      // A dedup key outliving its status would refuse a resubmission while
      // having nothing to say about the original.
      expect(await replayKeys(storage)).toEqual(["replay-kept"]);
      expect(await storage.findByReplayKey("replay-expired")).toBeUndefined();
    });
  });

  test("nonsense retention bounds are refused", async () => {
    await withDir(async ({ open }) => {
      const storage = await open("product-a");
      expect(storage.pruneTerminal(-1, ONE_DAY_MS)).rejects.toThrow(
        /keepCount must be >= 0/,
      );
      expect(storage.pruneTerminal(10, 0)).rejects.toThrow(/ttlMs must be > 0/);
    });
  });
});

/**
 * Records built through the REAL write path — `recordAccepted`, then a
 * transition to a terminal state — and only then aged.
 *
 * Phase 1 seeded these rows with raw INSERTs because no write path existed yet;
 * that seam is gone. Only the CLOCK is still forced here, because retention is
 * about the passage of a day and a test cannot wait one. Everything else about
 * the row is whatever the production code writes.
 */
async function seedStatuses(
  storage: DatabaseStorage,
  rows: Array<{
    label: string;
    terminal?: boolean;
    updatedAt?: Date;
    replayKey?: string;
  }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const row of rows) {
    const input = legacyRow({ timestamp: row.label, target: "product-a" });
    const requestId = computeRequestId(input, "product-a");
    await storage.recordAccepted(requestId, input, "product-a", row.replayKey);
    if (row.terminal !== false) {
      await storage.recordTransition(requestId, "confirmed", {
        transactionHash: `0x${row.label}`,
        blockNumber: 1n,
      });
    }
    if (row.updatedAt) {
      await query(
        storage,
        `UPDATE request_status SET updated_at = '${row.updatedAt.toISOString()}'
          WHERE request_id = '${requestId}'`,
      );
    }
    ids.push(requestId);
  }
  return ids;
}

// Small readers over the status tables. Phase 1 has no status API yet, and
// inventing one here would prejudge its shape.
async function query<R>(storage: DatabaseStorage, sql: string): Promise<R[]> {
  const db = (storage as unknown as {
    db: {
      query<T>(
        sql: string,
        params?: unknown[],
      ): Promise<{ rows: T[]; rowCount: number }>;
    };
  }).db;
  return (await db.query<R>(sql)).rows;
}

async function terminalIds(storage: DatabaseStorage): Promise<string[]> {
  const rows = await query<{ request_id: string }>(
    storage,
    "SELECT request_id FROM request_status WHERE terminal ORDER BY request_id",
  );
  return rows.map((row) => row.request_id);
}

async function allStatusIds(storage: DatabaseStorage): Promise<string[]> {
  const rows = await query<{ request_id: string }>(
    storage,
    "SELECT request_id FROM request_status ORDER BY request_id",
  );
  return rows.map((row) => row.request_id);
}

async function replayKeys(storage: DatabaseStorage): Promise<string[]> {
  const rows = await query<{ replay_key: string }>(
    storage,
    "SELECT replay_key FROM request_status WHERE replay_key IS NOT NULL ORDER BY replay_key",
  );
  return rows.map((row) => row.replay_key);
}

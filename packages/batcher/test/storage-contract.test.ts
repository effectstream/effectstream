// The storage contract: behaviour EVERY `BatcherStorage` backend must show.
//
// `FileStorage` is the incumbent and its observable behaviour IS the contract —
// this suite was written by reading it, so running it against FileStorage locks
// today's semantics before a second backend exists. Every case then runs
// unchanged against `DatabaseStorage`, which is the only way to know the new
// backend is a drop-in and not a lookalike.
//
// Deliberately covered because each one is load-bearing for a multi-product
// batcher and is cheap to get subtly wrong in SQL:
//  - `addInput` stamps the RESOLVED target onto the row (a targetless row takes
//    on the identity of whoever reads it — the collision the stamp prevents)
//  - duplicate rows with an identical content key are legal, and are removed
//    together
//  - rows differing ONLY by target are distinct for removal and retry charging
//  - retry charging drops a row exactly at `maxRetries`, and the limit is the
//    caller's, not a constant
//  - a batch that another worker already removed is tolerated, not an error
//  - insertion order is preserved (batch selection reads the head of the queue)
//  - `init(defaultTarget)` stamps rows left over from before targets existed

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseStorage, FileStorage } from "../core/storage.ts";
import type { BatcherStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

type Storage = BatcherStorage<DefaultBatcherInput>;

interface Backend {
  readonly name: string;
  make(dataDirectory: string): Storage;
  /**
   * Backends whose store outlives the temp directory need the slate wiped
   * between cases; the file- and PgLite-backed ones get a fresh directory and
   * do not.
   */
  reset?(storage: Storage): Promise<void>;
}

const BACKENDS: Backend[] = [
  {
    name: "FileStorage",
    make: (dir) => new FileStorage(dir),
  },
  {
    name: "DatabaseStorage",
    make: (dir) => new DatabaseStorage({ dataDirectory: dir }),
  },
];

// The Postgres opt-in runs the SAME statements as the embedded default, so it
// gets held to the SAME contract rather than to a smoke test — a second driver
// nobody exercises is a claim, not a feature.
//
// Off unless a server is pointed at it, because the suite must stay runnable
// with no infrastructure:
//   docker run --rm -e POSTGRES_PASSWORD=pw -p <port>:5432 postgres:16-alpine
//   BATCHER_TEST_POSTGRES_URL=postgres://postgres:pw@127.0.0.1:<port>/postgres \
//     bun test packages/batcher/test/storage-contract.test.ts
const POSTGRES_URL = process.env.BATCHER_TEST_POSTGRES_URL;
if (POSTGRES_URL) {
  BACKENDS.push({
    name: "DatabaseStorage(postgres)",
    make: (dir) =>
      new DatabaseStorage({ dataDirectory: dir, connectionString: POSTGRES_URL }),
    // One server serves every case, so each case starts by emptying it.
    reset: async (storage) => {
      const db = (storage as unknown as {
        db: { query(sql: string, params?: unknown[]): Promise<unknown[]> };
      }).db;
      await db.query(
        "TRUNCATE pending_inputs, request_status, replay_keys RESTART IDENTITY",
      );
    },
  });
}

const input = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: "1754350000000",
  signature: "sig-1",
  ...overrides,
});

/** Same payload, same sender, same timestamp — differing ONLY by target. */
const twins = (): [DefaultBatcherInput, DefaultBatcherInput] => [
  input({ target: "product-a" }),
  input({ target: "product-b" }),
];

interface Ctx {
  readonly dir: string;
  storage: Storage;
  /** Close and re-open a storage over the SAME directory (restart simulation). */
  reopen(defaultTarget?: string): Promise<Storage>;
}

/**
 * Run `fn` against a freshly initialised storage in a throwaway directory.
 *
 * `seedLegacyQueue` writes raw JSONL lines into the data directory BEFORE the
 * storage is constructed — that is what a queue carried across an upgrade looks
 * like, and it is the one seam both backends must understand (FileStorage reads
 * the file directly; DatabaseStorage imports it).
 */
async function withStorage(
  backend: Backend,
  fn: (ctx: Ctx) => Promise<void>,
  opts: { defaultTarget?: string; seedLegacyQueue?: unknown[] } = {},
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-storage-contract-"));
  const open: Storage[] = [];
  try {
    if (backend.reset) {
      // Before the legacy file is seeded, so emptying the shared store cannot
      // wipe the very rows an import test is about to bring in.
      const scratch = backend.make(dir);
      await scratch.init();
      await backend.reset(scratch);
      await scratch.close?.();
    }
    if (opts.seedLegacyQueue) {
      writeFileSync(
        path.join(dir, "pending-inputs.jsonl"),
        opts.seedLegacyQueue.map((row) => JSON.stringify(row)).join("\n") + "\n",
      );
    }
    const make = async (defaultTarget?: string): Promise<Storage> => {
      const storage = backend.make(dir);
      open.push(storage);
      await storage.init(defaultTarget);
      return storage;
    };
    const ctx: Ctx = {
      dir,
      storage: await make(opts.defaultTarget),
      reopen: async (defaultTarget?: string) => {
        const previous = open[open.length - 1];
        await previous?.close?.();
        return await make(defaultTarget);
      },
    };
    await fn(ctx);
  } finally {
    for (const storage of open) {
      try {
        await storage.close?.();
      } catch {
        // a close failure must not mask the assertion that failed first
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const backend of BACKENDS) {
  describe(`storage contract [${backend.name}]`, () => {
    test("an empty queue reads as empty, not as an error", async () => {
      await withStorage(backend, async ({ storage }) => {
        expect(await storage.getAllInputs()).toEqual([]);
        expect(await storage.getInputCountAndSize()).toEqual({
          count: 0,
          size: 0,
        });
        expect(await storage.getInputsByTarget("product-a", "product-a"))
          .toEqual([]);
        await storage.clearAllInputs(); // must not throw on a queue that never existed
      });
    });

    test("addInput stamps the resolved target onto an untargeted input", async () => {
      await withStorage(backend, async ({ storage }) => {
        await storage.addInput(input(), "product-a");
        const rows = await storage.getAllInputs();
        expect(rows.length).toBe(1);
        expect(rows[0].target).toBe("product-a");
      });
    });

    test("addInput keeps a target the input carried itself", async () => {
      await withStorage(backend, async ({ storage }) => {
        await storage.addInput(input({ target: "product-b" }), "product-b");
        expect((await storage.getAllInputs())[0].target).toBe("product-b");
      });
    });

    test("rows are returned in insertion order", async () => {
      await withStorage(backend, async ({ storage }) => {
        for (const ts of ["1", "2", "3"]) {
          await storage.addInput(input({ timestamp: ts }), "product-a");
        }
        expect((await storage.getAllInputs()).map((r) => r.timestamp))
          .toEqual(["1", "2", "3"]);
      });
    });

    test("rows survive a restart", async () => {
      await withStorage(backend, async (ctx) => {
        await ctx.storage.addInput(input(), "product-a");
        const restarted = await ctx.reopen("product-a");
        const rows = await restarted.getAllInputs();
        expect(rows.length).toBe(1);
        expect(rows[0].address).toBe("addr-1");
        expect(rows[0].target).toBe("product-a");
      });
    });

    test("duplicate rows are legal and are removed together", async () => {
      await withStorage(backend, async ({ storage }) => {
        const row = input({ target: "product-a" });
        await storage.addInput(row, "product-a");
        await storage.addInput(row, "product-a");
        expect((await storage.getAllInputs()).length).toBe(2);

        await storage.removeProcessedInputs([row], "product-a");
        expect(await storage.getAllInputs()).toEqual([]);
      });
    });

    test("removing one product's row leaves another product's identical row", async () => {
      await withStorage(backend, async ({ storage }) => {
        const [a, b] = twins();
        await storage.addInput(a, "product-a");
        await storage.addInput(b, "product-b");

        await storage.removeProcessedInputs([a], "product-a");

        const remaining = await storage.getAllInputs();
        expect(remaining.length).toBe(1);
        expect(remaining[0].target).toBe("product-b");
      });
    });

    test("retry-charging one product's row does not charge its twin", async () => {
      await withStorage(backend, async ({ storage }) => {
        const [a, b] = twins();
        await storage.addInput(a, "product-a");
        await storage.addInput(b, "product-b");

        await storage.incrementRetryCount([a], "product-a", 5);

        const rows = await storage.getAllInputs();
        const charged = rows.find((r) => r.target === "product-a");
        const untouched = rows.find((r) => r.target === "product-b");
        expect(charged?.retryCount).toBe(1);
        expect(untouched?.retryCount).toBeUndefined();
      });
    });

    test("getInputsByTarget filters on the row's own target", async () => {
      await withStorage(backend, async ({ storage }) => {
        const [a, b] = twins();
        await storage.addInput(a, "product-a");
        await storage.addInput(b, "product-b");

        const forA = await storage.getInputsByTarget("product-a", "product-a");
        expect(forA.length).toBe(1);
        expect(forA[0].target).toBe("product-a");

        const forB = await storage.getInputsByTarget("product-b", "product-a");
        expect(forB.length).toBe(1);
        expect(forB[0].target).toBe("product-b");
      });
    });

    test("getInputCountAndSize counts rows and sums their serialised length", async () => {
      await withStorage(backend, async ({ storage }) => {
        await storage.addInput(input({ timestamp: "1" }), "product-a");
        await storage.addInput(input({ timestamp: "2" }), "product-a");

        const rows = await storage.getAllInputs();
        const expectedSize = rows.reduce(
          (acc, row) => acc + JSON.stringify(row).length,
          0,
        );
        expect(await storage.getInputCountAndSize()).toEqual({
          count: 2,
          size: expectedSize,
        });
      });
    });

    test("incrementRetryCount charges only the named rows", async () => {
      await withStorage(backend, async ({ storage }) => {
        const charged = input({ timestamp: "1", target: "product-a" });
        const spared = input({ timestamp: "2", target: "product-a" });
        await storage.addInput(charged, "product-a");
        await storage.addInput(spared, "product-a");

        await storage.incrementRetryCount([charged], "product-a", 5);

        const rows = await storage.getAllInputs();
        expect(rows.find((r) => r.timestamp === "1")?.retryCount).toBe(1);
        expect(rows.find((r) => r.timestamp === "2")?.retryCount)
          .toBeUndefined();
      });
    });

    test("a row is dropped exactly at the caller's maxRetries", async () => {
      await withStorage(backend, async ({ storage }) => {
        const row = input({ target: "product-a" });
        await storage.addInput(row, "product-a");

        // maxRetries = 5 means five charges: four survive, the fifth drops it.
        for (let attempt = 1; attempt <= 4; attempt += 1) {
          const current = (await storage.getAllInputs())[0];
          await storage.incrementRetryCount([current], "product-a", 5);
          const after = await storage.getAllInputs();
          expect(after.length).toBe(1);
          expect(after[0].retryCount).toBe(attempt);
        }

        const last = (await storage.getAllInputs())[0];
        await storage.incrementRetryCount([last], "product-a", 5);
        expect(await storage.getAllInputs()).toEqual([]);
      });
    });

    test("incrementRetryCount REPORTS what it dropped", async () => {
      await withStorage(backend, async ({ storage }) => {
        const doomed = input({ timestamp: "1", target: "product-a" });
        const spared = input({ timestamp: "2", target: "product-a" });
        await storage.addInput(doomed, "product-a");
        await storage.addInput(spared, "product-a");

        // Below the limit nothing goes, so nothing is reported.
        expect(await storage.incrementRetryCount([doomed], "product-a", 2))
          .toEqual([]);

        // At the limit the row is deleted — and until now that deletion was
        // observable only as a console.warn, which is why a caller waiting on
        // this input hung until its own timeout. The caller is the batcher's
        // problem to notify, but it cannot notify what it is never told.
        const dropped = await storage.incrementRetryCount(
          [doomed],
          "product-a",
          2,
        );
        expect(dropped.length).toBe(1);
        expect(dropped[0].timestamp).toBe("1");
        // Carrying the count that caused the drop, so the report can say how
        // many attempts were spent.
        expect(dropped[0].retryCount).toBe(2);
        expect(dropped[0].target).toBe("product-a");
        // …and it really is gone, not merely reported.
        expect((await storage.getAllInputs()).map((r) => r.timestamp))
          .toEqual(["2"]);
      });
    });

    test("dropping duplicate rows reports every row, not every key", async () => {
      await withStorage(backend, async ({ storage }) => {
        const row = input({ target: "product-a" });
        await storage.addInput(row, "product-a");
        await storage.addInput(row, "product-a");

        const dropped = await storage.incrementRetryCount([row], "product-a", 1);

        // Two submissions were accepted, so two callers may be waiting.
        expect(dropped.length).toBe(2);
        expect(await storage.getAllInputs()).toEqual([]);
      });
    });

    test("charging rows that are already gone reports no drops", async () => {
      await withStorage(backend, async ({ storage }) => {
        const gone = input({ timestamp: "1", target: "product-a" });
        expect(await storage.incrementRetryCount([gone], "product-a", 1))
          .toEqual([]);
      });
    });

    test("incrementRetryCount with no inputs is a no-op", async () => {
      await withStorage(backend, async ({ storage }) => {
        await storage.addInput(input({ target: "product-a" }), "product-a");
        expect(await storage.incrementRetryCount([], "product-a", 5)).toEqual([]);
        expect((await storage.getAllInputs()).length).toBe(1);
      });
    });

    test("removing rows a concurrent batch already took is tolerated", async () => {
      await withStorage(backend, async ({ storage }) => {
        const row = input({ target: "product-a" });
        await storage.addInput(row, "product-a");
        await storage.removeProcessedInputs([row], "product-a");

        // Second worker, same batch: the rows are gone. This must resolve.
        await storage.removeProcessedInputs([row], "product-a");
        expect(await storage.getAllInputs()).toEqual([]);
      });
    });

    test("charging retries on rows that are gone is tolerated", async () => {
      await withStorage(backend, async ({ storage }) => {
        const gone = input({ timestamp: "1", target: "product-a" });
        const present = input({ timestamp: "2", target: "product-a" });
        await storage.addInput(present, "product-a");

        await storage.incrementRetryCount([gone], "product-a", 5);

        const rows = await storage.getAllInputs();
        expect(rows.length).toBe(1);
        expect(rows[0].retryCount).toBeUndefined();
      });
    });

    test("clearAllInputs empties the queue", async () => {
      await withStorage(backend, async ({ storage }) => {
        await storage.addInput(input({ timestamp: "1" }), "product-a");
        await storage.addInput(input({ timestamp: "2" }), "product-b");

        await storage.clearAllInputs();

        expect(await storage.getAllInputs()).toEqual([]);
        expect((await storage.getInputCountAndSize()).count).toBe(0);
      });
    });

    test("concurrent addInput calls all land", async () => {
      await withStorage(backend, async ({ storage }) => {
        await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            storage.addInput(input({ timestamp: String(i) }), "product-a")),
        );
        const rows = await storage.getAllInputs();
        expect(rows.length).toBe(20);
        expect(new Set(rows.map((r) => r.timestamp)).size).toBe(20);
      });
    });

    test("init(defaultTarget) stamps rows left over from before targets existed", async () => {
      await withStorage(
        backend,
        async ({ storage }) => {
          const rows = await storage.getAllInputs();
          expect(rows.length).toBe(2);
          // The legacy row is adopted by the default target...
          expect(rows.find((r) => r.timestamp === "1")?.target)
            .toBe("product-a");
          // ...and one that already knew its target keeps it.
          expect(rows.find((r) => r.timestamp === "2")?.target)
            .toBe("product-b");
        },
        {
          defaultTarget: "product-a",
          seedLegacyQueue: [
            { addressType: 5, address: "addr-1", input: "x", timestamp: "1" },
            {
              addressType: 5,
              address: "addr-1",
              input: "x",
              timestamp: "2",
              target: "product-b",
            },
          ],
        },
      );
    });

    test("a stamped legacy row belongs to the default target only", async () => {
      await withStorage(
        backend,
        async ({ storage }) => {
          // Before stamping, `?? target` would let product-b claim this row.
          expect(
            (await storage.getInputsByTarget("product-b", "product-b")).length,
          ).toBe(0);
          expect(
            (await storage.getInputsByTarget("product-a", "product-a")).length,
          ).toBe(1);
        },
        {
          defaultTarget: "product-a",
          seedLegacyQueue: [
            { addressType: 5, address: "addr-1", input: "x", timestamp: "1" },
          ],
        },
      );
    });
  });
}

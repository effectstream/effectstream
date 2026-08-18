// What `init()` does about a queue and a status store that disagree.
//
// They can only disagree in one direction by construction — acceptance writes
// both in one transaction — but three real paths still produce a mismatch:
//
//   a queue row with no status   ← a legacy queue imported from FileStorage, or
//                                  an input written through the untracked
//                                  `addInput` path
//   a status with no queue row   ← the row was removed (batch confirmed, or
//                                  retries exhausted) and the process died
//                                  before the terminal transition was written
//
// The rule is "the ROW wins": a row that exists will be batched, so it gets the
// `queued` status it should always have had. The reverse is NOT symmetrical —
// a status whose row is gone is left exactly as it is, because the alternative
// is inventing a terminal verdict the chain never gave. It is counted and
// logged instead.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseStorage } from "../core/database-storage.ts";
import { computeRequestId } from "../core/request-id.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const POSTGRES_URL = process.env.BATCHER_TEST_POSTGRES_URL;

interface Backend {
  readonly name: string;
  make(dataDirectory: string): DatabaseStorage;
  readonly shared: boolean;
}

const BACKENDS: Backend[] = [
  {
    name: "DatabaseStorage",
    make: (dir) => new DatabaseStorage({ dataDirectory: dir }),
    shared: false,
  },
];

if (POSTGRES_URL) {
  BACKENDS.push({
    name: "DatabaseStorage(postgres)",
    make: (dir) =>
      new DatabaseStorage({ dataDirectory: dir, connectionString: POSTGRES_URL }),
    shared: true,
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
  target: "product-a",
  ...overrides,
});

interface Ctx {
  dir: string;
  queueFile: string;
  /** Close whatever is open and boot over the same store — what a restart does. */
  restart(defaultTarget?: string): Promise<DatabaseStorage>;
}

async function withStore(
  backend: Backend,
  fn: (ctx: Ctx) => Promise<void>,
  opts: { boot?: boolean } = {},
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-reconcile-"));
  const open: DatabaseStorage[] = [];
  const restart = async (defaultTarget = "product-a") => {
    await open[open.length - 1]?.close();
    const storage = backend.make(dir);
    open.push(storage);
    await storage.init(defaultTarget);
    return storage;
  };
  try {
    if (backend.shared) {
      // One server serves every case, so each case starts from an empty store.
      const scratch = backend.make(dir);
      await scratch.init("product-a");
      const db = (scratch as unknown as {
        db: { query(sql: string, params?: unknown[]): Promise<unknown[]> };
      }).db;
      await db.query(
        "TRUNCATE pending_inputs, request_status, replay_keys RESTART IDENTITY",
      );
      await scratch.close();
    }
    await fn({
      dir,
      queueFile: path.join(dir, "pending-inputs.jsonl"),
      restart,
    });
  } finally {
    for (const storage of open) {
      await storage.close().catch(() => {});
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const backend of BACKENDS) {
  describe(`restart reconciliation [${backend.name}]`, () => {
    test("a queue row with no status is given the queued status it should have had", async () => {
      await withStore(backend, async ({ restart }) => {
        const first = await restart();
        const payload = input();
        // The untracked path: a row exists, nothing recorded it.
        await first.addInput(payload, "product-a");

        const restarted = await restart();

        const requestId = computeRequestId(payload, "product-a");
        const status = await restarted.getStatus(requestId);
        expect(status?.state).toBe("queued");
        expect(status?.target).toBe("product-a");
        expect(restarted.getReconciliationReport()).toEqual({
          synthesizedFromRows: 1,
          orphanedStatuses: 0,
        });
      });
    });

    test("an imported legacy queue becomes pollable", async () => {
      await withStore(backend, async ({ queueFile, restart }) => {
        // A queue carried across the upgrade: rows written before request ids
        // existed. They must batch fine AND be pollable afterwards.
        writeFileSync(
          queueFile,
          [input({ timestamp: "1" }), input({ timestamp: "2" })]
            .map((row) => JSON.stringify(row)).join("\n") + "\n",
        );

        const storage = await restart();

        expect((await storage.getAllInputs()).length).toBe(2);
        for (const ts of ["1", "2"]) {
          const id = computeRequestId(input({ timestamp: ts }), "product-a");
          expect((await storage.getStatus(id))?.state).toBe("queued");
        }
        expect(storage.getReconciliationReport()?.synthesizedFromRows).toBe(2);
      });
    });

    test("duplicate rows sharing one id synthesize exactly one status", async () => {
      await withStore(backend, async ({ restart }) => {
        const first = await restart();
        const payload = input();
        await first.addInput(payload, "product-a");
        await first.addInput(payload, "product-a");

        // Two rows, one identity. A per-row INSERT would collide on the
        // primary key and take the whole boot down with it.
        const restarted = await restart();

        expect((await restarted.getAllInputs()).length).toBe(2);
        expect(restarted.getReconciliationReport()?.synthesizedFromRows).toBe(1);
        expect(
          (await restarted.getStatus(computeRequestId(payload, "product-a")))
            ?.state,
        ).toBe("queued");
      });
    });

    test("a status whose row is gone keeps its state — no invented verdict", async () => {
      await withStore(backend, async ({ restart }) => {
        const first = await restart();
        const payload = input();
        const requestId = computeRequestId(payload, "product-a");
        await first.recordAccepted(requestId, payload, "product-a");
        // The batch was removed but its outcome was never written: the process
        // died between `removeProcessedInputs` and the terminal transition.
        await first.removeProcessedInputs([payload], "product-a");

        const restarted = await restart();

        const status = await restarted.getStatus(requestId);
        // NOT `failed`: the chain may well have accepted this transaction, and
        // reporting a failure it never gave would be worse than reporting
        // nothing. Phase 3 records the real verdict at the source.
        expect(status?.state).toBe("queued");
        expect(status?.terminal).toBe(false);
        expect(status?.errorCode).toBeUndefined();
        expect(restarted.getReconciliationReport()).toEqual({
          synthesizedFromRows: 0,
          orphanedStatuses: 1,
        });
      });
    });

    test("a terminal record with no row is not an orphan", async () => {
      await withStore(backend, async ({ restart }) => {
        const first = await restart();
        const payload = input();
        const requestId = computeRequestId(payload, "product-a");
        await first.recordAccepted(requestId, payload, "product-a");
        await first.recordTransition(requestId, "confirmed", {
          transactionHash: "0xhash",
          blockNumber: 9n,
        });
        await first.removeProcessedInputs([payload], "product-a");

        const restarted = await restart();

        // This is what every completed request looks like. Counting it would
        // make the orphan number meaningless within a day of running.
        expect(restarted.getReconciliationReport()).toEqual({
          synthesizedFromRows: 0,
          orphanedStatuses: 0,
        });
        expect((await restarted.getStatus(requestId))?.state).toBe("confirmed");
      });
    });

    test("a record that already exists is left alone", async () => {
      await withStore(backend, async ({ restart }) => {
        const first = await restart();
        const payload = input();
        const requestId = computeRequestId(payload, "product-a");
        await first.recordAccepted(requestId, payload, "product-a");
        await first.recordTransition(requestId, "submitted", {
          transactionHash: "0xhash",
        });

        // The row is still in the queue (its removal was lost with the
        // process). Reconciliation must not rewind the record to `queued`.
        const restarted = await restart();

        const status = await restarted.getStatus(requestId);
        expect(status?.state).toBe("submitted");
        expect(status?.transactionHash).toBe("0xhash");
        expect(restarted.getReconciliationReport()).toEqual({
          synthesizedFromRows: 0,
          orphanedStatuses: 0,
        });
      });
    });
  });
}

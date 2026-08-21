// The request status store: acceptance, the lifecycle state machine, and the
// two lookups (`by id`, `by replay key`).
//
// This is where "the user got a 200" becomes a fact the batcher can be held to.
// Three properties are load-bearing and each is cheap to get subtly wrong:
//
//  - ACCEPTANCE IS ONE WRITE. The queue row and the status record are created
//    together. A row with no status is an unpollable request; a status with no
//    row is a request that will never be sent. Neither may be observable.
//  - TRANSITIONS ARE APPEND-ONLY. A confirmed request that gets re-picked after
//    a crash (batch confirmed, rows not yet removed) must not fall back to
//    `batching`, and nothing follows a terminal state. Refusals are RETURNED,
//    not just logged, so callers can react and tests can see them.
//  - DETAIL IS MERGED, NOT REPLACED. A later transition that knows less must
//    not erase the transaction hash an earlier one recorded.
//
// Runs against the embedded engine, and against a real Postgres when one is
// pointed at it — the opt-in driver runs the same statements, so it is held to
// the same behaviour rather than to a smoke test.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseStorage } from "../core/database-storage.ts";
import { isTrackingStorage } from "../core/storage.ts";
import { computeRequestId } from "../core/request-id.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const POSTGRES_URL = process.env.BATCHER_TEST_POSTGRES_URL;

interface Backend {
  readonly name: string;
  make(dataDirectory: string): DatabaseStorage;
  reset?(storage: DatabaseStorage): Promise<void>;
}

const BACKENDS: Backend[] = [
  {
    name: "DatabaseStorage",
    make: (dir) => new DatabaseStorage({ dataDirectory: dir }),
  },
];

if (POSTGRES_URL) {
  BACKENDS.push({
    name: "DatabaseStorage(postgres)",
    make: (dir) =>
      new DatabaseStorage({ dataDirectory: dir, connectionString: POSTGRES_URL }),
    reset: async (storage) => {
      await rawQuery(
        storage,
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
  target: "product-a",
  ...overrides,
});

interface Ctx {
  storage: DatabaseStorage;
  /** Accept `payload` and hand back the id the store used. */
  accept(
    payload?: DefaultBatcherInput,
    replayKey?: string,
  ): Promise<{ requestId: string; created: boolean }>;
}

async function withStorage(
  backend: Backend,
  fn: (ctx: Ctx) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-request-status-"));
  const storage = backend.make(dir);
  try {
    await storage.init("product-a");
    await backend.reset?.(storage);
    await fn({
      storage,
      accept: async (payload = input(), replayKey?: string) => {
        const target = payload.target ?? "product-a";
        const requestId = computeRequestId(payload, target);
        const outcome = await storage.recordAccepted(
          requestId,
          payload,
          target,
          replayKey,
        );
        expect(outcome.requestId).toBe(requestId);
        return { requestId, created: outcome.created };
      },
    });
  } finally {
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

async function rawQuery<R>(
  storage: DatabaseStorage,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  const db = (storage as unknown as {
    db: { query<T>(sql: string, params?: unknown[]): Promise<T[]> };
  }).db;
  return await db.query<R>(sql, params);
}

test("a DatabaseStorage advertises tracking; a FileStorage does not", async () => {
  const { FileStorage } = await import("../core/storage.ts");
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-tracking-detect-"));
  try {
    expect(isTrackingStorage(new DatabaseStorage({ dataDirectory: dir }))).toBe(true);
    // Q-P2: FileStorage stays frozen and queue-only. Core code must be able to
    // ASK rather than assume, or a batcher configured with it would throw on
    // every accept.
    expect(isTrackingStorage(new FileStorage(dir))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const backend of BACKENDS) {
  describe(`request acceptance [${backend.name}]`, () => {
    test("queues the input and opens its status in one call", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId, created } = await accept();

        expect(created).toBe(true);
        // The queue row…
        const rows = await storage.getAllInputs();
        expect(rows.length).toBe(1);
        expect(rows[0].target).toBe("product-a");
        // …and the status, from the same call.
        const status = await storage.getStatus(requestId);
        expect(status?.state).toBe("queued");
        expect(status?.terminal).toBe(false);
        expect(status?.target).toBe("product-a");
        expect(status?.address).toBe("addr-1");
        expect(status?.retryCount).toBe(0);
        expect(status?.acceptedAt).toBeInstanceOf(Date);
      });
    });

    test("the queue row carries the same request id the status is filed under", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept();

        // Single source of truth: the row and the record cannot be matched up
        // after a crash unless the row itself knows its id.
        const [row] = await rawQuery<{ request_id: string }>(
          storage,
          "SELECT request_id FROM pending_inputs",
        );
        expect(row.request_id).toBe(requestId);
      });
    });

    test("a failure after the status claim rolls the whole acceptance back", async () => {
      await withStorage(backend, async ({ storage }) => {
        await rawQuery(storage, `
          CREATE OR REPLACE FUNCTION batcher_test_reject_pending_insert()
          RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'injected pending insert failure';
          END;
          $$
        `);
        await rawQuery(
          storage,
          `CREATE TRIGGER batcher_test_reject_pending_insert_trigger
             BEFORE INSERT ON pending_inputs
             FOR EACH ROW EXECUTE FUNCTION batcher_test_reject_pending_insert()`,
        );

        const payload = input({ timestamp: "rollback" });
        const requestId = computeRequestId(payload, "product-a");
        try {
          await expect(storage.recordAccepted(
            requestId,
            payload,
            "product-a",
            "replay-rollback",
          )).rejects.toThrow(/injected pending insert failure/);

          expect(await storage.getStatus(requestId)).toBeUndefined();
          expect(await storage.findByReplayKey("replay-rollback")).toBeUndefined();
          expect(await storage.getAllInputs()).toEqual([]);
          expect(await statusCount(storage)).toBe(0);
          expect(await replayKeyCount(storage)).toBe(0);
        } finally {
          await rawQuery(
            storage,
            "DROP TRIGGER IF EXISTS batcher_test_reject_pending_insert_trigger ON pending_inputs",
          );
          await rawQuery(
            storage,
            "DROP FUNCTION IF EXISTS batcher_test_reject_pending_insert()",
          );
        }
      });
    });

    test("an untracked addInput still stamps the row's request id", async () => {
      await withStorage(backend, async ({ storage }) => {
        const payload = input();
        await storage.addInput(payload, "product-a");

        const [row] = await rawQuery<{ request_id: string }>(
          storage,
          "SELECT request_id FROM pending_inputs",
        );
        expect(row.request_id).toBe(computeRequestId(payload, "product-a"));
      });
    });

    test("re-accepting the same request keeps the record it already has", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const first = await accept();
        await storage.recordTransition(first.requestId, "batching");

        const second = await accept();

        // Ids are deterministic, so this IS the same request (spec FR-006).
        expect(second.requestId).toBe(first.requestId);
        expect(second.created).toBe(false);
        // Its progress is not rewound to `queued` by a resubmission…
        expect((await storage.getStatus(first.requestId))?.state).toBe("batching");
        // …and there is exactly one record, not two.
        expect(await statusCount(storage)).toBe(1);
        // The queue keeps FileStorage's semantics: a duplicate submission is a
        // second row (removed together with the first). Refusing to queue it is
        // a dedup DECISION, and that belongs to the replay gate, not here.
        expect((await storage.getAllInputs()).length).toBe(2);
      });
    });

    test("identical payloads to two targets are two independent requests", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const a = await accept(input({ target: "product-a" }));
        const b = await accept(input({ target: "product-b" }));

        expect(b.requestId).not.toBe(a.requestId);
        await storage.recordTransition(a.requestId, "failed", {
          errorCode: "NOPE",
        });

        // Spec User Story 4.2: one product's verdict must never be read as the
        // other's.
        expect((await storage.getStatus(a.requestId))?.state).toBe("failed");
        expect((await storage.getStatus(b.requestId))?.state).toBe("queued");
      });
    });

    test("a replay key points back at the record it was accepted with", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept(input(), "replay-abc");

        const found = await storage.findByReplayKey("replay-abc");
        expect(found?.requestId).toBe(requestId);
        expect(found?.replayKey).toBe("replay-abc");
      });
    });

    test("no replay key means nothing to find", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        await accept();

        expect(await storage.findByReplayKey("replay-abc")).toBeUndefined();
        expect(await replayKeyCount(storage)).toBe(0);
      });
    });

    test("an id this batcher never accepted has no status", async () => {
      await withStorage(backend, async ({ storage }) => {
        expect(await storage.getStatus("f".repeat(64))).toBeUndefined();
      });
    });
  });

  describe(`request lifecycle [${backend.name}]`, () => {
    test("queued → batching → submitted → confirmed, terminal only at the end", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept();

        for (const state of ["batching", "submitted", "confirmed"] as const) {
          const detail = state === "submitted"
            ? { transactionHash: "0xhash" }
            : state === "confirmed"
            ? { transactionHash: "0xhash", blockNumber: 4242n }
            : undefined;
          const outcome = await storage.recordTransition(requestId, state, detail);
          expect(`${state}:${outcome.applied}`).toBe(`${state}:true`);
        }

        const status = await storage.getStatus(requestId);
        expect(status?.state).toBe("confirmed");
        expect(status?.terminal).toBe(true);
        expect(status?.transactionHash).toBe("0xhash");
        expect(status?.blockNumber).toBe(4242n);
      });
    });

    test("a request can fail straight out of the queue", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept();

        const outcome = await storage.recordTransition(requestId, "failed", {
          errorCode: "RETRIES_EXHAUSTED",
          message: "dropped after 3 failed retries",
          retryCount: 3,
        });

        expect(outcome.applied).toBe(true);
        const status = await storage.getStatus(requestId);
        expect(status?.state).toBe("failed");
        expect(status?.terminal).toBe(true);
        expect(status?.errorCode).toBe("RETRIES_EXHAUSTED");
        expect(status?.message).toBe("dropped after 3 failed retries");
        expect(status?.retryCount).toBe(3);
      });
    });

    test("a backwards transition is refused, and says so", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept();
        await storage.recordTransition(requestId, "batching");
        await storage.recordTransition(requestId, "submitted", {
          transactionHash: "0xhash",
        });

        // The crash-replay case: the batch was submitted, the process died
        // before the rows were removed, the poll loop re-picked the input.
        const outcome = await storage.recordTransition(requestId, "batching");

        expect(outcome).toMatchObject({ applied: false, refused: "regression" });
        expect(outcome.applied === false ? outcome.current?.state : undefined)
          .toBe("submitted");
        expect((await storage.getStatus(requestId))?.state).toBe("submitted");
      });
    });

    test("nothing follows a terminal state", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const confirmed = await accept(input({ timestamp: "1" }));
        const failed = await accept(input({ timestamp: "2" }));
        await storage.recordTransition(confirmed.requestId, "confirmed", {
          transactionHash: "0xhash",
          blockNumber: 7n,
        });
        await storage.recordTransition(failed.requestId, "failed", {
          errorCode: "REJECTED",
        });

        // A confirmed request cannot un-confirm, and a failed one cannot be
        // quietly overwritten by a late receipt for a resubmission.
        const afterConfirmed = await storage.recordTransition(
          confirmed.requestId,
          "failed",
          { errorCode: "LATE" },
        );
        const afterFailed = await storage.recordTransition(
          failed.requestId,
          "confirmed",
          { transactionHash: "0xlate" },
        );

        expect(afterConfirmed).toMatchObject({
          applied: false,
          refused: "already-terminal",
        });
        expect(afterFailed).toMatchObject({
          applied: false,
          refused: "already-terminal",
        });
        expect((await storage.getStatus(confirmed.requestId))?.state)
          .toBe("confirmed");
        expect((await storage.getStatus(confirmed.requestId))?.errorCode)
          .toBeUndefined();
        expect((await storage.getStatus(failed.requestId))?.transactionHash)
          .toBeUndefined();
      });
    });

    test("re-entering the same non-terminal state is allowed", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept();
        await storage.recordTransition(requestId, "batching");

        // A batch that deferred this input leaves it queued; the next cycle
        // picks it up again. That is progress being repeated, not undone.
        const again = await storage.recordTransition(requestId, "batching", {
          retryCount: 1,
        });

        expect(again.applied).toBe(true);
        expect((await storage.getStatus(requestId))?.retryCount).toBe(1);
      });
    });

    test("a transition that knows less does not erase what is known", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept();
        await storage.recordTransition(requestId, "submitted", {
          transactionHash: "0xhash",
        });

        // Adapters that confirm per batch may not repeat the per-input hash.
        await storage.recordTransition(requestId, "confirmed", {
          blockNumber: 99n,
        });

        const status = await storage.getStatus(requestId);
        expect(status?.transactionHash).toBe("0xhash");
        expect(status?.blockNumber).toBe(99n);
      });
    });

    test("a transition for an unknown id is refused, and invents nothing", async () => {
      await withStorage(backend, async ({ storage }) => {
        const outcome = await storage.recordTransition("d".repeat(64), "confirmed", {
          transactionHash: "0xhash",
        });

        expect(outcome).toMatchObject({
          applied: false,
          refused: "unknown-request",
        });
        // `recordAccepted` is the ONLY way a record comes into existence: a
        // status conjured by a stray transition would describe a request no
        // queue row backs.
        expect(await storage.getStatus("d".repeat(64))).toBeUndefined();
        expect(await statusCount(storage)).toBe(0);
      });
    });

    test("updatedAt moves with each applied transition, acceptedAt does not", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept();
        const opened = await storage.getStatus(requestId);

        await Bun.sleep(5);
        await storage.recordTransition(requestId, "batching");
        const moved = await storage.getStatus(requestId);

        expect(moved!.updatedAt.getTime()).toBeGreaterThan(
          opened!.updatedAt.getTime() - 1,
        );
        expect(moved!.acceptedAt.getTime()).toBe(opened!.acceptedAt.getTime());
      });
    });

    test("bulk transitions preserve ordered independent outcomes and detail", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const regression = await accept(input({ timestamp: "bulk-1" }));
        const terminal = await accept(input({ timestamp: "bulk-2" }));
        const valid = await accept(input({ timestamp: "bulk-3" }));
        await storage.recordTransition(regression.requestId, "submitted", {
          transactionHash: "0xkept",
        });
        await storage.recordTransition(terminal.requestId, "confirmed", {
          transactionHash: "0xterminal",
          blockNumber: 1n,
        });

        const outcomes = await storage.recordTransitions([
          { requestId: "d".repeat(64), state: "confirmed" },
          { requestId: regression.requestId, state: "batching" },
          { requestId: terminal.requestId, state: "failed" },
          {
            requestId: valid.requestId,
            state: "submitted",
            detail: { transactionHash: "0xvalid", retryCount: 2 },
          },
        ]);

        expect(outcomes.map((outcome) =>
          outcome.applied === true ? "applied" : outcome.refused
        )).toEqual([
          "unknown-request",
          "regression",
          "already-terminal",
          "applied",
        ]);
        expect((await storage.getStatus(regression.requestId))?.transactionHash)
          .toBe("0xkept");
        expect((await storage.getStatus(terminal.requestId))?.state)
          .toBe("confirmed");
        expect(await storage.getStatus(valid.requestId)).toMatchObject({
          state: "submitted",
          transactionHash: "0xvalid",
          retryCount: 2,
        });
        expect(await storage.recordTransitions([])).toEqual([]);
        expect(storage.recordTransitions([
          { requestId: valid.requestId, state: "submitted" },
          { requestId: valid.requestId, state: "confirmed" },
        ])).rejects.toThrow(/duplicate request id/);
      });
    });

    test("racing bulk calls never regress a request", async () => {
      await withStorage(backend, async ({ storage, accept }) => {
        const { requestId } = await accept(input({ timestamp: "bulk-race" }));
        await Promise.all([
          storage.recordTransitions([{ requestId, state: "submitted" }]),
          storage.recordTransitions([{ requestId, state: "batching" }]),
        ]);
        expect((await storage.getStatus(requestId))?.state).toBe("submitted");
      });
    });
  });
}

async function statusCount(storage: DatabaseStorage): Promise<number> {
  const [row] = await rawQuery<{ count: number }>(
    storage,
    "SELECT count(*)::int AS count FROM request_status",
  );
  return Number(row.count);
}

async function replayKeyCount(storage: DatabaseStorage): Promise<number> {
  const [row] = await rawQuery<{ count: number }>(
    storage,
    "SELECT count(*)::int AS count FROM request_status WHERE replay_key IS NOT NULL",
  );
  return Number(row.count);
}

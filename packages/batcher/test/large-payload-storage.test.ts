// Payload size is not a storage-failure class (project 00020, spec FR-4).
//
// The defect this suite exists for: `pending_inputs` used to be keyed on
// `content_key`, and `content_key` embeds the ENTIRE submitted payload
// (`addressType|target|address|timestamp|signature|input`). PostgreSQL's btree
// tuple ceiling is 2704 bytes — one third of an 8 KB page — so any input whose
// content key crossed it could not be indexed at all. The insert failed, the
// acceptance transaction rolled back, and the caller got a 500 instead of the
// `requestId` the whole tracking feature exists to hand out.
//
// That is not a corner case for this batcher: 00017's deep suite measured a
// MINIMAL real Midnight contract call at 3307 bytes, which yields a ~6.7 KB
// content key. Every real transaction the flagship adapter submits was over the
// line, on both the embedded and the connected rung — the limit is
// PostgreSQL's and the DDL is shared, so PgLite fails identically.
//
// The fix re-keys the table on `request_id` (sha256 of the content key), which
// is 64 hex characters no matter how large the payload is. These tests
// therefore assert the WHOLE path at chain-sized payloads, not just the insert:
// accept, poll, list in order, retry-charge, and remove. Every one of them used
// to reach `pending_inputs` through the oversized key.
//
// Runs against the embedded engine, and against a real Postgres when one is
// pointed at it (`BATCHER_TEST_POSTGRES_URL`) — same statements, same ceiling,
// so both are held to the same result rather than one being taken on trust.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseStorage } from "../core/database-storage.ts";
import { buildRequestKey, computeRequestId } from "../core/request-id.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const POSTGRES_URL = process.env.BATCHER_TEST_POSTGRES_URL;

/** PostgreSQL's btree tuple ceiling: one third of an 8 KB page. */
const BTREE_MAX_BYTES = 2704;

interface Backend {
  readonly name: string;
  make(dataDirectory: string): DatabaseStorage;
  reset?(storage: DatabaseStorage): Promise<void>;
}

async function rawExec(storage: DatabaseStorage, sql: string): Promise<void> {
  const db = (storage as unknown as {
    db: { query(sql: string, params?: unknown[]): Promise<unknown> };
  }).db;
  await db.query(sql, []);
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
    reset: (storage) =>
      rawExec(
        storage,
        "TRUNCATE pending_inputs, request_status, replay_keys RESTART IDENTITY",
      ),
  });
}

/**
 * Deterministic HIGH-ENTROPY hex, `bytes` bytes' worth (2 chars each).
 *
 * Entropy is load-bearing, not decoration. A btree index tuple is PGLZ
 * -compressed before the size check, so a fixture built from `"ab".repeat(n)`
 * shrinks to nothing and the oversized key sails straight in — measured: the
 * first version of this suite passed 7/7 against the OLD schema for exactly
 * that reason. A serialized Midnight transaction is ciphertext and proofs; it
 * does not compress, which is why the real thing overflowed and a repetitive
 * stand-in does not. A sha256 chain reproduces that property and stays
 * byte-identical between runs, engines and machines, so the request id it
 * hashes to is stable.
 */
function entropyHex(bytes: number, seed: string): string {
  let out = "";
  let block = createHash("sha256").update(seed, "utf8").digest();
  while (out.length < bytes * 2) {
    out += block.toString("hex");
    block = createHash("sha256").update(block).digest();
  }
  return out.slice(0, bytes * 2);
}

/**
 * A submission shaped like the ones that broke: a serialized Midnight
 * transaction carried as hex inside a small JSON envelope.
 *
 * `txBytes` is the size of the transaction itself; the hex doubles it and the
 * envelope plus the five other content-key fields add a little more.
 */
const chainSizedInput = (
  txBytes: number,
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "mn_shield-addr_test1abcdefghijklmnopqrstuvwxyz0123456789",
  input: JSON.stringify({
    tx: entropyHex(txBytes, `tx-${txBytes}`),
    txStage: "balanced",
  }),
  timestamp: "1754350000000",
  signature: "0x" + entropyHex(64, `sig-${txBytes}`),
  target: "product-a",
  ...overrides,
});

async function withStorage(
  backend: Backend,
  fn: (storage: DatabaseStorage) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-large-payload-"));
  const storage = backend.make(dir);
  try {
    await storage.init("product-a");
    await backend.reset?.(storage);
    await fn(storage);
  } finally {
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("content key size is not an identity", () => {
  test("the fixture really is over the btree ceiling", () => {
    // Guards the guard: a fixture that quietly shrank would turn this whole
    // suite green without proving anything.
    const key = buildRequestKey(chainSizedInput(3307), "product-a");
    expect(Buffer.byteLength(key, "utf8")).toBeGreaterThan(BTREE_MAX_BYTES);
    // The request id is fixed width no matter how big the key is.
    expect(computeRequestId(chainSizedInput(3307), "product-a")).toHaveLength(64);
  });
});

for (const backend of BACKENDS) {
  describe(`${backend.name}: chain-sized payloads`, () => {
    test("accepts and tracks a real-sized Midnight transaction end to end", async () => {
      await withStorage(backend, async (storage) => {
        // 3307 bytes is 00017's measured MINIMUM real contract call.
        const input = chainSizedInput(3307);
        const requestId = computeRequestId(input, "product-a");

        const outcome = await storage.recordAccepted(
          requestId,
          input,
          "product-a",
        );
        expect(outcome.requestId).toBe(requestId);
        expect(outcome.created).toBe(true);
        expect(outcome.record.state).toBe("queued");

        // Pollable: the promise a 200 makes.
        const status = await storage.getStatus(requestId);
        expect(status?.requestId).toBe(requestId);
        expect(status?.state).toBe("queued");

        // Queued: the batch will actually pick it up, byte-for-byte.
        const queued = await storage.getAllInputs();
        expect(queued).toHaveLength(1);
        expect(queued[0]!.input).toBe(input.input);

        // Removable at the new key: `removeProcessedInputs` takes the caller's
        // input, not a row id, so this is the path that used to compare the
        // whole payload.
        await storage.removeProcessedInputs([input], "product-a");
        expect(await storage.getAllInputs()).toHaveLength(0);
      });
    });

    test("accepts a content key well past 8 KB (FR-4)", async () => {
      await withStorage(backend, async (storage) => {
        const input = chainSizedInput(6000);
        const key = buildRequestKey(input, "product-a");
        expect(Buffer.byteLength(key, "utf8")).toBeGreaterThan(8 * 1024);

        const requestId = computeRequestId(input, "product-a");
        const outcome = await storage.recordAccepted(
          requestId,
          input,
          "product-a",
        );
        expect(outcome.created).toBe(true);
        expect((await storage.getAllInputs())[0]!.input).toBe(input.input);
      });
    });

    test("untracked addInput takes an oversized payload too", async () => {
      await withStorage(backend, async (storage) => {
        // The queue-only write path has no status record behind it and reaches
        // `pending_inputs` on its own; it overflowed the old key just as hard.
        await storage.addInput(chainSizedInput(4000));
        const { count, size } = await storage.getInputCountAndSize();
        expect(count).toBe(1);
        expect(size).toBeGreaterThan(8 * 1024);
      });
    });

    test("duplicate oversized rows stay two rows, one identity, and are removed together", async () => {
      await withStorage(backend, async (storage) => {
        // No replay key: `FileStorage` has always taken the second row, and the
        // re-key must not turn "two rows sharing an identity" into a primary
        // key collision.
        const input = chainSizedInput(3307);
        const requestId = computeRequestId(input, "product-a");

        const first = await storage.recordAccepted(requestId, input, "product-a");
        const second = await storage.recordAccepted(requestId, input, "product-a");
        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(second.requestId).toBe(requestId);
        expect(await storage.getAllInputs()).toHaveLength(2);

        await storage.removeProcessedInputs([input], "product-a");
        expect(await storage.getAllInputs()).toHaveLength(0);
      });
    });

    test("insertion order survives at chain size", async () => {
      await withStorage(backend, async (storage) => {
        // `seq` is what orders the queue; re-keying the table must not reorder
        // it. Distinct payloads, so distinct request ids.
        const inputs = [3307, 3400, 3500].map((size) =>
          chainSizedInput(size, { timestamp: `17543500000${size}` })
        );
        for (const input of inputs) {
          await storage.recordAccepted(
            computeRequestId(input, "product-a"),
            input,
            "product-a",
          );
        }
        const queued = await storage.getAllInputs();
        expect(queued.map((row) => row.input)).toEqual(
          inputs.map((row) => row.input),
        );
        expect(
          (await storage.getInputsByTarget("product-a", "product-a"))
            .map((row) => row.input),
        ).toEqual(inputs.map((row) => row.input));
      });
    });

    test("retry charging and dropping reach an oversized row", async () => {
      await withStorage(backend, async (storage) => {
        const input = chainSizedInput(3307);
        await storage.recordAccepted(
          computeRequestId(input, "product-a"),
          input,
          "product-a",
        );

        // Charged, not dropped: the stored count goes 0 → 1 under a limit of 2.
        expect(await storage.incrementRetryCount([input], "product-a", 2))
          .toHaveLength(0);
        expect(await storage.getAllInputs()).toHaveLength(1);

        // Charged again, now at the limit: dropped and REPORTED, so the caller
        // waiting on it can be told.
        const dropped = await storage.incrementRetryCount(
          [input],
          "product-a",
          2,
        );
        expect(dropped).toHaveLength(1);
        expect(dropped[0]!.input).toBe(input.input);
        expect(await storage.getAllInputs()).toHaveLength(0);
      });
    });
  });
}

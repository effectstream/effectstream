// SC-007: two batchers, one database, identical target names.
//
// This is the property the whole schema mechanism exists for, and it has to be
// measured at the BATCHER level rather than the storage level, because the
// things that would leak are things only the accept path produces: request
// ids, replay-key claims, and the queue rows a batch loop selects.
//
// Why identical target names are the interesting case, and not a contrived
// one: `paimaL2` is the target name used by four different products in this
// repository. Two batchers sharing a database without schema isolation would
// therefore fetch each other's queue rows and submit each other's inputs —
// with their own funds.
//
// Requires a real PostgreSQL (`BATCHER_TEST_POSTGRES_URL`). It cannot run
// against the development PgLite gateway: that server multiplexes every client
// onto ONE session, so a schema cannot be pinned there at all and the batcher
// refuses to start rather than repoint the engine's connections. That refusal
// is covered in `connected-storage.test.ts`.

import { describe, expect, test } from "bun:test";

import { createNewBatcher } from "../core/batcher.ts";
import { DatabaseStorage } from "../core/storage.ts";
import type { DatabaseConnectionConfig } from "../core/database-storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

// Deliberately the SAME target on both sides.
const TARGET = "paimaL2";

// Read once: the admission window refuses stale signed timestamps, and
// re-reading the clock per input would change the request id (plan Q-P11.1).
const NOW = Date.now();

const POSTGRES_URL = process.env.BATCHER_TEST_POSTGRES_URL;

function postgresConnection(max: number): DatabaseConnectionConfig {
  const url = new URL(POSTGRES_URL!);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    max,
  };
}

const input = (nonce: string): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-shared",
  input: JSON.stringify({ nonce }),
  timestamp: String(NOW),
  signature: `0xsignature-${nonce}`,
  target: TARGET,
});

const confirmingAdapter = (hash: string) => ({
  verifySignature: () => true,
  validateInput: () => ({ valid: true }),
  buildBatchData: (inputs: DefaultBatcherInput[]) =>
    inputs.length === 0 ? null : { selectedInputs: inputs, data: { inputs } },
  estimateBatchFee: () => 0n,
  submitBatch: async (data: { inputs: DefaultBatcherInput[] }) => ({
    hash,
    submitted: data.inputs,
  }),
  waitForTransactionReceipt: async () => ({
    hash,
    blockNumber: 7n,
    status: 1,
  }),
  getAccountAddress: () => "scripted",
  getChainName: () => "scripted",
  isReady: () => true,
  getBlockNumber: async () => 7n,
});

async function makeBatcher(schema: string, hash: string) {
  const storage = new DatabaseStorage({
    connection: postgresConnection(2),
    schema,
  });
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
  }, storage as any);
  batcher.addBlockchainAdapter(TARGET, confirmingAdapter(hash) as any, {
    criteriaType: "size",
    maxBatchSize: 1_000_000,
  });
  await batcher.init({ startPolling: false });
  return { batcher, storage };
}

async function dropBatcherSchemas(): Promise<void> {
  const specifier = "pg";
  const pg: any = await import(specifier);
  const Pool = pg.Pool ?? pg.default?.Pool;
  const pool = new Pool({ ...postgresConnection(1) });
  pool.on("error", () => {});
  try {
    const rows = await pool.query(
      "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'batcher\\_iso%'",
    );
    for (const row of rows.rows) {
      await pool.query(`DROP SCHEMA IF EXISTS "${row.nspname}" CASCADE`);
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

describe.if(!!POSTGRES_URL)("two batchers on one database", () => {
  test("identical targets, identical payloads, zero cross-visibility", async () => {
    await dropBatcherSchemas();
    const left = await makeBatcher("isoleft", "0xleft");
    const right = await makeBatcher("isoright", "0xright");
    try {
      // Byte-identical submissions — same address, same timestamp, same
      // signature, same target — so every identity the batcher computes is
      // identical on both sides. Only the schema differs.
      const payload = input("shared");
      const a = await left.batcher.batchInput(payload, "no-wait");
      const b = await right.batcher.batchInput(payload, "no-wait");

      // Same content ⇒ same deterministic id, and NEITHER is a duplicate of
      // the other: the replay-key claim is per-schema.
      expect(a.requestId).toBe(b.requestId);
      expect(a.duplicate ?? false).toBe(false);
      expect(b.duplicate ?? false).toBe(false);

      // One queue row each, not two on either side.
      expect((await left.storage.getAllInputs()).length).toBe(1);
      expect((await right.storage.getAllInputs()).length).toBe(1);

      // Dedup still fires WITHIN a schema — the isolation did not disable it.
      const again = await left.batcher.batchInput(payload, "no-wait");
      expect(again.duplicate).toBe(true);
      expect(again.requestId).toBe(a.requestId);
      expect((await left.storage.getAllInputs()).length).toBe(1);

      // Full lifecycle on the LEFT only.
      await left.batcher.forceProcessBatches();

      const leftStatus = await left.batcher.getRequestStatus(a.requestId);
      expect(leftStatus?.state).toBe("confirmed");
      expect(leftStatus?.transactionHash).toBe("0xleft");

      // The right batcher has the same id and has heard nothing about it: its
      // request is still queued, with no hash from a chain it never used.
      const rightStatus = await right.batcher.getRequestStatus(b.requestId);
      expect(rightStatus?.state).toBe("queued");
      expect(rightStatus?.transactionHash).toBeUndefined();

      // The left batch consumed only its own row.
      expect((await left.storage.getAllInputs()).length).toBe(0);
      expect((await right.storage.getAllInputs()).length).toBe(1);

      // And now the right one runs its own lifecycle, unaffected by the fact
      // that a request with this exact id already reached a chain elsewhere.
      await right.batcher.forceProcessBatches();
      const rightFinal = await right.batcher.getRequestStatus(b.requestId);
      expect(rightFinal?.state).toBe("confirmed");
      expect(rightFinal?.transactionHash).toBe("0xright");

      // The left record was not overwritten by the right one's verdict.
      expect(
        (await left.batcher.getRequestStatus(a.requestId))?.transactionHash,
      ).toBe("0xleft");
    } finally {
      await (left.batcher as any).gracefulShutdown().catch(() => {});
      await (right.batcher as any).gracefulShutdown().catch(() => {});
      await left.storage.close().catch(() => {});
      await right.storage.close().catch(() => {});
    }
  }, 180_000);

  test("each batcher's tables live in its own schema and nowhere else", async () => {
    await dropBatcherSchemas();
    const left = await makeBatcher("isoschemaleft", "0xleft");
    const right = await makeBatcher("isoschemaright", "0xright");
    try {
      await left.batcher.batchInput(input("left-only"), "no-wait");

      const counts = await (left.storage as any).db.query(
        `SELECT
           (SELECT count(*)::int FROM batcher_isoschemaleft.pending_inputs)  AS left_rows,
           (SELECT count(*)::int FROM batcher_isoschemaright.pending_inputs) AS right_rows`,
        [],
      );
      // Read with QUALIFIED names, so this observes the tables themselves
      // rather than whatever search_path happens to say.
      expect(counts.rows[0].left_rows).toBe(1);
      expect(counts.rows[0].right_rows).toBe(0);
    } finally {
      await (left.batcher as any).gracefulShutdown().catch(() => {});
      await (right.batcher as any).gracefulShutdown().catch(() => {});
      await left.storage.close().catch(() => {});
      await right.storage.close().catch(() => {});
    }
  }, 180_000);
});

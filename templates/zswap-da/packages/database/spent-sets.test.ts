import { afterAll, beforeAll, expect, test } from "bun:test";

// Verifies the nullifiers table (merged from seen_nullifiers + spent_nullifiers)
// and its queries end-to-end against an in-memory PGlite served over the pg wire
// protocol — no Docker / external Postgres needed. Regression guard for the
// hand-written pgtyped IR (param offsets) and the migration SQL.
process.env["DB_USER"] ??= "postgres";
process.env["DB_NAME"] ??= "postgres";
process.env["PGLITE_DATA_DIR"] ??= "memory://";

const { startPglite } = await import("@effectstream/db/start-pglite");
const pg = (await import("pg")).default;
const {
  migrationTable,
  upsertNullifier,
  isNullifierSpent,
  markNullifierMatched,
  findUnmatchedNullifier,
  pruneStaleNullifiers,
} = await import("@zswap-da/database");

const PORT = 54329;
let handle: { close: () => Promise<void> };
let client: InstanceType<typeof pg.Client>;

beforeAll(async () => {
  handle = await startPglite(PORT);
  client = new pg.Client({
    host: "127.0.0.1",
    port: PORT,
    user: "postgres",
    database: "postgres",
  });
  await client.connect();
  for (const migration of migrationTable) {
    await client.query(migration.sql);
  }
});

afterAll(async () => {
  try {
    await handle?.close();
  } catch { /* noop */ }
});

test("upsertNullifier: insert then isNullifierSpent returns row, absent nullifier returns empty", async () => {
  await upsertNullifier.run({ nullifier: "deadbeef", height: 7 }, client);
  expect((await isNullifierSpent.run({ nullifier: "deadbeef" }, client)).length).toBe(1);
  expect((await isNullifierSpent.run({ nullifier: "cafe" }, client)).length).toBe(0);
});

test("upsertNullifier is idempotent (ON CONFLICT DO NOTHING)", async () => {
  await upsertNullifier.run({ nullifier: "dup", height: 1 }, client);
  await upsertNullifier.run({ nullifier: "dup", height: 2 }, client);
  expect((await isNullifierSpent.run({ nullifier: "dup" }, client)).length).toBe(1);
});

test("findUnmatchedNullifier: returns row when offer_matched=false, empty after markNullifierMatched", async () => {
  await upsertNullifier.run({ nullifier: "early", height: 5 }, client);
  expect((await findUnmatchedNullifier.run({ nullifier: "early" }, client)).length).toBe(1);
  await markNullifierMatched.run({ nullifier: "early" }, client);
  expect((await findUnmatchedNullifier.run({ nullifier: "early" }, client)).length).toBe(0);
  // isNullifierSpent still returns the row (offer_matched=true is still a spent record)
  expect((await isNullifierSpent.run({ nullifier: "early" }, client)).length).toBe(1);
});

test("pruneStaleNullifiers: removes unmatched rows older than cutoff, keeps matched rows", async () => {
  await client.query(`
    INSERT INTO nullifiers (nullifier, height, recorded_at, offer_matched)
    VALUES
      ('stale_unmatched', 1, NOW() - INTERVAL '31 days', false),
      ('fresh_unmatched', 2, NOW(),                      false),
      ('stale_matched',   3, NOW() - INTERVAL '31 days', true)
  `);
  await pruneStaleNullifiers.run({ cutoff_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, client);
  expect((await isNullifierSpent.run({ nullifier: "stale_unmatched" }, client)).length).toBe(0);
  expect((await isNullifierSpent.run({ nullifier: "fresh_unmatched" }, client)).length).toBe(1);
  expect((await isNullifierSpent.run({ nullifier: "stale_matched" }, client)).length).toBe(1);
});

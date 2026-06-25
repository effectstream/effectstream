import { afterAll, beforeAll, expect, test } from "bun:test";

// Verifies the 002-liveness-sets migration + the created_unshielded / known_roots
// queries end-to-end against an in-memory PGlite over the pg wire protocol — no
// Docker / external Postgres. Regression guard for the hand-written pgtyped IR
// (param offsets) and the migration SQL. Mirrors spent-sets.test.ts.
process.env["DB_USER"] ??= "postgres";
process.env["DB_NAME"] ??= "postgres";
process.env["PGLITE_DATA_DIR"] ??= "memory://";

const { startPglite } = await import("@effectstream/db/start-pglite");
const pg = (await import("pg")).default;
const {
  migrationTable,
  insertCreatedUnshielded,
  deleteCreatedUnshielded,
  isUnshieldedCreated,
  upsertKnownRoot,
  isKnownRoot,
  pruneKnownRoots,
} = await import("@zswap-da/database");

const PORT = 54331;
let handle: { close: () => Promise<void> };
let client: InstanceType<typeof pg.Client>;

beforeAll(async () => {
  handle = await startPglite(PORT);
  client = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", database: "postgres" });
  await client.connect();
  for (const migration of migrationTable) {
    await client.query(migration.sql);
  }
});

afterAll(async () => {
  // Close server/DB without a client Terminate (PGlite WASM throws on it).
  try {
    await handle?.close();
  } catch { /* noop */ }
});

test("created_unshielded: insert, present lookup, partial-mismatch absent", async () => {
  const ref = { owner: "owner1", intent_hash: "ih1", output_no: 2 };
  await insertCreatedUnshielded.run({ ...ref, height: 11 }, client);
  expect((await isUnshieldedCreated.run(ref, client)).length).toBe(1);
  expect((await isUnshieldedCreated.run({ ...ref, output_no: 3 }, client)).length).toBe(0);
});

test("created_unshielded insert is idempotent (ON CONFLICT DO NOTHING)", async () => {
  const ref = { owner: "dup", intent_hash: "ihdup", output_no: 0 };
  await insertCreatedUnshielded.run({ ...ref, height: 1 }, client);
  await insertCreatedUnshielded.run({ ...ref, height: 2 }, client);
  expect((await isUnshieldedCreated.run(ref, client)).length).toBe(1);
});

test("deleteCreatedUnshielded: spend removes the row (liveness check fails after)", async () => {
  const ref = { owner: "spender", intent_hash: "ihspend", output_no: 0 };
  await insertCreatedUnshielded.run({ ...ref, height: 5 }, client);
  expect((await isUnshieldedCreated.run(ref, client)).length).toBe(1);
  await deleteCreatedUnshielded.run(ref, client);
  expect((await isUnshieldedCreated.run(ref, client)).length).toBe(0);
});

test("deleteCreatedUnshielded on absent row is a no-op", async () => {
  await deleteCreatedUnshielded.run({ owner: "ghost", intent_hash: "ih", output_no: 0 }, client);
  // no error thrown
});

test("known_roots: upsert, present lookup, absent lookup", async () => {
  await upsertKnownRoot.run({ root: "rootA", height: 100, last_seen_ms: 1000 }, client);
  expect((await isKnownRoot.run({ root: "rootA" }, client)).length).toBe(1);
  expect((await isKnownRoot.run({ root: "nope" }, client)).length).toBe(0);
});

test("upsertKnownRoot refreshes height + last_seen_ms on conflict", async () => {
  await upsertKnownRoot.run({ root: "rootB", height: 5, last_seen_ms: 500 }, client);
  await upsertKnownRoot.run({ root: "rootB", height: 9, last_seen_ms: 900 }, client);
  const rows = await client.query("SELECT height, last_seen_ms FROM known_roots WHERE root = 'rootB'");
  expect(Number(rows.rows[0].height)).toBe(9);
  expect(Number(rows.rows[0].last_seen_ms)).toBe(900);
});

test("pruneKnownRoots drops aged roots but never the latest height", async () => {
  await client.query("DELETE FROM known_roots");
  // old (age out), mid (age out), latest (must survive even though it's 'old')
  await upsertKnownRoot.run({ root: "old", height: 10, last_seen_ms: 1_000 }, client);
  await upsertKnownRoot.run({ root: "mid", height: 20, last_seen_ms: 2_000 }, client);
  await upsertKnownRoot.run({ root: "latest", height: 30, last_seen_ms: 1_500 }, client);
  // cutoff 1_900 → "old" (1000) and "latest" (1500) are below it, "mid" (2000) is not.
  // "latest" has MAX(height)=30 so it must be retained despite being below cutoff.
  await pruneKnownRoots.run({ cutoff_ms: 1_900 }, client);
  expect((await isKnownRoot.run({ root: "old" }, client)).length).toBe(0);
  expect((await isKnownRoot.run({ root: "mid" }, client)).length).toBe(1);
  expect((await isKnownRoot.run({ root: "latest" }, client)).length).toBe(1);
});

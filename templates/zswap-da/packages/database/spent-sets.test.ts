import { afterAll, beforeAll, expect, test } from "bun:test";

// Verifies the 001-spent-sets migration + the spent_* queries end-to-end
// against an in-memory PGlite served over the pg wire protocol — no Docker /
// external Postgres needed. This is the regression guard for the hand-written
// pgtyped IR (param offsets) and the migration SQL.
process.env["DB_USER"] ??= "postgres";
process.env["DB_NAME"] ??= "postgres";
process.env["PGLITE_DATA_DIR"] ??= "memory://";

const { startPglite } = await import("@effectstream/db/start-pglite");
const pg = (await import("pg")).default;
const {
  migrationTable,
  insertSpentNullifier,
  isNullifierSpent,
  insertSpentUnshielded,
  isUnshieldedSpent,
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
  // Close the server/DB without sending a client Terminate: PGlite's WASM
  // throws when it processes the Terminate on socket teardown (a PGlite +
  // pg-gateway + Bun quirk, unrelated to the assertions, which have run).
  try {
    await handle?.close();
  } catch { /* noop */ }
});

test("spent_nullifiers: insert then lookup, and absent lookup", async () => {
  await insertSpentNullifier.run({ nullifier: "deadbeef", height: 7 }, client);
  expect((await isNullifierSpent.run({ nullifier: "deadbeef" }, client)).length).toBe(1);
  expect((await isNullifierSpent.run({ nullifier: "cafe" }, client)).length).toBe(0);
});

test("insertSpentNullifier is idempotent (ON CONFLICT DO NOTHING)", async () => {
  await insertSpentNullifier.run({ nullifier: "dup", height: 1 }, client);
  await insertSpentNullifier.run({ nullifier: "dup", height: 2 }, client);
  expect((await isNullifierSpent.run({ nullifier: "dup" }, client)).length).toBe(1);
});

test("spent_unshielded: triple insert then lookup, and partial-mismatch absent", async () => {
  const ref = { owner: "owner1", intent_hash: "ih1", output_no: 3 };
  await insertSpentUnshielded.run({ ...ref, height: 9 }, client);
  expect((await isUnshieldedSpent.run(ref, client)).length).toBe(1);
  // Same owner/intent but different output index must NOT match.
  expect(
    (await isUnshieldedSpent.run({ ...ref, output_no: 4 }, client)).length,
  ).toBe(0);
});

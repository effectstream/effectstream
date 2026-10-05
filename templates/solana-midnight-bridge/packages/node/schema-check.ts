// The start-up schema check (plan 00058 Interfaces D-6).
//
// @effectstream/runtime applies a template migration only while it processes the block equal to
// the migration's `blockHeight` (default 1): node-sdk/db/src/migrations.ts
// `getMigrationsForBlockHeight`, called once per block by node-sdk/runtime/src/process-blocks.ts.
// So `001-contract-delivery.sql` runs on a FRESH database only; on a database a 00050 node synced
// past block 1 it would silently never run, and the node would then fail on its first query of a
// missing column. This check turns that into a clear refusal at start: wipe the database and
// re-sync (the node re-syncs from the deployment's start heights by design, US4).
//
// If a future runtime applies new entries to synced databases, the check stays as a guard.

export const CONTRACT_DELIVERY_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ["bridge_transfers", "recipient_kind"],
  ["relayer_jobs", "undeliverable_code"],
  ["relayer_jobs", "undeliverable_reason"],
  ["relayer_jobs", "undeliverable_at"],
  ["relayer_jobs", "delivery"],
];

export const SCHEMA_WIPE_MESSAGE =
  "this database was created by an older bridge node: it lacks the contract-delivery columns " +
  "(00058), and the runtime applies a new migration only at block 1. Wipe the database and " +
  "re-sync: the node re-syncs every transfer from the deployment's start heights.";

export type SchemaQuery = (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

export type SchemaVerdict =
  | { ok: true; fresh: boolean }
  | { ok: false; missing: string[] };

/**
 * `fresh`: the template's tables do not exist yet (the migrations will create them at block 1).
 * Otherwise every contract-delivery column must exist.
 */
export async function checkContractDeliverySchema(query: SchemaQuery): Promise<SchemaVerdict> {
  const r = await query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_name IN ('bridge_transfers', 'relayer_jobs')`,
  );
  const have = new Set(r.rows.map((x) => `${String(x.table_name)}.${String(x.column_name)}`));
  if (![...have].some((c) => c.startsWith("bridge_transfers."))) return { ok: true, fresh: true };
  const missing = CONTRACT_DELIVERY_COLUMNS.map(([t, c]) => `${t}.${c}`).filter((c) => !have.has(c));
  return missing.length === 0 ? { ok: true, fresh: false } : { ok: false, missing };
}

/** Throws (the node exits) when the database is an older node's. */
export async function assertContractDeliverySchema(query: SchemaQuery): Promise<SchemaVerdict & { ok: true }> {
  const v = await checkContractDeliverySchema(query);
  if (!v.ok) throw new Error(`${SCHEMA_WIPE_MESSAGE} (missing: ${v.missing.join(", ")})`);
  return v;
}

/**
 * In-memory DB *content fingerprints* for test comparison.
 *
 * NOT to be confused with `@effectstream/db`'s snapshot-handler.ts, which does
 * `pg_dump`-style snapshots for retention/recovery. These snapshots never touch
 * disk: they hash every row of every table so two databases can be compared
 * table-by-table, row-by-row (a file hash of the on-disk data dir is useless —
 * the physical layout churns with background-writer / vacuum activity and is
 * not a pure function of the committed rows).
 *
 * Used by consistency.test.ts to assert the engine builds the *same* database
 * regardless of how it got there (one clean run, or stop/restart).
 */
import { createHash } from "node:crypto";
import type pg from "pg";

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const DEFAULT_SCHEMAS = ["effectstream", "public", "primitives"];

/**
 * `rollup_input_result.effectstream_tx_hash` is filled from `Math.random()`
 * (runtime/src/process-blocks.ts), so it differs between two otherwise-identical
 * runs. It is only written for scheduled STF inputs (never on the noop-STF test
 * path), so excluding it is a no-op for the current tests — but it keeps the
 * helper correct if reused against a config that runs real STFs.
 */
export const VOLATILE_COLUMNS = ["effectstream_tx_hash"];

/**
 * Sync-internal bookkeeping. The page queue legitimately differs after a
 * restart even in a correct engine, and the version/migration/config-snapshot
 * tables are engine plumbing rather than observable app state. Excluded when
 * asserting "the resumed DB reaches the same *state* as a clean sync".
 */
export const SYNC_BOOKKEEPING_TABLES = [
  "sync_protocol_pagination",
  "sync_protocol_block_hash",
  "effectstream_version_history",
  "effectstream_expected_version",
  "effectstream_migration_history",
  "sync_protocol_config_snapshot",
];

/**
 * `sync_protocol_block_hash` records one row per source block *as committed*,
 * so its granularity follows commit granularity: empty-block coalescing folds a
 * run into a single transaction and therefore records only that run's endpoint.
 * Two runs that reach the same state with coalescing on and off hold the same
 * app state but different amounts of this diagnostic history.
 *
 * That is by design and accounted for — `detectReorg` reports
 * `forkBlockLowerBound` so a gap in recorded history widens the reported
 * affected range rather than understating it.
 */
export const COMMIT_GRANULARITY_TABLES = ["sync_protocol_block_hash"];

export type TableFingerprint = {
  rowCount: number;
  /** md5 over the ascending-sorted per-row hashes (order-independent). */
  fingerprint: string;
  /** Ascending-sorted per-row md5s; kept for richer diffs if ever needed. */
  rowHashes: string[];
};

/** Keyed by `"<schema>.<table>"`. */
export type ConsistencySnapshot = Map<string, TableFingerprint>;

export type SnapshotOpts = {
  /** Schemas to enumerate. Default: effectstream, public, primitives. */
  schemas?: string[];
  /** Bare table names (any schema) to skip entirely. */
  excludeTables?: string[];
  /** Column names to drop before hashing rows (merged with VOLATILE_COLUMNS). */
  excludeColumns?: string[];
};

const quoteIdent = (id: string) => `"${id.replace(/"/g, '""')}"`;

/**
 * Hash the full content of every base table in the given schemas.
 *
 * Each row is hashed as `md5(concat_ws(',', quote_nullable(col::text), …))` over
 * its included columns. Each column is cast to text individually (bytea → `\x…`
 * hex, json/jsonb → canonical text), wrapped in `quote_nullable` so a SQL NULL
 * (rendered as the bare token `NULL`) is distinguishable from the literal string
 * `'NULL'`, and joined with a separator — deterministic given identical inserts.
 * Rows are sorted by their hash before folding into the table fingerprint, so
 * insertion order / serial id ordering does not matter.
 *
 * NB: we hash per-column rather than via a composite `ROW(<cols>)::text` cast so
 * NULL handling is explicit — `quote_nullable` renders a SQL NULL as the bare
 * token `NULL`, distinct from the literal string `'NULL'`, which the composite
 * cast conflates. Per-column casts also keep the rendering of each scalar type
 * (bytea → `\x…` hex, json/jsonb → canonical text) under our direct control.
 */
export async function dumpConsistencySnapshot(
  pool: pg.Pool,
  opts: SnapshotOpts = {},
): Promise<ConsistencySnapshot> {
  const schemas = opts.schemas ?? DEFAULT_SCHEMAS;
  const excludeTables = new Set(opts.excludeTables ?? []);
  const excludeColumns = new Set([
    ...VOLATILE_COLUMNS,
    ...(opts.excludeColumns ?? []),
  ]);

  const tablesRes = await pool.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_schema = ANY($1)
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name`,
    [schemas],
  );

  const snapshot: ConsistencySnapshot = new Map();
  for (const { table_schema, table_name } of tablesRes.rows) {
    if (excludeTables.has(table_name)) continue;

    const colsRes = await pool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position`,
      [table_schema, table_name],
    );
    const cols = colsRes.rows
      .map((r) => r.column_name)
      .filter((c) => !excludeColumns.has(c));
    if (cols.length === 0) continue;

    const rowExpr = `concat_ws(',', ${
      cols.map((c) => `quote_nullable(${quoteIdent(c)}::text)`).join(", ")
    })`;
    const rowsRes = await pool.query<{ h: string }>(
      `SELECT md5(${rowExpr}) AS h
         FROM ${quoteIdent(table_schema)}.${quoteIdent(table_name)}
        ORDER BY h`,
    );
    const rowHashes = rowsRes.rows.map((r) => r.h);
    snapshot.set(`${table_schema}.${table_name}`, {
      rowCount: rowHashes.length,
      fingerprint: md5(rowHashes.join("")),
      rowHashes,
    });
  }
  return snapshot;
}

export type SnapshotDiff = {
  table: string;
  reason: "only-in-a" | "only-in-b" | "row-count" | "content";
  aRows: number | null;
  bRows: number | null;
};

/** Compare two snapshots table-by-table. `equal` ⇔ `diffs` is empty. */
export function compareConsistencySnapshots(
  a: ConsistencySnapshot,
  b: ConsistencySnapshot,
): { equal: boolean; diffs: SnapshotDiff[] } {
  const diffs: SnapshotDiff[] = [];
  const tables = [...new Set([...a.keys(), ...b.keys()])].sort();
  for (const table of tables) {
    const fa = a.get(table);
    const fb = b.get(table);
    if (fa && !fb) {
      diffs.push({ table, reason: "only-in-a", aRows: fa.rowCount, bRows: null });
    } else if (!fa && fb) {
      diffs.push({ table, reason: "only-in-b", aRows: null, bRows: fb.rowCount });
    } else if (fa && fb && fa.fingerprint !== fb.fingerprint) {
      diffs.push({
        table,
        reason: fa.rowCount !== fb.rowCount ? "row-count" : "content",
        aRows: fa.rowCount,
        bRows: fb.rowCount,
      });
    }
  }
  return { equal: diffs.length === 0, diffs };
}

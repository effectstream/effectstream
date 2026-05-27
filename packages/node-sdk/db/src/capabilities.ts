import type { PoolClient } from "pg";
import { ENV } from "@effectstream/utils/node-env";

/**
 * Optional database features the engine probes for at startup.
 *
 * - `pgIvm`: the `pg_ivm` extension that provides incrementally maintained
 *   materialized views. When unavailable, the engine falls back to plain
 *   SQL views over the same trigger-maintained intermediate tables.
 */
export interface DatabaseCapabilities {
  pgIvm: boolean;
}

/**
 * Probes the connected database for optional features.
 *
 * - If `ENV.DISABLE_PG_IVM` is set, `pg_ivm` is reported unavailable without
 *   probing — useful for tests and benchmarking against managed Postgres
 *   where the extension is not installable.
 * - Otherwise we best-effort `CREATE EXTENSION IF NOT EXISTS pg_ivm`. If the
 *   extension binary is missing (managed Postgres, fresh dev DB, etc.) the
 *   statement raises; we swallow the error and treat `pg_ivm` as absent.
 * - Finally we query `pg_extension` to confirm the real state.
 */
export async function detectCapabilities(
  client: Pick<PoolClient, "query">,
): Promise<DatabaseCapabilities> {
  if (ENV.DISABLE_PG_IVM) {
    return { pgIvm: false };
  }

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_ivm");
  } catch {
    // Extension binary not installed on this server — fall through and let
    // the pg_extension lookup confirm the absence.
  }

  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_ivm') AS exists`,
  );
  return { pgIvm: rows[0]?.exists === true };
}

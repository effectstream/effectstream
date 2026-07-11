import type { PoolClient } from "pg";
import { ENV } from "@effectstream/utils/node-env";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import {
  type MaterializedViewStrategy,
  pgIvmStrategy,
  plainViewStrategy,
} from "./MaterializedViewStrategy.ts";

/**
 * Optional database features the engine probes for at startup.
 *
 * - `pgIvm`: the `pg_ivm` extension that provides incrementally maintained
 *   materialized views. When unavailable, the engine can fall back to plain
 *   SQL views over the same trigger-maintained intermediate tables — but
 *   only if the operator has explicitly opted in via `ENV.ALLOW_NO_PG_IVM`.
 */
export interface DatabaseCapabilities {
  pgIvm: boolean;
}

/**
 * Probes the connected database for optional features. Pure detection —
 * no policy decision is made here; the caller (typically via
 * {@link selectViewStrategy}) decides whether the resulting capability set
 * is acceptable.
 *
 * - Best-effort `CREATE EXTENSION IF NOT EXISTS pg_ivm` (no-op if already
 *   installed, soft-fail if the binary is missing on the server).
 * - Then queries `pg_extension` to confirm the real state.
 */
export async function detectCapabilities(
  client: Pick<PoolClient, "query">,
): Promise<DatabaseCapabilities> {
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

/**
 * Decide which materialized-view strategy to use based on detected
 * capabilities and operator policy.
 *
 * Behavior matrix:
 *
 * | pg_ivm available | ALLOW_NO_PG_IVM | Result                                   |
 * | :--------------- | :-------------- | :--------------------------------------- |
 * | yes              | any             | pgIvmStrategy (production path)          |
 * | no               | false / unset   | **throws** — startup aborts loudly       |
 * | no               | true            | plainViewStrategy + prominent startup WARN |
 *
 * The throw is intentional: silently degrading to a slower read path in
 * production is much worse than failing early with a clear remediation
 * message. Operators who genuinely need the dev/test fallback must opt in.
 */
export function selectViewStrategy(
  capabilities: DatabaseCapabilities,
): MaterializedViewStrategy {
  if (capabilities.pgIvm) return pgIvmStrategy;

  if (!ENV.ALLOW_NO_PG_IVM) {
    throw new Error(formatMissingPgIvmError());
  }

  log.local(
    ComponentNames.EFFECTSTREAM_RUNTIME,
    "pg_ivm-fallback",
    SeverityNumber.WARN,
    (l) =>
      l(
        [
          "─────────────────────────────────────────────────────────────",
          "  effectstream: running WITHOUT pg_ivm (fallback mode)",
          "  ALLOW_NO_PG_IVM=true is set; using plain SQL views over the",
          "  trigger-maintained intermediate tables.",
          "",
          "  This path is intended for dev/test and low-volume apps only.",
          "  Read-path performance degrades sharply on long-lived contracts",
          "  with high address cardinality (intermediate tables grow",
          "  monotonically; the plain view does a seq scan + filter per",
          "  read). DO NOT run production on this configuration.",
          "─────────────────────────────────────────────────────────────",
        ].join("\n"),
      ),
  );
  return plainViewStrategy;
}

function formatMissingPgIvmError(): string {
  return [
    "",
    "Effectstream startup aborted: the `pg_ivm` PostgreSQL extension is not",
    "available on this database.",
    "",
    "The engine uses `pg_ivm` for incrementally maintained materialized views,",
    "which give compact, fast reads on long-lived contracts. Without it the",
    "engine can fall back to plain SQL views over the trigger-maintained",
    "intermediate tables — but that path degrades sharply on high-cardinality",
    "data and is only suitable for dev/test and low-volume apps.",
    "",
    "To proceed:",
    "  • Install pg_ivm in your PostgreSQL instance:",
    "      https://github.com/sraoss/pg_ivm",
    "  • OR explicitly accept the dev-mode fallback by setting:",
    "      ALLOW_NO_PG_IVM=true",
    "    (NOT recommended for production — see the database docs for the",
    "     performance ceiling.)",
    "",
  ].join("\n");
}

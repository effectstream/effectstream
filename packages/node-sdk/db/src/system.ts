import { until } from "effection";
import type { Operation } from "effection";
import type { Pool, PoolClient } from "pg";
import {
  getAllTableNames,
  type IGetAllTableNamesResult,
} from "./sql/system.queries.ts";

type QueryablePool = Pool | PoolClient;

/**
 * Truncates every table in the `public` schema and resets sequences.
 *
 * Intended for development flows only. The caller is responsible for holding any
 * required database mutex before invoking this helper.
 *
 * @param dbConn - Active pool or client to run queries against.
 */
export function* resetPublicTables(
  dbConn: QueryablePool,
): Operation<void> {
  const tableRows = (yield* until(
    getAllTableNames.run(undefined, dbConn),
  )) as IGetAllTableNamesResult[];

  const tableNames = tableRows
    .map((row) => row.tablename)
    .filter((name): name is string => Boolean(name));

  if (tableNames.length === 0) {
    console.log("[DEV RESET] No public tables found to truncate.");
    return;
  }

  const qualified = tableNames.map((name) => `"public"."${name}"`).join(", ");
  console.log(`[DEV RESET] Truncating public tables: ${qualified}`);

  yield* until(
    dbConn.query(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE`),
  );
}

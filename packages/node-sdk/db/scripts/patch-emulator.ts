import { run } from "effection";
import { createDynamicTables, getConnection } from "@paima/db";
import type { Client } from "pg";
import { applyMigrations } from "./apply-migrations.ts";
import type { SyncProtocolWithNetwork } from "@paima/config";
// TODO: Circular dependency.
// import type { DBMigrations } from "@paima/runtime";

/**
 * This is to generate the user/custom pgtyped files in compilation time
 * MIGRATIONS environment variable is used to specify the path to the migrations folder.
 * Every file in the migrations folder is executed in order.
 *
 * TODO: Implement how to manage the order of the migrations, e.g. 1.sql, 2.sql, 10.sql, etc.
 */
export async function standAloneApplyMigrations(
  db: Client,
  migrationTable: /*DBMigrations[]*/ any[],
  localhostConfig: SyncProtocolWithNetwork,
) {
  const l: SyncProtocolWithNetwork = localhostConfig;
  const config = Object.entries(l.primitives).map(([key, value]) => {
    return {
      config: {
        primitives: [{
          primitive: {
            type: value.primitive.type,
            name: value.primitive.name,
          },
        }],
      },
    };
  });

  await run(function* () {
    return yield* createDynamicTables(
      {
        engine_current_version: "0.0.0",
        engine_previous_version: "0.0.0",
        app_previous_version: "0.0.0",
        is_empty: true,
      },
      0,
      db,
      config as any,
    );
  });
  const migrations = migrationTable;

  for (const migration of migrations) {
    await applyMigrations(
      db,
      0,
      migration.name,
      migration.sql,
      false,
    );
  }
}

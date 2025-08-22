import { localhostConfig } from "@e2e/data-types";
import { migrationTable } from "./migration-order.ts";
import { run } from "effection";
import { createDynamicTables, getConnection } from "@paima/db";
import type { Client } from "pg";
import { applyMigrations } from "@paima/db/version";
import { SyncProtocolWithNetwork } from "@paima/config";

/**
 * This is to generate the user/custom pgtyped files in compilation time
 * MIGRATIONS environment variable is used to specify the path to the migrations folder.
 * Every file in the migrations folder is executed in order.
 * TODO: Implement how to manage the order of the migrations, e.g. 1.sql, 2.sql, 10.sql, etc.
 */

async function standAloneApplyUserMigrations(db: Client) {
  const l: SyncProtocolWithNetwork = localhostConfig as any;
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

const db = await getConnection();
await standAloneApplyUserMigrations(db);
console.log("✅ User migrations applied");

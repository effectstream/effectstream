import type { Client } from "pg";
import { assert, safeQuery } from "@e2e/engine";

export async function testMigrations(db: Client) {
  const version = await safeQuery<{
    app_version_major: number;
    app_version_minor: number;
    app_version_patch: number;
    engine_version_major: number;
    engine_version_minor: number;
    engine_version_patch: number;
    block_height: number;
  }>(
    db,
    "SELECT * FROM effectstream.effectstream_version_history ORDER BY block_height DESC LIMIT 1",
    "test-version",
  );

  assert(
    "test-version",
    async () => {
      return version.rows[0].app_version_major >= 1 &&
        version.rows[0].app_version_minor >= 0 &&
        version.rows[0].app_version_patch >= 0 &&
        version.rows[0].engine_version_major >= 0 &&
        version.rows[0].engine_version_minor >= 3 &&
        version.rows[0].engine_version_patch >= 20;
    },
  );

  const migrations = await safeQuery<{
    name: string;
    block_height: number;
    is_system_migration: boolean;
  }>(
    db,
    "SELECT * FROM effectstream.effectstream_migration_history",
    "test-migrations",
  );

  assert(
    "test-migrations",
    async () => {
      // 3 system migrations
      // 5 dynamic tables
      // 5 user migration
      if (migrations.rows.length !== 13) {
        console.error("Migrations rows length is not 13", migrations.rows);
        return false;
      }
      return true;
    },
  );
}

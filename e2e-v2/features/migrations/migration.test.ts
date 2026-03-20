/**
 * Migration tests - validates version history and migration records.
 */
import { assert, safeQuery } from "@e2e-v2/engine";
import type { Client } from "pg";

export async function migrationTest(db: Client) {
  await assert("Migration: version history exists", async () => {
    const result = await safeQuery<{
      app_version_major: number;
      engine_version_major: number;
      engine_version_minor: number;
    }>(
      db,
      "SELECT * FROM effectstream.effectstream_version_history ORDER BY block_height DESC LIMIT 1",
      "migration-version",
    );
    const row = result.rows[0];
    return row != null
      && row.app_version_major >= 1
      && row.engine_version_major >= 0
      && row.engine_version_minor >= 8;
  });

  await assert("Migration: system migrations applied", async () => {
    const result = await safeQuery<{ name: string; is_system_migration: boolean }>(
      db,
      "SELECT name, is_system_migration FROM effectstream.effectstream_migration_history",
      "migration-count",
    );
    // At minimum: 4 system migrations + 5 dynamic table migrations
    const systemCount = result.rows.filter((r: any) => r.is_system_migration).length;
    return systemCount >= 4;
  });

  await assert("Migration: dynamic table migrations applied", async () => {
    const result = await safeQuery<{ name: string }>(
      db,
      "SELECT name FROM effectstream.effectstream_migration_history WHERE name LIKE 'dynamic-tables-%'",
      "migration-dynamic",
    );
    // 5 EVM dynamic tables: ERC20 x2, ERC721 x2, ERC1155 x1
    return result.rows.length === 5;
  });
}

import type { Client } from "pg";
import { assert, blockWatcher, safeQuery } from "@e2e/engine";
import { ENV } from "@effectstream/utils/node-env";

const evm_enabled = !ENV.getBoolean("DISABLE_EVM");
const midnight_enabled = !ENV.getBoolean("DISABLE_MIDNIGHT");
const avail_enabled = !ENV.getBoolean("DISABLE_AVAIL");
const bitcoin_enabled = !ENV.getBoolean("DISABLE_BITCOIN");
const cardano_enabled = !ENV.getBoolean("DISABLE_CARDANO");

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

  let expectedMigrations = 3; // 3 system migrations
  expectedMigrations += 5;    // 5 user migrations
  if (evm_enabled) {
    expectedMigrations += 5; // 5 dynamic tables
  }

  if (!midnight_enabled && !avail_enabled && !bitcoin_enabled && !cardano_enabled && !evm_enabled) {
    // if no other chain is enabled, then we might hit this code before blocks are generated.
    // So we know between 5 and 8 migration are expected.
    assert(
      "test-migrations",
      async () => {
        if (migrations.rows.length < 5 || migrations.rows.length > 8) {
          console.error(`Migrations rows length is not expected between 5 and 8, got ${migrations.rows.length}`, migrations.rows);
          return false;
        }
        return true;
      },
    );
  } else {
    assert(
      "test-migrations",
      async () => {
        if (migrations.rows.length !== expectedMigrations) {
          console.error(`Migrations rows length is not expected ${expectedMigrations}, got ${migrations.rows.length}`, migrations.rows);
          return false;
        }
        return true;
      },
    );
  }
}

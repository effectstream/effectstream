import type { Client } from "pg";
import {
  applyMigrations,
  getMigrations,
  EFFECTSTREAM_ENGINE_VERSION,
  parseVersion,
  type VersionInfo,
} from "@effectstream/db/version";
import type { Operation } from "effection";
import { until } from "effection";
import {
  getMigrationsForBlockHeight,
  insertPaimaEngineVersion,
} from "@effectstream/db";
import type { DBMigrations, VERSION } from "./types.ts";

type SystemMigration = {
  version: VERSION;
  sql: string;
};

export function* applySystemMigrations(
  appVersion: VERSION,
  versionInfo: VersionInfo,
  lastBlockHeight: number,
  dbConn: Client,
  migrationOrder: DBMigrations[] | undefined,
): Operation<void> {
  if (
    versionInfo.engine_current_version === versionInfo.engine_previous_version
  ) {
    console.log("[MIGRATIONS] Nothing to apply.");
    // Nothing to apply.
    return;
  }

  const migrations = yield* getAllSystemMigrations(
    versionInfo,
    migrationOrder,
    dbConn as any, // Client,
  );

  // Apply all missing System Migrations
  for (const migration of migrations) {
    yield* until(
      applyMigrations(
        dbConn,
        lastBlockHeight,
        migration.version,
        migration.sql,
        true,
      ),
    );
  }

  // Update Engine Version
  const engineVersion = parseVersion(versionInfo.engine_current_version);
  const appVersionParts = parseVersion(appVersion);
  yield* until(
    insertPaimaEngineVersion.run(
      {
        appVersionMajor: appVersionParts[0],
        appVersionMinor: appVersionParts[1],
        appVersionPatch: appVersionParts[2],
        engineVersionMajor: engineVersion[0],
        engineVersionMinor: engineVersion[1],
        engineVersionPatch: engineVersion[2],
        blockHeight: lastBlockHeight,
      },
      dbConn,
    ),
  );

  return;
}
function* getAllSystemMigrations(
  config: VersionInfo,
  migrationOrder: DBMigrations[] | undefined,
  blockHeight: number,
): Operation<SystemMigration[]> {
  const fromVersion = config.is_empty
    ? undefined
    : config.engine_previous_version;
  const toVersion = config.engine_current_version;

  // Get System Migrations
  const systemMigrations = fromVersion !== toVersion
    ? yield* until(getMigrations(fromVersion, toVersion))
    : [];

  return systemMigrations;
}

export function* applyUserMigrations(
  currentBlockHeight: number,
  dbConn: Client,
  migrationOrder: DBMigrations[] | undefined,
): Operation<boolean> {
  const migrations = yield* getAllUserMigrations(
    EFFECTSTREAM_ENGINE_VERSION,
    migrationOrder,
    currentBlockHeight,
  );

  // Apply all missing User Migrations
  for (const migration of migrations) {
    yield* until(
      applyMigrations(
        dbConn,
        currentBlockHeight,
        migration.name,
        migration.sql,
        false,
      ),
    );
  }
  return migrations.length > 0;
}

function* getAllUserMigrations(
  currentEngineVersion: VERSION,
  migrationOrder: DBMigrations[] | undefined,
  blockHeight: number,
): Operation<DBMigrations[]> {
  // Get User Migrations
  const userMigrations = getMigrationsForBlockHeight(
    migrationOrder,
    blockHeight,
    blockHeight,
  );

  // Check if User Migrations are compatible with the current version
  for (const migration of userMigrations) {
    // If a current version is provided we check if the migration have the correct version dependency
    if (migration.versionDependency) {
      if (
        !isVersionGreaterOrEqual(
          currentEngineVersion,
          migration.versionDependency,
        )
      ) {
        throw new Error(`[CRITICAL ERROR] Migration ${migration.name} failed.
    Paima Engine Version ${migration.versionDependency} required.
    Current version ${currentEngineVersion} is not compatible.
    Please update your Paima Engine dependencies.`);
      }
    }
  }

  return userMigrations;
}

function isVersionGreaterOrEqual(
  version: VERSION,
  migrationVersion: VERSION,
): boolean {
  const versionParts = parseVersion(version);
  const migrationVersionParts = parseVersion(migrationVersion);
  return (
    versionParts[0] > migrationVersionParts[0] ||
    (versionParts[0] === migrationVersionParts[0] &&
      versionParts[1] >= migrationVersionParts[1])
  );
}

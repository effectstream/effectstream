import type { Client } from "pg";
import {
  applyMigrations,
  getMigrations,
  PAIMA_ENGINE_VERSION,
} from "@paima/db/version";
import type { Operation } from "effection";
import { until } from "npm:effection@3.5.0";
import {
  getLatestProcessedBlockHeight,
  getLatestVersion,
  insertPaimaEngineVersion,
  tableExists,
} from "@paima/db";
import type { StartConfigMigrationRouter } from "@paima/runtime";

type VersionInfo = {
  current_version: string;
  running_version: string;
  is_empty: boolean;
};

type MigrationInfo = {
  name: string;
  sql: string;
};

export function* executeMigrations(
  dbConn: Client,
  migrationRouter: StartConfigMigrationRouter,
): Operation<VersionInfo> {
  const versionInfo = yield* getVersionInfo(dbConn);
  const lastBlockHeight = !versionInfo.is_empty
    ? yield* until(getLatestProcessedBlockHeight.run(undefined, dbConn))
    : [{ block_height: 0 }];

  const migrations = yield* getAllMigrations(
    versionInfo,
    migrationRouter,
    dbConn,
  );

  for (const migration of migrations.systemMigrations) {
    yield* until(
      applyMigrations(
        dbConn,
        lastBlockHeight[0].block_height,
        migration.name,
        migration.sql,
        true,
      ),
    );
  }

  if (versionInfo.current_version !== versionInfo.running_version) {
    yield* until(
      insertPaimaEngineVersion.run(
        {
          versionMajor: parseInt(versionInfo.current_version.split(".")[0], 10),
          versionMinor: parseInt(versionInfo.current_version.split(".")[1], 10),
          versionPatch: parseInt(versionInfo.current_version.split(".")[2], 10),
          blockHeight: lastBlockHeight[0].block_height,
        },
        dbConn,
      ),
    );
  }

  for (const migration of migrations.userMigrations) {
    yield* until(
      applyMigrations(
        dbConn,
        lastBlockHeight[0].block_height,
        migration.name,
        migration.sql,
        false,
      ),
    );
  }

  return versionInfo;
}

function* getVersionInfo(dbConn: Client): Operation<VersionInfo> {
  // 1. Let's check if the database is empty.
  const [result] = yield* until(tableExists.run(undefined, dbConn));

  if (!result.exists) {
    return {
      current_version: PAIMA_ENGINE_VERSION,
      running_version: PAIMA_ENGINE_VERSION,
      is_empty: true,
    };
  }

  // So let's check what is the latest version from the `paima_engine_version_history` table.
  const [latestVersion] = yield* until(getLatestVersion.run(undefined, dbConn));
  if (!latestVersion) {
    throw new Error("Internal error: No version found in the database");
  }

  return {
    current_version: PAIMA_ENGINE_VERSION,
    running_version: latestVersion.version_major.toString() + "." +
      latestVersion.version_minor.toString() + "." +
      latestVersion.version_patch.toString(),
    is_empty: false,
  };
}

function* getAllMigrations(
  config: {
    current_version: string;
    running_version: string;
    is_empty: boolean;
  },
  migrationRouter: StartConfigMigrationRouter,
  blockHeight: number,
): Operation<{
  systemMigrations: MigrationInfo[];
  userMigrations: MigrationInfo[];
}> {
  const fromVersion = config.is_empty ? undefined : config.running_version;
  const toVersion = config.current_version;
  if (fromVersion === toVersion) {
    return { systemMigrations: [], userMigrations: [] };
  }
  const userMigrations = yield* until(
    migrationRouter(blockHeight, blockHeight),
  );

  const systemMigrations = yield* until(getMigrations(fromVersion, toVersion));
  return {
    systemMigrations: systemMigrations.map((migration) => ({
      name: migration.version.join("."),
      sql: migration.sql,
    })),
    userMigrations: userMigrations.map((migration) => ({
      name: migration.name,
      sql: migration.sql,
    })),
  };
}

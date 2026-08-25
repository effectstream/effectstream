import type { Client } from "pg";
import type { Operation } from "effection";
import { until } from "effection";
import * as migrationFiles from "./assets.ts";
import {
  acquireDBMutex,
  releaseDBMutex,
} from "../src/pg-connection.ts";
import { getLatestProcessedBlockHeight } from "../src/sql/block-heights.queries.ts";
import { getLatestVersion, tableExists } from "../src/sql/system.queries.ts";
type VERSION = `${number}.${number}.${number}`;
type VERSION_NUMBER = [number, number, number];
// NOTE Hardcoded on purpose: the engine cannot read a package manifest at
// runtime. Bump this by hand when adding a migration for a new version.
export const EFFECTSTREAM_ENGINE_VERSION: VERSION = "0.8.1";

export { applyMigrations } from "../scripts/apply-migrations.ts";

export function parseVersion(version: VERSION): VERSION_NUMBER {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid version string: ${version}`);
  }
  const [major, minor, patch] = parts;
  return [major, minor, patch];
}

export async function getMigrations(
  from_version: VERSION | undefined = undefined,
  to_version: VERSION = EFFECTSTREAM_ENGINE_VERSION,
): Promise<{
  version: VERSION;
  sql: string;
}[]> {
  const toVersion: VERSION_NUMBER = parseVersion(to_version);
  const fromVersion: VERSION_NUMBER | undefined = from_version
    ? parseVersion(from_version)
    : undefined;

  const upMigrations: { version: VERSION_NUMBER; sql: string }[] = [];
  Object.entries(migrationFiles.default.files).map(([key, value]) => {
    const [s, type, v, major, minor, patch] = key.split("-");
    if (s === "system" && type === "up" && v === "v") {
      upMigrations.push({
        version: [
          parseInt(major, 10),
          parseInt(minor, 10),
          parseInt(patch, 10),
        ],
        sql: new TextDecoder().decode(value.content),
      });
    }
  });

  const filteredAndSorted = upMigrations
    .filter((migration) => {
      return (
        (!fromVersion || (
          // Return all migrations that are greater to the from version
          migration.version[0] > fromVersion[0] ||
          (migration.version[0] === fromVersion[0] &&
            migration.version[1] > fromVersion[1]) ||
          (migration.version[0] === fromVersion[0] &&
            migration.version[1] === fromVersion[1] &&
            migration.version[2] > fromVersion[2])
        )) &&
        // Return all migrations that are less or equal to the target version
        (
          migration.version[0] < toVersion[0] ||
          (migration.version[0] === toVersion[0] &&
            migration.version[1] < toVersion[1]) ||
          (migration.version[0] === toVersion[0] &&
            migration.version[1] === toVersion[1] &&
            migration.version[2] <= toVersion[2])
        )
      );
    })
    .sort((a, b) => {
      // Sort from oldest to newest
      return (
        a.version[0] - b.version[0] ||
        a.version[1] - b.version[1] ||
        a.version[2] - b.version[2]
      );
    });

  return filteredAndSorted.map((migration) => ({
    version: `${migration.version[0]}.${migration.version[1]}.${
      migration.version[2]
    }`,
    sql: migration.sql,
  }));
}

export type VersionInfo = {
  engine_current_version: VERSION;
  engine_previous_version: VERSION;
  app_previous_version: VERSION;
  is_empty: boolean;
};

export function* getLastBlockHeight(
  versionInfo: VersionInfo,
  dbConn: Client,
): Operation<number> {
  yield* acquireDBMutex("get-last-block-height");
  try {
    if (versionInfo.is_empty) return 0;
    const rows = yield* until(
      getLatestProcessedBlockHeight.run(undefined, dbConn),
    );
    return rows[0]?.block_height ?? 0;
  } finally {
    releaseDBMutex("get-last-block-height");
  }
}

export function* getVersionInfo(dbConn: Client): Operation<VersionInfo> {
  // 1. Let's check if the database is empty.
  yield* acquireDBMutex("get-version-info");
  const [result] = yield* until(tableExists.run(undefined, dbConn));
  releaseDBMutex("get-version-info");

  if (!result.exists) {
    return {
      engine_current_version: EFFECTSTREAM_ENGINE_VERSION,
      engine_previous_version: "0.0.0",
      app_previous_version: "0.0.0",
      is_empty: true,
    };
  }

  // So let's check what is the latest version from the `effectstream_version_history` table.
  yield* acquireDBMutex("get-version-info");
  const [latestVersion] = yield* until(getLatestVersion.run(undefined, dbConn));
  releaseDBMutex("get-version-info");

  if (!latestVersion) {
    throw new Error("Internal error: No version found in the database");
  }

  return {
    engine_current_version: EFFECTSTREAM_ENGINE_VERSION,
    engine_previous_version:
      `${latestVersion.engine_version_major}.${latestVersion.engine_version_minor}.${latestVersion.engine_version_patch}`,
    app_previous_version:
      `${latestVersion.app_version_major}.${latestVersion.app_version_minor}.${latestVersion.app_version_patch}`,
    is_empty: false,
  };
}

import * as migrationFiles from "./assets.ts";

// NOTE This must match the version of the root deno.json
export const PAIMA_ENGINE_VERSION = "0.3.20";

export { applyMigrations } from "../scripts/apply-migrations.ts";

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid version string: ${version}`);
  }
  const [major, minor, patch] = parts;
  return [major, minor, patch];
}

// deno-lint-ignore require-await
export async function getMigrations(
  from_version: string | undefined = undefined,
  to_version: string = PAIMA_ENGINE_VERSION,
): Promise<{
  version: [number, number, number];
  sql: string;
}[]> {
  const toVersion: [number, number, number] = parseVersion(to_version);
  const fromVersion: [number, number, number] | undefined = from_version
    ? parseVersion(from_version)
    : undefined;

  const upMigrations: { version: [number, number, number]; sql: string }[] = [];
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

  return filteredAndSorted;
}

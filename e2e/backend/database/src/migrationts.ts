import type { StartConfigMigrationRouter } from "@paima/runtime";
import firstSql from "./migrations/1.sql" with { type: "text" };

const migrationTable = [
  {
    blockHeight: 1,
    name: "1.sql",
    sql: firstSql,
  },
];

/**
 * This function is used by Paima Engine to apply the migration at the correct block heights.
 * It returns the migration script for the given block height.
 * @param blockHeight - The paima block height to get the migration script for.
 * @returns The migration script for the given block height.
 */
export const migrationRouter: StartConfigMigrationRouter = async function (
  startBlockHeight: number,
  endBlockHeight: number,
): Promise<{ sql: string; blockHeight: number; name: string }[]> {
  return migrationTable
    .filter((migration) =>
      migration.blockHeight >= startBlockHeight &&
      migration.blockHeight <= endBlockHeight
    );
};

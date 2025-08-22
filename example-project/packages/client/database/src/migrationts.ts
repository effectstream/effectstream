import type {
  DBMigrations,
  StartConfigMigrationRouter,
} from "@paimaexample/runtime";

import { migrationTable } from "./migration-order.ts";

/**
 * This function is used by Paima Engine to apply the migration at the correct block heights.
 * It returns the migration script for the given block height.
 * @param startBlockHeight - The paima block height to start applying the migrations from (inclusive).
 * @param endBlockHeight - The paima block height to stop applying the migrations at (inclusive).
 * @returns The migration script for the given block height.
 */
export const migrationRouter: StartConfigMigrationRouter = async function (
  startBlockHeight: number,
  endBlockHeight: number,
): Promise<DBMigrations[]> {
  const migrationsToApply = migrationTable
    .filter((migration) => {
      const targetBlockHeight = migration.blockHeight ?? 1;
      return (
        targetBlockHeight >= startBlockHeight &&
        targetBlockHeight <= endBlockHeight
      );
    });
  return migrationsToApply;
};

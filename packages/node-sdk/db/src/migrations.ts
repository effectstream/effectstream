// TODO: Circular dependency.
// import type { DBMigrations } from "@paima/runtime";

/**
 * This function is used by Paima Engine to apply the migration at the correct block heights.
 * It returns the migration script for the given block height.
 * @param startBlockHeight - The paima block height to start applying the migrations from (inclusive).
 * @param endBlockHeight - The paima block height to stop applying the migrations at (inclusive).
 * @returns The migration script for the given block height.
 */
export function getMigrationsForBlockHeight(
  migrationTable: /*DBMigrations[]*/ any[] | undefined,
  startBlockHeight: number,
  endBlockHeight: number,
): /*DBMigrations[]*/ any[] {
  if (!migrationTable) {
    return [];
  }
  const migrationsToApply = migrationTable
    .filter((migration) => {
      const targetBlockHeight = migration.blockHeight ?? 1;
      return (
        targetBlockHeight >= startBlockHeight &&
        targetBlockHeight <= endBlockHeight
      );
    });
  return migrationsToApply;
}

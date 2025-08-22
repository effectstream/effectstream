import { readFile } from "node:fs/promises";
import type { StartConfigMigrationRouter } from "@paimaexample/runtime";

const __dirname = import.meta.dirname;

/**
 * This function is used by Paima Engine to apply the migration at the correct block heights.
 * It returns the migration script for the given block height.
 * @param blockHeight - The paima block height to get the migration script for.
 * @returns The migration script for the given block height.
 */
export const migrationRouter: StartConfigMigrationRouter = async function (
  blockHeight: number,
): Promise<string | undefined> {
  switch (blockHeight) {
    case 1:
      return await readFile(`${__dirname}/migrations/database.sql`, "utf-8");
  }
  return undefined;
};

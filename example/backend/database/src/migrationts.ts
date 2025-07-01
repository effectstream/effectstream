import { readFile } from "node:fs/promises";
import { type Operation, until } from "npm:effection@3.5.0";

const __dirname = import.meta.dirname;

/**
 * This function is used by Paima Engine to apply the migration at the correct block heights.
 * It returns the migration script for the given block height.
 * @param blockHeight - The paima block height to get the migration script for.
 * @returns The migration script for the given block height.
 */
export function* migrations(
  blockHeight: number,
): Operation<string | undefined> {
  switch (blockHeight) {
    case 1:
      return yield* until(readFile(`${__dirname}/migrations/1.sql`, "utf-8"));
  }
  return undefined;
}

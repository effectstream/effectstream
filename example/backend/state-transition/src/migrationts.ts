import { readFileSync } from "node:fs";
import type { Operation } from "npm:effection@3.5.0";

const __dirname = import.meta.dirname;
export function* migrations(
  blockHeight: number,
): Operation<string | undefined> {
  switch (blockHeight) {
    case 1:
      return readFileSync(`${__dirname}/migrations/1.sql`, "utf-8");
  }
  return undefined;
}

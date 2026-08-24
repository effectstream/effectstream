import { describe, test } from "bun:test";
import { readFileSync } from "node:fs";

interface SourceString {
  readonly line: number;
  readonly quote: "'" | '"' | "`";
  readonly value: string;
}

const databaseStorageUrl = new URL("../core/database-storage.ts", import.meta.url);

/**
 * Collect TypeScript string and template literals while ignoring comments.
 * This intentionally treats a template interpolation as literal content: SQL
 * structure assembled with `${...}` is exactly what this guard must reject.
 */
function sourceStrings(source: string): SourceString[] {
  const strings: SourceString[] = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    if (source[index] === "\n") {
      line += 1;
      index += 1;
      continue;
    }

    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline;
      continue;
    }

    if (source.startsWith("/*", index)) {
      index += 2;
      while (index < source.length && !source.startsWith("*/", index)) {
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      index = Math.min(index + 2, source.length);
      continue;
    }

    const quote = source[index];
    if (quote !== "'" && quote !== '"' && quote !== "`") {
      index += 1;
      continue;
    }

    const startLine = line;
    let value = "";
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        value += source.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (character === quote) {
        index += 1;
        break;
      }
      if (character === "\n") line += 1;
      value += character;
      index += 1;
    }
    strings.push({ line: startLine, quote, value });
  }

  return strings;
}

function preview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

describe("DatabaseStorage SQL source policy", () => {
  test("application TypeScript contains no operational SQL literals", () => {
    const source = readFileSync(databaseStorageUrl, "utf8");
    const operational = sourceStrings(source)
      .filter(({ value }) => /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(value))
      .map(({ line, value }) => `line ${line}: ${preview(value)}`);

    if (operational.length > 0) {
      throw new Error(
        "Operational SQL must live in named pgtyped .sql sources:\n" +
          operational.map((entry) => `- ${entry}`).join("\n"),
      );
    }
  });

  test("application TypeScript contains no dynamic placeholder builder", () => {
    const source = readFileSync(databaseStorageUrl, "utf8");
    const placeholderLines = source.split("\n")
      .map((value, index) => ({ line: index + 1, value: value.trim() }))
      .filter(({ value }) => /\bplaceholders\s*\(/.test(value));

    if (placeholderLines.length > 0) {
      throw new Error(
        "Dynamic placeholders must use pgtyped spread parameters:\n" +
          placeholderLines
            .map(({ line, value }) => `- line ${line}: ${value}`)
            .join("\n"),
      );
    }
  });
});

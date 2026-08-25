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

/**
 * Statements this file is allowed to carry, by EXACT text.
 *
 * The policy exists so that SQL touching the batcher's TABLES lives in named,
 * typed, reviewed `.sql` sources where it cannot drift and cannot hide an
 * injection. These three touch no table at all: they ask the server about the
 * connection itself, and they run during pool setup — before the driver, the
 * schema, or in one case even the pinned pool exists — so there is nothing for
 * a pgtyped query to run against yet.
 *
 * Exact strings, not a pattern, on purpose. A pattern for "introspection" would
 * quietly admit the next statement someone decides is introspective; an exact
 * list makes every addition a visible diff in a test whose name says what it
 * protects. Entries are also required to still be PRESENT (below), so an
 * exemption cannot outlive the code it was granted for.
 */
const CONNECTION_INTROSPECTION_ALLOWLIST = [
  // Diagnostic: which schema will the next unqualified statement use, and
  // which backend answered. The evidence behind "every pooled connection is
  // pinned" is N of these reporting N pids and one schema.
  "SELECT current_schema() AS schema, pg_backend_pid() AS pid",
  // Boot check: prove the driver actually applied search_path instead of
  // assuming its version supports the hook that does it.
  "SELECT current_schema() AS schema",
  // Shared-session probe: read a canary set on a DIFFERENT connection. A
  // server that answers with the token multiplexes every client onto one
  // session, where pinning a schema would repoint everybody else.
  "SELECT current_setting('batcher_schema_probe.token', true) AS token",
];

describe("DatabaseStorage SQL source policy", () => {
  test("application TypeScript contains no operational SQL literals", () => {
    const source = readFileSync(databaseStorageUrl, "utf8");
    const operational = sourceStrings(source)
      .filter(({ value }) => /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(value))
      .filter(({ value }) =>
        !CONNECTION_INTROSPECTION_ALLOWLIST.includes(value.trim())
      )
      .map(({ line, value }) => `line ${line}: ${preview(value)}`);

    if (operational.length > 0) {
      throw new Error(
        "Operational SQL must live in named pgtyped .sql sources:\n" +
          operational.map((entry) => `- ${entry}`).join("\n"),
      );
    }
  });

  test("every allowlisted statement is still in the file", () => {
    // An exemption that outlives its code is an exemption nobody is watching.
    const source = readFileSync(databaseStorageUrl, "utf8");
    const stale = CONNECTION_INTROSPECTION_ALLOWLIST.filter((statement) =>
      !source.includes(statement)
    );
    if (stale.length > 0) {
      throw new Error(
        "These statements are allowlisted but no longer present; delete the " +
          "entries:\n" + stale.map((entry) => `- ${entry}`).join("\n"),
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

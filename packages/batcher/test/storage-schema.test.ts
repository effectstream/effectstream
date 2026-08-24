// The schema-name rule (spec Addendum A, FR-013).
//
// This is a security-shaped function even though it looks like string
// handling: the value it returns is interpolated into `CREATE SCHEMA` and
// `SET search_path` — the two statements that cannot take a bind parameter —
// so the pattern is the only thing standing between an environment variable
// and arbitrary SQL. Every case below that asserts a REFUSAL is therefore
// asserting the injection gate, not tidiness.

import { describe, expect, test } from "bun:test";

import {
  BATCHER_SCHEMA_PREFIX,
  BATCHER_SCHEMA_VALUE_PATTERN,
  quoteSchemaIdentifier,
  resolveBatcherSchema,
} from "../core/storage-schema.ts";

describe("batcher schema names", () => {
  test("the supplied value is a SUFFIX; the code owns the prefix", () => {
    expect(resolveBatcherSchema("chess_v2").schema).toBe("batcher_chess_v2");
    expect(BATCHER_SCHEMA_PREFIX).toBe("batcher_");
  });

  test("a plain value resolves without advice", () => {
    expect(resolveBatcherSchema("chess_v2").warning).toBeUndefined();
  });

  test("digits and underscores are allowed anywhere, including first", () => {
    // The prefix supplies the leading letter, so a leading digit in the value
    // is a valid identifier — which is why the pattern does not forbid it.
    expect(resolveBatcherSchema("2fast").schema).toBe("batcher_2fast");
    expect(resolveBatcherSchema("_x_1").schema).toBe("batcher__x_1");
  });

  test("the effective schema can never be public", () => {
    // `public` is where the engine's own tables live in the shared DB_NAME.
    expect(resolveBatcherSchema("public").schema).toBe("batcher_public");
  });

  test("uppercase is refused rather than folded", () => {
    // Postgres would fold an unquoted CHESS to chess but keep "CHESS" as-is
    // when quoted, so accepting mixed case would make the schema the operator
    // reads in the config and the schema the batcher owns two different names.
    expect(() => resolveBatcherSchema("Chess")).toThrow(/BATCHER_DB_SCHEMA/);
  });

  test("an empty value is refused", () => {
    // Reachable only through an explicit `schema: ""` option: the ENV getter
    // cannot distinguish "" from unset, and the ladder reads that as unset.
    expect(() => resolveBatcherSchema("")).toThrow(/BATCHER_DB_SCHEMA/);
  });

  test("56 characters is refused, 55 is accepted", () => {
    expect(resolveBatcherSchema("a".repeat(55)).schema).toBe(
      `batcher_${"a".repeat(55)}`,
    );
    expect(() => resolveBatcherSchema("a".repeat(56))).toThrow();
    // 8 + 55 is exactly Postgres' 63-character identifier budget.
    expect(`batcher_${"a".repeat(55)}`.length).toBe(63);
  });

  test("hyphens, dots, spaces and quotes are refused", () => {
    for (const bad of ["chess-v2", "chess.v2", "chess v2", 'ch"ess', "chess;"]) {
      expect(() => resolveBatcherSchema(bad)).toThrow();
    }
  });

  test("an injection attempt is refused, not escaped", () => {
    // The gate is the pattern. Nothing downstream tries to be clever about
    // quoting a value that should never have been accepted.
    expect(() =>
      resolveBatcherSchema('x"; DROP SCHEMA public CASCADE; --')
    ).toThrow();
    expect(() => resolveBatcherSchema("x\nDROP SCHEMA public")).toThrow();
  });

  test("the refusal names the variable, the value and the rule", () => {
    let message = "";
    try {
      resolveBatcherSchema("Chess-v2");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("BATCHER_DB_SCHEMA");
    expect(message).toContain("Chess-v2");
    expect(message).toContain("^[a-z0-9_]{1,55}$");
  });

  test("the refusal can name a different source when the value did not come from the environment", () => {
    expect(() => resolveBatcherSchema("Chess", "the `schema` storage option"))
      .toThrow(/schema` storage option/);
  });

  test("a value that already carries the prefix warns, but is NOT refused", () => {
    // Double-prefixing is harmless (batcher_batcher_x is a valid schema) and
    // almost always a copy-paste of the effective name; refusing it would take
    // a deployment down over a cosmetic mistake.
    const resolved = resolveBatcherSchema("batcher_chess");
    expect(resolved.schema).toBe("batcher_batcher_chess");
    expect(resolved.warning).toContain("batcher_batcher_chess");
    expect(resolved.warning).toContain("BATCHER_DB_SCHEMA");
  });

  test("the exported pattern is the one the rule is written against", () => {
    expect(BATCHER_SCHEMA_VALUE_PATTERN.test("chess_v2")).toBe(true);
    expect(BATCHER_SCHEMA_VALUE_PATTERN.test("Chess")).toBe(false);
    // Anchored at both ends: an unanchored version would accept
    // "ok\nDROP SCHEMA public" because `.test` searches line by line.
    expect(BATCHER_SCHEMA_VALUE_PATTERN.test("ok\nDROP SCHEMA public")).toBe(
      false,
    );
  });

  test("identifier quoting is applied to the resolved schema", () => {
    expect(quoteSchemaIdentifier("batcher_chess_v2")).toBe('"batcher_chess_v2"');
  });

  test("quoting refuses anything the pattern would not have produced", () => {
    // Belt and braces: the quoter is the last thing between a schema name and
    // a statement, so it re-checks rather than trusting its caller.
    expect(() => quoteSchemaIdentifier('batcher_x"; DROP SCHEMA public; --'))
      .toThrow();
    expect(() => quoteSchemaIdentifier("public")).toThrow();
  });
});

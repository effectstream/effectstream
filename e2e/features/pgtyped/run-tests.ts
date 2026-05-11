/**
 * pgtyped:update e2e test.
 *
 * Imports main() from @effectstream/db/pgtyped-update and runs it with
 * explicit user migrations and pgtyped config. Verifies that:
 *   1. System + user migrations are applied (pgtyped_test table exists)
 *   2. pgtyped generates a .queries.ts file with correct types
 *
 * Requires: workspace dependencies installed (`bun install` from repo root).
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { main } from "@effectstream/db/pgtyped-update";
import { migrationTable } from "./fixture/migration-order.ts";

const FIXTURE_DIR = path.resolve(import.meta.dirname!, "fixture");
const PGTYPED_CONFIG = path.join(FIXTURE_DIR, "pgtypedconfig.json");
const PGTYPED_BIN = path.resolve(import.meta.dirname!, "../node_modules/@paima/pgtyped-cli/lib/index.js");
const GENERATED_FILE = path.join(FIXTURE_DIR, "sql/test-query.queries.ts");

function cleanup() {
  if (existsSync(GENERATED_FILE)) {
    rmSync(GENERATED_FILE);
  }
}

export async function pgtypedTest() {
  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    if (condition) {
      passed++;
      console.log(`  [PASS] ${name}`);
    } else {
      failed++;
      console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    }
  }

  cleanup();

  const originalCwd = process.cwd();
  process.chdir(FIXTURE_DIR);
  try {
    await main({
      userMigrations: migrationTable,
      pgtypedConfigPath: PGTYPED_CONFIG,
      pgtypedBin: PGTYPED_BIN,
    });
  } finally {
    process.chdir(originalCwd);
  }

  assert(
    "pgtyped generated .queries.ts file",
    existsSync(GENERATED_FILE),
    `expected ${GENERATED_FILE}`,
  );

  if (existsSync(GENERATED_FILE)) {
    const content = readFileSync(GENERATED_FILE, "utf-8");

    assert(
      "generated file contains getAllPgtypedTest query",
      content.includes("getAllPgtypedTest"),
      "expected getAllPgtypedTest in generated types",
    );

    assert(
      "generated file contains correct columns",
      content.includes("block_height") && content.includes("name"),
      "expected block_height and name columns in generated types",
    );

    assert(
      "generated file contains cross-table query (user + system tables)",
      content.includes("getTestWithMigrationCheck") && content.includes("migration_name"),
      "expected getTestWithMigrationCheck with migration_name column",
    );
  }

  cleanup();

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`pgtyped test: ${failed} assertion(s) failed`);
}

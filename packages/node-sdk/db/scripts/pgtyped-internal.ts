#!/usr/bin/env node
import { waitForDb } from "./wait-for-db.ts";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

async function runPgtyped() {
  try {
    console.log("🔄 Running pgtyped...");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = join(__dirname, "../pgtypedconfig.json");
    const child = spawn("npx", ["pgtyped", "-c", configPath], {
      stdio: "inherit",
    });
    const [code] = await once(child, "exit");

    if (code === 0) {
      console.log("✅ pgtyped completed successfully");
    } else {
      console.error("❌ pgtyped failed");
      process.exit(code ?? 1);
    }
  } catch (error) {
    console.error("❌ Error running pgtyped:", error);
    process.exit(1);
  }
}

async function main() {
  // First wait for the database
  await waitForDb();

  // Then run pgtyped
  await runPgtyped();
}

if (process.argv[1] && process.argv[1].endsWith("pgtyped-internal.ts")) {
  await main();
}

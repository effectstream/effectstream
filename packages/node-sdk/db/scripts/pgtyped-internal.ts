#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { waitForDb } from "./wait-for-db.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

async function runPgtyped() {
  try {
    console.log("🔄 Running pgtyped...");
    const __dirname = dirname(import.meta.url?.startsWith("file:") ? fileURLToPath(import.meta.url) : import.meta.url.replace("file://", ""));
    const configPath = join(__dirname, "../pgtypedconfig.json");
    const child = spawn("npx", ["pgtyped", "-c", configPath], {
      stdio: "inherit",
      shell: true,
    });

    const code = await new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
    });

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

if (import.meta.main) {
  await main();
}

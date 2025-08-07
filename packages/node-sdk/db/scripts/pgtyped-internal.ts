#!/usr/bin/env -S deno run -A
import { waitForDb } from "./wait-for-db.ts";

async function runPgtyped() {
  try {
    console.log("🔄 Running pgtyped...");
    const command = new Deno.Command("npx", {
      args: ["pgtyped", "-c", "./pgtypedconfig.json"],
      stdout: "inherit",
      stderr: "inherit",
    });

    const child = command.spawn();
    const status = await child.status;

    if (status.success) {
      console.log("✅ pgtyped completed successfully");
    } else {
      console.error("❌ pgtyped failed");
      Deno.exit(status.code);
    }
  } catch (error) {
    console.error("❌ Error running pgtyped:", error);
    Deno.exit(1);
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

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
// Get port from arguments.
const portArgName = "--port";
const portArgIndex = process.argv.indexOf(portArgName);
const portValue = portArgIndex !== -1 ? process.argv[portArgIndex + 1] : "5432";
const port = parseInt(portValue);
if (isNaN(port)) {
  throw new Error(`Port argument ${portArgName} is not a number`);
}

async function waitForDb() {
  try {
    console.log("waiting for db on port", port);
    const child = spawn("npx", ["wait-on", `tcp:${port}`], {
      stdio: "inherit",
    });
    const [code] = await once(child, "exit");

    if (code === 0) {
      console.log("✅ Database is ready on port 5432");
    } else {
      console.error("❌ Failed to connect to database on port 5432");
      process.exit(code ?? 1);
    }
  } catch (error) {
    console.error("❌ Error waiting for database:", error);
    process.exit(1);
  }
}

export { waitForDb };

if (process.argv[1] && process.argv[1].endsWith("wait-for-db.ts")) {
  await waitForDb();
}

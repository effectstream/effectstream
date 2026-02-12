#!/usr/bin/env -S deno run -A
import { spawn } from "node:child_process";

// Get port from arguments.
const portArgName = "--port";
const argv = typeof process !== "undefined" ? process.argv.slice(2) : (typeof Deno !== "undefined" ? (Deno as any).args : []);
const portArgIndex = argv.indexOf(portArgName);
const portValue = portArgIndex !== -1 ? argv[portArgIndex + 1] : "5432";
const port = parseInt(portValue);
if (isNaN(port)) {
  throw new Error(`Port argument ${portArgName} is not a number`);
}

async function waitForDb() {
  try {
    console.log("waiting for db on port", port);
    const child = spawn("npx", ["wait-on", `tcp:${port}`], {
      stdio: "inherit",
      shell: true,
    });

    const code = await new Promise<number | null>((resolve) => {
      child.on("close", (code, _sig) => resolve(code));
    });

    if (code === 0) {
      console.log("✅ Database is ready on port 5432");
    } else {
      console.error("❌ Failed to connect to database on port 5432");
      (typeof process !== "undefined" ? process : (Deno as any)).exit(code ?? 1);
    }
  } catch (error) {
    console.error("❌ Error waiting for database:", error);
    (typeof process !== "undefined" ? process : (Deno as any)).exit(1);
  }
}

export { waitForDb };

if (import.meta.main) {
  await waitForDb();
}

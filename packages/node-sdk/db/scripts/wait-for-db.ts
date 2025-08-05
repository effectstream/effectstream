#!/usr/bin/env -S deno run -A
// Get port from arguments.
const portArgName = "--port";
const portArgIndex = Deno.args.indexOf(portArgName);
const portValue = portArgIndex !== -1 ? Deno.args[portArgIndex + 1] : "5432";
const port = parseInt(portValue);
if (isNaN(port)) {
  throw new Error(`Port argument ${portArgName} is not a number`);
}

async function waitForDb() {
  try {
    console.log("waiting for db on port", port);
    const command = new Deno.Command("deno", {
      args: ["-A", "npm:wait-on", `tcp:${port}`],
      stdout: "inherit",
      stderr: "inherit",
    });

    const child = command.spawn();
    const status = await child.status;

    if (status.success) {
      console.log("✅ Database is ready on port 5432");
    } else {
      console.error("❌ Failed to connect to database on port 5432");
      Deno.exit(status.code);
    }
  } catch (error) {
    console.error("❌ Error waiting for database:", error);
    Deno.exit(1);
  }
}

export { waitForDb };

if (import.meta.main) {
  await waitForDb();
}

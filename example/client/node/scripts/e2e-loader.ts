import type { Client, PoolConfig } from "pg";
import pg from "pg";
import { start } from "@paima/orchestrator";
import { deployContracts } from "./e2e-contracts.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Launch the orchestrator, and wait for the sync process to start.
// The final process is the `sync` process.
// We can know when the process is started, but not if ready.
export async function startup(
  owner: `0x${string}`,
  privateKey: `0x${string}`,
): Promise<Client> {
  start({ output: "stdout-err" });
  console.log("⌛ Waiting for sync process to start...");

  while (true) {
    const processes = await fetch("http://localhost:3000/processes");
    const processesJson = await processes.json();
    if (processesJson.processes.find((p: any) => p.name === "sync")) {
      break;
    }
    await delay(100);
  }

  console.log("🔄 Sync process started\n");
  await deployContracts(owner, privateKey);
  return await getDBConnection();
}

// Launch the shutdown process, and wait for the sync process to stop.
function shutdownProcesses(): void {
  console.log("\n🛑 Shutting down...");
  // We don't wait for the endpoint to return.
  // As this process will be killed.
  fetch("http://localhost:3000/shutdown", {
    method: "POST",
  });
  console.log("⏳ Waiting for shutdown to complete...");
}

const getPersistentConnection = (creds: PoolConfig): Client => {
  const client = new pg.Client(creds);
  client.connect(() => {});
  client.on("error", (err: Error) => {
    console.error(err);
  });
  return client;
};

// Connect to the db, and wait until the tables are created.
export async function getDBConnection(): Promise<Client> {
  // Get DB connection
  const poolConfig = {
    host: Deno.env.get("DB_HOST") || "localhost",
    user: Deno.env.get("DB_USER") || "postgres",
    password: Deno.env.get("DB_PW") || "",
    database: Deno.env.get("DB_NAME") || "postgres",
    port: parseInt(Deno.env.get("DB_PORT") || "5432", 10),
  };

  // We can connect the DB now for doing the tests.
  const db = getPersistentConnection(poolConfig);

  let maxMillis = 10000;
  while (maxMillis > 0) {
    try {
      await db.query(
        `SELECT id FROM public.primitive_accounting LIMIT 1`,
      );
      return db;
    } catch (e) {
      console.log("⏳ DB not ready yet");
      await delay(100);
    }
    maxMillis -= 100;
    if (maxMillis <= 0) {
      throw new Error("DB connection timed out");
    }
  }
}

let isShutdownCalled = false;
export async function shutdown(db: Client): Promise<void> {
  db.off("error", console.error);
  db.on("end", () => {
    isShutdownCalled = true;
    shutdownProcesses();
  });
  db.end();

  // Wait for the db to disconnect and the shutdown to be called.
  let maxMillis = 10000;
  while (maxMillis > 0) {
    // waiting for the db to disconnect
    await delay(100);
    maxMillis -= 100;
  }

  // This should not be reached, as Deno.exit is called in the shutdown function.
  // If still not called, the call manually.
  if (!isShutdownCalled) {
    shutdownProcesses();
    await delay(1000);
  }
  console.error("Shutdown/DB connection timed out");
  Deno.exit(1);
}

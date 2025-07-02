import type { Client, PoolConfig } from "pg";
import pg from "pg";
import { start } from "@paima/orchestrator";
import { deployContracts } from "./e2e-contracts.ts";
import { ENV } from "@paima/utils";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Launch the Sync through the orchestrator,
 * and wait for the sync process to start and be ready.
 */
export async function startup(
  owner: `0x${string}`,
  privateKey: `0x${string}`,
): Promise<Client> {
  const config = {
    output: Deno.env.get("PAIMA_E2E_LOG_DEBUG") ? "stdout" : "stdout-err",
  } as const;
  start(config);
  console.log("⌛ Waiting for sync process to start...");
  while (true) {
    try {
      const processes = await fetch("http://localhost:3000/processes");
      const processesJson = await processes.json();
      if (processesJson.processes.find((p: any) => p.name === "sync")) {
        await fetch(`http://localhost:${ENV.PAIMA_API_PORT}/health`);
        break;
      }
      await delay(100);
    } catch (e) {
      await delay(100);
    }
  }

  console.log("🔄 Sync process started\n");
  await deployContracts(owner, privateKey);
  return await getDBConnection();
}

/**
 * Cleanup for shutdown.
 * @param db - The database connection.
 */
export async function cleanup(db: Client): Promise<void> {
  await db.end();
}

/**
 * Launch the shutdown process, and wait for the sync process to stop.
 */
export function shutdown(): void {
  console.log("\n🛑 Shutting down...");
  // We don't wait for the endpoint to return.
  // As this process will be killed.
  fetch("http://localhost:3000/shutdown", {
    method: "POST",
  });
  console.log("⏳ Waiting for shutdown to complete...");
}

/**
 * Get a persistent connection to the DB.
 * IMPORTANT: PGLite does not support multiple connections; so we use the network mutex.
 * @param creds - The database credentials.
 * @returns The database connection.
 */
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
    host: ENV.DB_HOST,
    user: ENV.DB_USER,
    password: ENV.DB_PW,
    database: ENV.DB_NAME,
    port: ENV.DB_PORT,
  };

  // We can connect the DB now for doing the tests.
  const db = getPersistentConnection(poolConfig);

  let maxMillis = 10000;

  // Wait until the DB is ready and the tables are created.
  while (maxMillis > 0) {
    let didLock = false;
    let isReady = false;
    try {
      await fetch(`http://localhost:${ENV.PAIMA_API_PORT}/db_aquire_lock`);
      didLock = true;
      await db.query(
        `SELECT id FROM public.primitive_accounting LIMIT 1`,
      );
      isReady = true;
    } finally {
      if (didLock) {
        await fetch(`http://localhost:${ENV.PAIMA_API_PORT}/db_release_lock`);
      }
    }
    if (isReady) {
      return db;
    }
    await delay(100);

    maxMillis -= 100;
    if (maxMillis <= 0) {
      throw new Error("DB connection timed out");
    }
  }
}

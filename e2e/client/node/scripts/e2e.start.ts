import type { Client, PoolConfig } from "pg";
import pg from "pg";
import { OrchestratorConfig, start } from "@effectstream/orchestrator";
import { ENV } from "@effectstream/utils/node-env";
import { Value } from "@sinclair/typebox/value";
import { ComponentNames } from "@effectstream/log";
import { launchCardano } from "@effectstream/orchestrator/start-cardano";
import { launchEvm } from "@effectstream/orchestrator/start-evm";
import { launchMidnight } from "@effectstream/orchestrator/start-midnight";
import { launchAvail } from "@effectstream/orchestrator/start-avail";
import { launchBitcoin } from "@effectstream/orchestrator/start-bitcoin";
import { getEffectstreamEVMPublicClient } from "@e2e/engine";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const external_db_enabled = Deno.env.get("EXTERNAL_DB_ENABLED") === "true";
const yaci_enabled = Deno.env.get("DISABLE_YACI") === "true"
  ? false
  : true;

const midnight_enabled = Deno
  ? (Deno.env.get("DISABLE_MIDNIGHT") === "true" ? false : true)
  : true;

const avail_enabled = Deno
  ? (Deno.env.get("DISABLE_AVAIL") === "true" ? false : true)
  : true;

const bitcoin_enabled = Deno
  ? (Deno.env.get("DISABLE_BITCOIN") === "true" ? false : true)
  : true;

/**
 * Launch the Sync through the orchestrator,
 * and wait for the sync process to start and be ready.
 */
export async function startup(): Promise<Client> {
  const logs = Deno.env.get("EFFECTSTREAM_STDOUT") ? "stdout" : "stdout-err";

  const config = Value.Parse(OrchestratorConfig, {
    logs,
    processes: {
      [ComponentNames.EFFECTSTREAM_PGLITE]: !external_db_enabled,
      [ComponentNames.TUI]: false,
      [ComponentNames.TMUX]: false,
    },

    packageName: "@effectstream",

    // Launch my processes
    processesToLaunch: [
      ...launchEvm("@e2e/evm-contracts"),
      ...(bitcoin_enabled ? launchBitcoin("@e2e/bitcoin-contracts") : []),
      ...(yaci_enabled ? launchCardano("@e2e/cardano-contracts") : []),
      ...(midnight_enabled ? launchMidnight("@e2e/midnight-contracts") : []),
      ...(avail_enabled ? launchAvail("@e2e/avail-contracts") : []),
      {
        name: "build explorer",
        args: ["task", "-f", "@effectstream/explorer", "build"],
        waitToExit: true,
      },
      {
        name: "build e2e-wallet-ui",
        args: ["task", "-f", "@e2e/wallets-ui", "build"],
        waitToExit: true,
      },
      {
        stopProcessAtPort: [3334],
        name: "batcher",
        args: ["task", "-f", "@e2e/batcher", "start"],
        waitToExit: false,
        type: "system-dependency",
        dependsOn: [
          ComponentNames.DEPLOY_EVM_CONTRACTS, 
          midnight_enabled ? ComponentNames.MIDNIGHT_CONTRACT : undefined,
          bitcoin_enabled ? ComponentNames.BITCOIN_WAIT_FOR_BLOCK : undefined,
        ].filter(Boolean),
      }
    ],
  });
  start(config);
  console.log("⌛ Waiting for sync process to start...");
  while (true) {
    try {
      const processes = await fetch(
        `http://localhost:${ENV.ORCHESTRATOR_PORT}/processes`,
      );
      const processesJson = await processes.json();
      if (processesJson.processes.find((p: any) => p.name === "sync")) {
        // This is a light weight check, that only assures that the node is running.
        // But it does not assure that the node is ready to accept requests.
        const healthResponse = await fetch(
          `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/health`,
        );
        const data = await healthResponse.json();
        if (data.status === "ok") {
          break;
        }
      }
      await delay(200);
    } catch (e) {
      await delay(200);
    }
  }

  console.log("🔄 Sync process initialized\n");

  const rpcClient = getEffectstreamEVMPublicClient();
  while (true) {
    try {
      const blockNumber = await rpcClient.getBlockNumber();
      if (typeof blockNumber === "bigint" && blockNumber > 0n) {
        // Wait until block is height 1, so we assure the
        // the system migrations and presync is done.
        break;
      }
    } catch {
      // If the node is launched, but not ready, this will throw
      // an error as the internal DB is not ready yet.
    }
    await delay(500);
    console.error("Waiting for sync process to be ready...");
  }

  console.log("🔄 Sync process started\n");

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
  fetch(`http://localhost:${ENV.ORCHESTRATOR_PORT}/shutdown`, {
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
      await fetch(
        `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/db_acquire_lock?name=e2e-loader`,
      );
      didLock = true;
      await db.query(
        `SELECT id FROM effectstream.primitive_accounting LIMIT 1`,
      );
      isReady = true;
    } finally {
      if (didLock) {
        await fetch(
          `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/db_release_lock?name=e2e-loader`,
        );
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

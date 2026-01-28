import { OrchestratorConfig, start } from "@effectstream/orchestrator";
import { ENV } from "@effectstream/utils/node-env";
import { Value } from "@sinclair/typebox/value";
import { ComponentNames } from "@effectstream/log";
import { launchCardano } from "@effectstream/orchestrator/start-cardano";
import { launchEvm } from "@effectstream/orchestrator/start-evm";
import { launchMidnight } from "@effectstream/orchestrator/start-midnight";
import { launchAvail } from "@effectstream/orchestrator/start-avail";
import { launchBitcoin } from "@effectstream/orchestrator/start-bitcoin";
import {
    anyError,
    newSharedState,
    printSummary,
    type SharedState,
  } from "@e2e/engine";
import { accountTests } from "../e2e-tests/e2e.account.test.ts";
import { generalTest } from "../e2e-tests/e2e.general.test.ts";
import { joinAndIncrementTest, sendMintToBatcherTest, testDelegatedBalancing } from "../e2e-tests/e2e.midnight.test.ts";
import { submitDataWithMessageAvailTest } from "../e2e-tests/e2e.avail.test.ts";
import { testMigrations } from "../e2e-tests/e2e.migrations.ts";
import { RPCTest } from "../e2e-tests/e2e.rpc.test.ts";
import { tokenTests } from "../e2e-tests/e2e.tokens.ts";
import { bitcoinTest, bitcoinBatcherTest } from "../e2e-tests/e2e.bitcoin.test.ts";
import { getEffectstreamEVMPublicClient } from "@e2e/engine";
import type { Client, PoolConfig } from "pg";
import pg from "pg";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const external_db_enabled = ENV.getBoolean("EXTERNAL_DB_ENABLED");

const yaci_enabled = !ENV.getBoolean("DISABLE_YACI")
const midnight_enabled = !ENV.getBoolean("DISABLE_MIDNIGHT");
const avail_enabled = !ENV.getBoolean("DISABLE_AVAIL");
const bitcoin_enabled = !ENV.getBoolean("DISABLE_BITCOIN");

/**
 * Launch the Sync through the orchestrator,
 * and wait for the sync process to start and be ready.
 */
export async function startup(): Promise<Client> {
  const logs = ENV.getBoolean("EFFECTSTREAM_STDOUT") ? "stdout" : "stdout-err";

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
      },
      {
        name: "build explorer",
        args: ["task", "-f", "@effectstream/explorer", "build"],
        waitToExit: true,
        dependsOn: [
          'batcher',
          yaci_enabled ? ComponentNames.DOLOS_WAIT : undefined,
          avail_enabled ? ComponentNames.AVAIL_CLIENT_WAIT : undefined,
        ].filter(Boolean),
      },
      {
        name: "build e2e-wallet-ui",
        args: ["task", "-f", "@e2e/wallets-ui", "build"],
        waitToExit: true,
        dependsOn: ['build explorer'],
      },

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

  // Start Test
  async function test() {
    // Do not use this db connection directly.
    // As PGLite does not support multiple connections.
    let db: Client;
    try {
      // Launch the orchestrator, and wait for the sync process to start.
      // The contracts are deployed with the private key.
      db = await startup();
      
      const sharedState: SharedState = newSharedState();
      
      // Midnight triggers the event when read for first time.
      // In the E2E Test, we have 2 primitives.
      if (midnight_enabled) {
        sharedState.primitive_accounting_counter = 2;
      }
      if (bitcoin_enabled) {
        sharedState.primitive_accounting_counter += 3;
      }
      await generalTest(db, sharedState);
      console.log(
        "generalTest completed",
        sharedState,
      );
      await RPCTest();
      await accountTests(db, sharedState);
      console.log(
        "accountTests completed",
        sharedState,
      );
      await joinAndIncrementTest(db, sharedState);
      await sendMintToBatcherTest(db, sharedState);
      await testDelegatedBalancing(db, sharedState);
      await submitDataWithMessageAvailTest(db, sharedState);
      await tokenTests(db, sharedState);
      if (bitcoin_enabled) {
        await bitcoinTest(db, sharedState);
        await bitcoinBatcherTest(db, sharedState);
      }
      await testMigrations(db);
      
      // Done testing.
      printSummary();
      await cleanup(db);
      
      // Optional pause to allow the user to inspect the DB,
      // check the logs, send more requests, etc.
      const pauseTime = Deno.env.get("EFFECTSTREAM_E2E_PAUSE_TIME");
      if (pauseTime) {
        console.log("⏳ Pausing for", pauseTime, "seconds");
        await delay(parseInt(pauseTime, 10) * 1000);
      }
      
      // // Disconnect so the process can exit.
      shutdown();
    } catch (e) {
      // Show partial summary of testing.
      printSummary();
      
      console.error(e);
      await cleanup(db);
      shutdown();
    } finally {
      if (anyError()) {
        Deno.exit(1);
      }
    }
  }
  
  test()
  .then(() => {
    console.log("🎉 Test completed");
    Deno.exit(0);
  }).catch((e) => {
    console.log("❌ Test failed");
    console.error(e);
    Deno.exit(1);
  });
  
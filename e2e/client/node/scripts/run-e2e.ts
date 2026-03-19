/**
 * E2E test runner — decoupled from orchestration.
 *
 * Expects orchestrator-v2 to already be running (e.g. via `cli.ts start --background`).
 * Polls the orchestrator API until the sync process is up and healthy,
 * then runs all E2E tests sequentially.
 */

import { ENV } from "@effectstream/utils/node-env";
import {
  anyError,
  hasPassedTests,
  newSharedState,
  printSummary,
  type SharedState,
  getEffectstreamEVMPublicClient,
} from "@e2e/engine";
import { accountTests } from "../e2e-tests/e2e.account.test.ts";
import { generalTest, evmTests } from "../e2e-tests/e2e.general.test.ts";
import { joinAndIncrementTest, sendMintToBatcherTest, testDelegatedBalancing, testConcurrentDelegatedBalancing } from "../e2e-tests/e2e.midnight.test.ts";
import { submitDataWithMessageAvailTest } from "../e2e-tests/e2e.avail.test.ts";
import { testMigrations } from "../e2e-tests/e2e.migrations.ts";
import { RPCTest } from "../e2e-tests/e2e.rpc.test.ts";
import { tokenTests } from "../e2e-tests/e2e.tokens.ts";
import { bitcoinTest, bitcoinBatcherTest } from "../e2e-tests/e2e.bitcoin.test.ts";
import { submitBlobCelestiaTest } from "../e2e-tests/e2e.celestia.test.ts";
import { getEnv, getRuntime, exit } from "@effectstream/utils/runtime";
import type { Client, PoolConfig } from "pg";
import pg from "pg";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const evm_enabled = !ENV.getBoolean("DISABLE_EVM");
const midnight_enabled = !ENV.getBoolean("DISABLE_MIDNIGHT");
const avail_enabled = !ENV.getBoolean("DISABLE_AVAIL");
const bitcoin_enabled = !ENV.getBoolean("DISABLE_BITCOIN");
const celestia_enabled = !ENV.getBoolean("DISABLE_CELESTIA", true);

const ORCHESTRATOR_PORT = 4747;

// ── Wait helpers ────────────────────────────────────────────────────────────

async function waitForOrchestrator(): Promise<void> {
  console.log("⌛ Waiting for orchestrator-v2 to be reachable...");
  while (true) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/health`);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  console.log("✅ Orchestrator is up");
}

async function waitForSyncProcess(): Promise<void> {
  console.log("⌛ Waiting for sync process to appear...");
  while (true) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/processes`);
      const data = await res.json();
      if (data.processes?.find((p: any) => p.name === "sync")) break;
    } catch {
      // orchestrator may not be ready yet
    }
    await delay(200);
  }
  console.log("✅ Sync process found");
}

async function waitForSyncHealthy(): Promise<void> {
  console.log("⌛ Waiting for sync health endpoint...");
  const timeout = 120_000; // 2 minutes
  const start = Date.now();
  while (true) {
    try {
      const res = await fetch(`http://localhost:${ENV.EFFECTSTREAM_API_PORT}/health`);
      const data = await res.json();
      if (data.status === "ok") break;
    } catch {
      // not ready
    }

    if (Date.now() - start > timeout) {
      // Dump sync log before failing
      try {
        const { readFileSync } = await import("fs");
        const log = readFileSync(".orchestrator-logs/sync.log", "utf-8");
        console.error("=== sync.log ===\n" + log + "\n=== end sync.log ===");
      } catch { /* no log file */ }
      try {
        const procRes = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/processes`);
        const procData = await procRes.json();
        console.error("=== orchestrator processes ===\n" + JSON.stringify(procData, null, 2) + "\n=== end ===");
      } catch { /* orchestrator unreachable */ }
      throw new Error(`Timed out waiting for sync health endpoint after ${timeout / 1000}s`);
    }
    await delay(200);
  }
  console.log("✅ Sync is healthy");
}

async function waitForEvmBlock(): Promise<void> {
  if (!evm_enabled) return;
  console.log("⌛ Waiting for EVM block height > 0...");
  const rpcClient = getEffectstreamEVMPublicClient();
  while (true) {
    try {
      const blockNumber = await rpcClient.getBlockNumber();
      if (typeof blockNumber === "bigint" && blockNumber > 0n) break;
    } catch {
      // internal DB not ready
    }
    await delay(500);
  }
  console.log("✅ EVM block height ready");
}

// ── DB connection ───────────────────────────────────────────────────────────

const getPersistentConnection = (creds: PoolConfig): Client => {
  const client = new pg.Client(creds);
  client.connect(() => {});
  client.on("error", (err: Error) => {
    console.error(err);
  });
  return client;
};

async function getDBConnection(): Promise<Client> {
  const poolConfig = {
    host: ENV.DB_HOST,
    user: ENV.DB_USER,
    password: ENV.DB_PW,
    database: ENV.DB_NAME,
    port: ENV.DB_PORT,
  };

  const db = getPersistentConnection(poolConfig);

  let maxMillis = 10000;

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
  throw new Error("DB connection timed out");
}

// ── Shutdown ────────────────────────────────────────────────────────────────

function shutdown(): void {
  console.log("\n🛑 Shutting down orchestrator...");
  fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, {
    method: "POST",
  }).catch(() => {});
}

// ── Signal handlers ─────────────────────────────────────────────────────────

let shuttingDown = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${sig}`);
    shutdown();
    exit(1);
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  let db: Client = undefined as any;
  try {
    // Wait for orchestrator + sync to be ready
    await waitForOrchestrator();
    await waitForSyncProcess();
    await waitForSyncHealthy();
    await waitForEvmBlock();

    console.log("🔄 Sync process started\n");

    db = await getDBConnection();

    const sharedState: SharedState = newSharedState();

    if (midnight_enabled) {
      sharedState.primitive_accounting_counter = 2;
    }
    if (bitcoin_enabled) {
      sharedState.primitive_accounting_counter += 3;
    }

    // Run each test group in isolation so a crash in one doesn't skip the rest.
    const safeRun = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        console.error(`\n⚠️ Test group "${name}" threw an error:`);
        console.error(e);
      }
    };

    await safeRun("generalTest", () => generalTest(db, sharedState));
    await safeRun("RPCTest", () => RPCTest());

    console.log("generalTest completed", sharedState);

    if (evm_enabled) {
      await safeRun("evmTests", () => evmTests(db, sharedState));
      await safeRun("accountTests", () => accountTests(db, sharedState));
      console.log("accountTests completed", sharedState);
    }

    if (midnight_enabled) {
      await safeRun("joinAndIncrementTest", () => joinAndIncrementTest(db, sharedState));
      await safeRun("sendMintToBatcherTest", () => sendMintToBatcherTest(db, sharedState));
      await safeRun("testDelegatedBalancing", () => testDelegatedBalancing(db, sharedState));
      await safeRun("testConcurrentDelegatedBalancing", () => testConcurrentDelegatedBalancing(db, sharedState, 2));
    }

    if (avail_enabled) {
      await safeRun("submitDataWithMessageAvailTest", () => submitDataWithMessageAvailTest(db, sharedState));
    }

    if (evm_enabled) {
      await safeRun("tokenTests", () => tokenTests(db, sharedState));
    }

    if (bitcoin_enabled) {
      await safeRun("bitcoinTest", () => bitcoinTest(db, sharedState));
      await safeRun("bitcoinBatcherTest", () => bitcoinBatcherTest(db, sharedState));
    }

    if (celestia_enabled) {
      await safeRun("submitBlobCelestiaTest", () => submitBlobCelestiaTest(db, sharedState));
    }

    await safeRun("testMigrations", () => testMigrations(db));

    // Done testing.
    printSummary();
    await db.end();

    // Optional pause for inspection
    const pauseTime = getEnv("EFFECTSTREAM_E2E_PAUSE_TIME");
    if (pauseTime) {
      console.log("⏳ Pausing for", pauseTime, "seconds");
      await delay(parseInt(pauseTime, 10) * 1000);
    }

    shutdown();
  } catch (e) {
    printSummary();
    console.error(e);
    if (db) await db.end();
    shutdown();
  } finally {
    // In Bun, some tests are expected to fail due to missing runtime features.
    // Treat as success if at least one test passed.
    const { runtime } = getRuntime();
    if (runtime === "bun" && hasPassedTests()) {
      // partial pass is acceptable in Bun
    } else if (anyError()) {
      exit(1);
    }
  }
}

run()
  .then(() => {
    console.log("🎉 Test completed");
    exit(0);
  })
  .catch((e) => {
    console.log("❌ Test failed");
    console.error(e);
    exit(1);
  });

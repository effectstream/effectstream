/**
 * NEAR E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator/cli.ts (DB + NEAR sandbox + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify NEAR sandbox is responding)
 * 4. Runs sync tests (primitives, dynamic tables, event capture)
 * 5. Shuts down everything
 *
 * Test coverage:
 *   [x] NEAR:Generic      — NEP-297 custom event with unique message verification
 *   [x] NEAR:Intent       — DIP-4 intent settlement with token diffs + STM processing
 *   [x] NEAR:AccountWatch — Execution outcome capture for FunctionCalls to watched contract
 *   [x] NEAR:NEP141       — FT ft_transfer event + IVM balance tracking
 *   [x] NEAR:NEP171       — NFT nft_transfer event + IVM ownership tracking
 *   [x] NEAR:NEP245       — MT mt_transfer event + IVM per-token-balance tracking
 *   [ ] Batcher           — Transaction submission via NearAdapter (stub)
 */
import {
  anyError,
  assertSQL,
  printSummary,
  recordCrash,
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
  waitForBlock,
  getDBConnection,
} from "@e2e/engine";
import type { Client } from "pg";
import path from "path";

// Test modules
import { runToolingTests } from "./tooling/sandbox-launch.test.ts";
import { runGenericTest } from "./sync/generic.test.ts";
import { runIntentTest } from "./sync/intent.test.ts";
import { runAccountWatchTest } from "./sync/account-watch.test.ts";
import { runNep141Test } from "./sync/nep141.test.ts";
import { runNep171Test } from "./sync/nep171.test.ts";
import { runNep245Test } from "./sync/nep245.test.ts";
import { runBatcherTest } from "./sync/batcher.test.ts";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

// ── Sync tests ───────────────────────────────────────────────────────────────

async function runSyncTests(db: Client): Promise<void> {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");

  // Core: verify sync protocol is indexing
  await assertSQL<{ protocol_name: string }>(
    "NEAR: sync_protocol_pagination has NEAR protocol entry",
    db,
    `SELECT protocol_name FROM effectstream.sync_protocol_pagination WHERE protocol_name = 'parallelNearRPC' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows.find((r: any) => r.protocol_name === "parallelNearRPC") != null,
  );

  // Implemented tests
  await runGenericTest(db);
  await runIntentTest(db);
  await runAccountWatchTest(db);
  await runNep141Test(db);
  await runNep171Test(db);
  await runNep245Test(db);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    // 2. Wait for NEAR sandbox + contract deploy
    await waitForProcess("near-sandbox-wait", { waitForExit: true, timeoutMs: 120_000 });
    console.log("NEAR sandbox ready.");
    await waitForProcess("deploy-near-contract", { waitForExit: true, timeoutMs: 60_000 });
    console.log("Contract deployed.\n");

    // 3. Run tooling tests
    await runToolingTests();

    // 3b. Batcher adapter tests (offline logic; no batcher service needed)
    await runBatcherTest();

    // 4. Wait for sync node to be healthy
    await waitForProcess("sync");
    await waitForHealth();
    await waitForBlock(1);
    console.log("Sync node is healthy.\n");

    // 5. Connect to DB and run sync tests
    db = getDBConnection();
    await runSyncTests(db);

    // 6. Summary
    printSummary();
  } catch (e) {
    recordCrash();
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfrastructure();
    if (anyError()) process.exit(1);
    process.exit(0);
  }
}

test();

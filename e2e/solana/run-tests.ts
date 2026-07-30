/**
 * Solana E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator/cli.ts (DB + Solana test validator + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify Solana validator is responding)
 * 4. Runs sync tests (primitives, event capture)
 * 5. Shuts down everything
 */
import {
  anyError,
  assertSQL,
  printSummary,
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
import { runWalletTransferTest } from "./sync/wallet-transfer.test.ts";
import { runAccountBalanceTest } from "./sync/account-balance.test.ts";
import { runProgramLogTest } from "./sync/program-logs.test.ts";
import { runProgramEventTests } from "./sync/program-events.test.ts";
import { runBatcherTest } from "./sync/batcher.test.ts";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

async function runSyncTests(db: Client): Promise<void> {
  console.log("\n--- Phase 2: Sync Tests ---\n");

  await assertSQL<{ protocol_name: string }>(
    "Solana: sync_protocol_pagination has Solana protocol entry",
    db,
    `SELECT protocol_name FROM effectstream.sync_protocol_pagination WHERE protocol_name = 'parallelSolanaRPC' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows.find((r: any) => r.protocol_name === "parallelSolanaRPC") != null,
  );

  await runAccountBalanceTest(db);
  await runProgramLogTest(db);
  await runProgramEventTests(db);
}

async function test() {
  let db: Client | null = null;
  // An exception thrown OUTSIDE an assertion (infrastructure that never came
  // up, a phase that threw before asserting) leaves anyError() false whenever an
  // earlier phase passed — `anyError()` is `count === 0 || failed > 0`. Without
  // this flag the suite would exit 0 having silently skipped, say, the entire
  // batcher phase.
  let infraError = false;
  try {
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    await waitForProcess("solana-validator-wait", { waitForExit: true, timeoutMs: 120_000 });
    console.log("Solana validator ready.\n");

    await runToolingTests();
    await runWalletTransferTest();

    await waitForProcess("sync");
    await waitForHealth();
    await waitForBlock(1);
    console.log("Sync node is healthy.\n");

    db = getDBConnection();
    await runSyncTests(db);

    console.log("\n--- Phase 3: Batcher Tests ---\n");
    await waitForProcess("batcher");
    await runBatcherTest(db);

    printSummary();
  } catch (e) {
    infraError = true;
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfrastructure();
    if (anyError() || infraError) process.exit(1);
    process.exit(0);
  }
}

test();

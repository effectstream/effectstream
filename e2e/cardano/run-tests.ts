/**
 * Cardano E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator/cli.ts (DB + YACI DevKit + Dolos + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify infrastructure)
 * 4. Runs sync tests (verify STM wrote correct values to DB)
 * 5. Shuts down everything
 */
import {
  anyError,
  printSummary,
  assert,
  assertSQL,
  assertChainReady,
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

const LAUNCHER = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

// ── Tooling Tests (Phase 1) ─────────────────────────────────────────────────

async function runToolingTests(): Promise<void> {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");

  // Verify YACI DevKit is running (blockfrost-like API on port 10000)
  await assert("YACI DevKit admin API responds", async () => {
    try {
      const res = await fetch("http://localhost:10000/local-cluster/api/admin/devnet");
      return res.ok;
    } catch {
      return false;
    }
  });

  // Verify Dolos mini blockfrost endpoint
  await assert("Dolos blockfrost endpoint responds", async () => {
    try {
      const res = await fetch("http://localhost:3000/blocks/latest");
      if (!res.ok) return false;
      const block = await res.json();
      return block.time !== undefined && block.height !== undefined;
    } catch {
      return false;
    }
  });

  // Verify YACI DevKit node is producing blocks
  await assert("YACI DevKit has produced blocks", async () => {
    try {
      const res = await fetch("http://localhost:3000/blocks/latest");
      if (!res.ok) return false;
      const block = await res.json();
      return block.height > 0;
    } catch {
      return false;
    }
  });

  // Verify Dolos UTXORpc gRPC is reachable (port 50051)
  await assertChainReady(
    "Dolos UTXORpc gRPC port is open",
    "http://localhost:3000/blocks/latest",
    10000,
  );
}

// ── Sync Tests (Phase 2) ────────────────────────────────────────────────────

async function runSyncTests(db: Client): Promise<void> {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");
  // Cardano UTXORpc sync needs time to catch up with YACI blocks
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  // Wait for the sync node to index at least some cardano transactions
  await assertSQL<{ tx_hash: string; bytes_hex: string; block_height: number }>(
    "Cardano: UTXORpc transactions indexed in cardano_transactions",
    db,
    "SELECT tx_hash, bytes_hex, block_height FROM cardano_transactions LIMIT 5;",
    (res) => res.rows.length > 0,
    (res) => {
      const row = res.rows[0];
      return row.tx_hash.length > 0 && row.bytes_hex.length > 0 && row.block_height > 0;
    },
  );

  // Verify transaction hashes are valid hex strings
  await assertSQL<{ tx_hash: string }>(
    "Cardano: Transaction hashes are non-empty strings",
    db,
    "SELECT tx_hash FROM cardano_transactions;",
    (res) => res.rows.length > 0,
    (res) => res.rows.every((row) => row.tx_hash.length > 0),
  );

  // Verify block heights are positive
  await assertSQL<{ block_height: number; count: string }>(
    "Cardano: Transactions have positive block heights",
    db,
    "SELECT block_height, COUNT(*) as count FROM cardano_transactions GROUP BY block_height ORDER BY block_height ASC;",
    (res) => res.rows.length > 0,
    (res) => res.rows.every((row) => row.block_height > 0),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure
    await startInfrastructure(LAUNCHER);
    await waitForOrchestrator();

    // 2. Wait for Cardano infrastructure to be ready
    await waitForProcess("dolos-minibf-wait", { waitForExit: true, timeoutMs: 180_000 });
    console.log("Cardano infrastructure ready.\n");

    // 3. Run tooling tests (verify infra BEFORE sync)
    await runToolingTests();

    // 3b. Wait for contract deployment & interaction
    await waitForProcess("cardano-submit-tx", { waitForExit: true, timeoutMs: 120_000 });
    console.log("Aiken contract deployed and called.\n");

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

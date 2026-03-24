/**
 * NEAR E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + NEAR sandbox + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify NEAR sandbox is responding)
 * 4. Runs sync tests (submit transaction, verify sync picks it up)
 * 5. Shuts down everything
 */
import {
  anyError,
  assert,
  assertSQL,
  printSummary,
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
  getDBConnection,
} from "@e2e-v2/engine";
import type { Client } from "pg";
import path from "path";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

// ── Tooling tests ────────────────────────────────────────────────────────────

async function runToolingTests(): Promise<void> {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");

  await assert("NEAR sandbox is responding on port 3030", async () => {
    // Use /status endpoint which responds immediately (no finality needed)
    const res = await fetch("http://localhost:3030/status");
    const json = await res.json() as any;
    return json.version?.version != null;
  });

  await assert("NEAR sandbox is producing blocks", async () => {
    // Poll until we see blocks being produced (height > 0)
    for (let i = 0; i < 10; i++) {
      const res = await fetch("http://localhost:3030", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "block",
          params: { finality: "final" },
        }),
      });
      const json = await res.json() as any;
      if (json.result?.header?.height > 1) return true;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  });
}

// ── Sync tests ───────────────────────────────────────────────────────────────

async function runSyncTests(db: Client): Promise<void> {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");

  // Verify that the sync protocol is indexing blocks from the NEAR sandbox
  await assertSQL<{ protocol_name: string }>(
    "NEAR: sync_protocol_pagination has NEAR protocol entry",
    db,
    `SELECT protocol_name FROM effectstream.sync_protocol_pagination WHERE protocol_name = 'parallelNearRPC' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => r.protocol_name === "parallelNearRPC");
      return row != null;
    },
  );

  // Read the unique message that was written by the deploy script
  const fs = await import("fs");
  const messagePath = path.resolve(import.meta.dirname!, "../shared/contracts/near/build/test-message.txt");
  const expectedMessage = fs.readFileSync(messagePath, "utf-8").trim();
  console.log(`  Expected message: "${expectedMessage}"`);

  // Verify that the NEP-297 event from our contract was captured with the exact unique message
  await assertSQL<{ primitive_name: string; payload: any }>(
    `NEAR: primitive_accounting has NearGenericEvent with unique message "${expectedMessage}"`,
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearGenericEvent' LIMIT 10;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        return payload?.payload?.message === expectedMessage;
      });
      if (row) {
        const p = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        console.log("  Found event payload:", JSON.stringify(p));
      }
      return row != null;
    },
  );
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

    // 4. Wait for sync node to be healthy
    await waitForProcess("sync");
    await waitForHealth();
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

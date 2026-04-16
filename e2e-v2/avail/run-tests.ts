/**
 * Avail E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + Avail node + light client + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify Avail node + light client are responding)
 * 4. Runs sync tests (submit data to Avail, verify STM wrote to DB)
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
  waitForBlock,
  getDBConnection,
} from "@e2e-v2/engine";
import type { Client } from "pg";
import path from "path";
import { readAvailApplication } from "@e2e-v2/avail-contracts";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

// ── Tooling tests ────────────────────────────────────────────────────────────

async function runToolingTests(): Promise<void> {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");

  // Verify Avail node is responding on port 9955
  await assert("Avail node is responding on ws://localhost:9955", async () => {
    const response = await fetch("http://localhost:9955", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "system_health",
        params: [],
      }),
    });
    const json = await response.json() as any;
    return json.result !== undefined;
  });

  // Verify Avail light client is responding on port 7007
  await assert("Avail light client is responding on http://localhost:7007", async () => {
    const response = await fetch("http://localhost:7007/v2/status");
    return response.ok;
  });
}

// ── Sync tests ───────────────────────────────────────────────────────────────

async function runSyncTests(db: Client): Promise<void> {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");
  // Avail sync has delayMs=60000, need longer assertSQL timeout (extra slack for CI)
  process.env["E2E_MAX_TIMEOUT"] = "240000";

  // Read the deployed Avail application info
  const availApp = readAvailApplication();
  const appId = availApp.appId;

  // Submit data to Avail DA layer
  console.log(`Submitting data to Avail (appId=${appId})...`);

  const { cryptoWaitReady } = await import("@polkadot/util-crypto");
  await cryptoWaitReady();
  const { Account, Pallets, SDK } = await import("avail-js-sdk");
  const sdk = await SDK.New("ws://localhost:9955/ws");
  const account = Account.new("//Alice");

  const testPayload = JSON.stringify({ message: "TestAvail" });
  const tx = sdk.tx.dataAvailability.submitData(testPayload);
  const res = await tx.executeWaitForInclusion(account, { app_id: appId });

  const isOk = res.isSuccessful();
  if (isOk === undefined || !isOk) {
    console.error("Avail data submission failed:", res);
    throw new Error("Avail data submission failed");
  }
  console.log(`Data submitted successfully. TxHash: ${res.txHash}`);

  // Wait for sync to pick up the data and STM to write to avail_messages
  await assertSQL<{ id: number; height: number; message: string }>(
    "Avail: STM wrote avail_messages with message='TestAvail'",
    db,
    `SELECT id, height, message FROM avail_messages ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => r.message === "TestAvail");
      return row != null && row.message === "TestAvail";
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

    // 2. Wait for Avail light client to be deployed and ready
    //    CI runners can be slow — avail node needs time to produce & finalize blocks
    await waitForProcess("avail-light-client-wait", { waitForExit: true, timeoutMs: 240_000 });
    console.log("Avail light client deployed and ready.\n");

    // 3. Run tooling tests (verify infra BEFORE sync)
    await runToolingTests();

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

import path from "node:path";
import type { Client } from "pg";

import {
  anyError,
  getDBConnection,
  printSummary,
  startInfrastructure,
  stopInfrastructure,
  waitForHealth,
  waitForOrchestrator,
  waitForProcess,
} from "./helpers.ts";

const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./start.test.ts");

// Midnight parallel sync has 18s delay — increase assertion timeout
if (!process.env["E2E_MAX_TIMEOUT"]) {
  process.env["E2E_MAX_TIMEOUT"] = "180000";
}

async function main(): Promise<void> {
  let db: Client | null = null;
  let caughtError = false;
  try {
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    // ── Phase A: Infrastructure ────────────────────────────────────────────
    console.log("\n--- Phase A: Infrastructure ---\n");
    await waitForProcess("celestia-bridge-wait", {
      waitForExit: true,
      timeoutMs: 180_000,
    });
    await waitForProcess("celestia-fund-bridge", {
      waitForExit: true,
      timeoutMs: 60_000,
    });
    console.log("Celestia infrastructure ready.");

    await waitForProcess("midnight-proof-server-wait", {
      waitForExit: true,
      timeoutMs: 180_000,
    });
    console.log("Midnight infrastructure ready.");

    const { celestiaReadyTest } = await import("./infra/celestia-ready.test.ts");
    await celestiaReadyTest();

    const { midnightReadyTest } = await import("./infra/midnight-ready.test.ts");
    await midnightReadyTest();

    await waitForProcess("midnight-contract-deploy", {
      waitForExit: true,
      timeoutMs: 300_000,
    });
    console.log("Offer-files contract deployed.");

    await waitForProcess("sync");
    await waitForHealth();
    console.log("Sync node is healthy.\n");

    // ── Phase B: State Machine / DB ─────────────────────────────────────────
    console.log("\n--- Phase B: STM / DB / API ---\n");
    db = getDBConnection();

    const { zswapFlowTest } = await import("./stm/zswap-flow.test.ts");
    await zswapFlowTest(db);

    const { apiTest } = await import("./stm/api.test.ts");
    await apiTest(db);

    printSummary();
  } catch (e) {
    caughtError = true;
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfrastructure();
    if (caughtError || anyError()) process.exit(1);
    process.exit(0);
  }
}

main();

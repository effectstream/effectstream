/**
 * Midnight E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + Midnight node/indexer/proof-server + deploy + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify infrastructure)
 * 4. Runs sync tests (verify STM wrote correct values to DB)
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

// -- Tooling Tests (infrastructure validation) --------------------------------

async function runToolingTests(): Promise<void> {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");

  // Midnight node is responding on port 9944
  await assert("Midnight node is responding on port 9944", async () => {
    try {
      const response = await fetch("http://localhost:9944", {
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
    } catch {
      return false;
    }
  });

  // Midnight indexer is responding on port 8088
  await assert("Midnight indexer is responding on port 8088", async () => {
    try {
      const response = await fetch("http://localhost:8088/api/v3/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "{ __typename }",
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  });

  // Midnight contracts deployed (readMidnightContract files exist)
  await assert("Midnight counter contract deployed", async () => {
    try {
      const { readMidnightContract } = await import("@effectstream/midnight-contracts/read-contract");
      const info = readMidnightContract("contract-counter", { networkId: "undeployed" });
      return info.contractAddress !== undefined && info.contractAddress.length > 0;
    } catch {
      return false;
    }
  });

  await assert("Midnight EIP-20 contract deployed", async () => {
    try {
      const { readMidnightContract } = await import("@effectstream/midnight-contracts/read-contract");
      const info = readMidnightContract("contract-eip-20", { networkId: "undeployed" });
      return info.contractAddress !== undefined && info.contractAddress.length > 0;
    } catch {
      return false;
    }
  });
}

// -- Sync Tests (STM value validation) ----------------------------------------

async function runSyncTests(db: Client): Promise<void> {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");

  // Check that midnight_state has entries from the counter contract.
  // Contract deployment itself triggers an initial state write, so we expect
  // at least one row with primitive_name = 'midnightContractState'.
  await assertSQL<{ id: number; primitive_name: string; payload_json: string }>(
    "Midnight: midnight_state has counter contract entries",
    db,
    `SELECT id, primitive_name, payload_json FROM midnight_state
     WHERE primitive_name = 'midnightContractState'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const first = res.rows[0];
      // The payload should be valid JSON containing at least the round field
      try {
        const payload = JSON.parse(first.payload_json);
        return payload !== null && typeof payload === "object";
      } catch {
        // payload_json might already be a plain string representation
        return first.payload_json.length > 0;
      }
    },
  );

  // Check that primitive_accounting has MidnightContractState entries
  await assertSQL<{ primitive_name: string; payload: any }>(
    "Midnight: primitive_accounting has MidnightContractState entries",
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting
     WHERE primitive_name = 'MidnightContractState'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const first = res.rows[0];
      return first.primitive_name === "MidnightContractState";
    },
  );
}

// -- Main ---------------------------------------------------------------------

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();

    // 2. Wait for Midnight contracts deployed (infrastructure ready)
    await waitForProcess("midnight-contract", { waitForExit: true, timeoutMs: 300_000 });
    console.log("Midnight contracts deployed.\n");

    // 3. Run tooling tests (verify infra BEFORE sync)
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

/**
 * Bitcoin E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + Bitcoin Core + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify Bitcoin Core infrastructure)
 * 4. Runs sync tests (verify STM wrote correct values to DB)
 * 5. Shuts down everything
 */
import {
  anyError,
  printSummary,
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
  getDBConnection,
} from "@e2e-v2/engine";
import { assert, assertSQL } from "@e2e-v2/engine";
import path from "path";
import type { Client } from "pg";

const LAUNCHER = path.resolve(import.meta.dirname!, "./launcher.cli.ts");
const BTC_RPC = "http://127.0.0.1:18443";
const BTC_AUTH = "Basic " + btoa("dev:devpassword");

// ── Bitcoin RPC helper ────────────────────────────────────────────────────────

async function btcRpc(method: string, params: any[] = [], wallet?: string) {
  const url = wallet ? `${BTC_RPC}/wallet/${wallet}` : BTC_RPC;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: BTC_AUTH },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

// ── Phase 1: Tooling Tests ────────────────────────────────────────────────────

async function toolingTests() {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");

  await assert("Bitcoin Core RPC responds", async () => {
    const info = await btcRpc("getblockchaininfo");
    return info.chain === "regtest";
  });

  await assert("Bitcoin blocks mined (height > 100)", async () => {
    const info = await btcRpc("getblockchaininfo");
    return info.blocks > 100;
  });
}

// ── Phase 2: Sync Tests ──────────────────────────────────────────────────────

async function syncTests(db: Client) {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");
  // Bitcoin sync has delayMs=20000, so we need a longer assertSQL timeout
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  // The watch address should have received transactions from the block generator.
  // Wait for sync to catch up and process the bitcoin transactions.
  await assertSQL<{ address: string; direction: string; value_sats: string }>(
    "Bitcoin: transactions for watch address indexed in DB",
    db,
    `SELECT address, direction, value_sats
     FROM bitcoin_transactions
     WHERE address = 'bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03'
     ORDER BY id ASC;`,
    (res) => res.rows.length > 0,
    (res) => {
      const row = res.rows[0];
      return (
        row.address === "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03" &&
        BigInt(row.value_sats) > 0n
      );
    },
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure
    await startInfrastructure(LAUNCHER);
    await waitForOrchestrator();

    // 2. Wait for Bitcoin Core + blocks mined
    await waitForProcess("bitcoin-wait-for-block", { waitForExit: true, timeoutMs: 600_000 });
    console.log("Bitcoin infrastructure ready.\n");

    // 3. Run tooling tests (verify infra BEFORE sync)
    await toolingTests();

    // 4. Wait for sync node to be healthy
    await waitForProcess("sync");
    await waitForHealth();
    console.log("Sync node healthy.\n");

    // 5. Connect to DB and run sync tests
    db = getDBConnection();
    await syncTests(db);

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

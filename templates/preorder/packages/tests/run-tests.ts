import { anyError, printSummary } from "./helpers.ts";
import type { Client } from "pg";
import pg from "pg";
import path from "path";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ORCHESTRATOR_PORT = 4747;
const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const DB_PORT = parseInt(process.env["DB_PORT"] || "5432", 10);
const DB_HOST = process.env["DB_HOST"] || "localhost";
const DB_USER = process.env["DB_USER"] || "postgres";
const DB_PW = process.env["DB_PW"] || "postgres";
const DB_NAME = process.env["DB_NAME"] || "postgres";

const CLI_PATH = path.resolve(import.meta.dirname!, "../../node_modules/@effectstream/orchestrator/src/cli.ts");
const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./start.test.ts");

let orchestratorProc: ReturnType<typeof Bun.spawn> | null = null;

async function startInfrastructure(): Promise<void> {
  console.log("Starting test infrastructure...");
  orchestratorProc = Bun.spawn(["bun", CLI_PATH, "start", LAUNCHER_PATH], {
    cwd: path.resolve(import.meta.dirname!, "../.."),
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
}

async function stopInfrastructure(): Promise<void> {
  console.log("\nStopping infrastructure...");
  try {
    await fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, { method: "POST" });
  } catch { /* already down */ }
  await delay(2000);
  orchestratorProc?.kill();
}

async function waitForOrchestrator(): Promise<void> {
  console.log("Waiting for orchestrator...");
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/health`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await delay(500);
  }
  throw new Error("Orchestrator did not start within 120s");
}

async function waitForProcess(
  name: string,
  opts: { waitForExit?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const { waitForExit = false, timeoutMs = 120_000 } = opts;
  console.log(`Waiting for process "${name}"${waitForExit ? " to complete" : ""}...`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/processes`);
      if (res.ok) {
        const data = await res.json() as any;
        const proc = data.processes?.find((p: any) => p.name === name);
        if (proc) {
          if (waitForExit && proc.status === "done") return;
          if (!waitForExit && (proc.status === "running" || proc.status === "done")) return;
        }
      }
    } catch { /* not ready */ }
    await delay(500);
  }
  throw new Error(`Process "${name}" did not ${waitForExit ? "complete" : "start"} within ${timeoutMs / 1000}s`);
}

async function waitForHealth(timeoutMs = 120_000): Promise<void> {
  console.log("Waiting for sync node health...");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${API_PORT}/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ok") return;
      }
    } catch { /* not ready */ }
    await delay(500);
  }
  throw new Error("Sync node health check failed");
}

async function waitForSyncCaughtUp(timeoutMs = 120_000): Promise<void> {
  console.log("Waiting for sync node to catch up to EVM chain tip...");

  const evmRes = await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const evmData = await evmRes.json() as any;
  const chainTip = parseInt(evmData.result, 16);
  const target = chainTip - 1; // confirmationDepth = 1
  console.log(`EVM chain tip: ${chainTip}, sync target (depth-1): ${target}`);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${API_PORT}/block-heights`);
      if (res.ok) {
        const heights = await res.json() as any[];
        const evm = heights.find((h: any) => h.protocol_name === "parallelEvmRpc");
        if (evm && evm.synced_page != null && evm.synced_page >= target) {
          console.log(`Sync caught up: EVM synced_page=${evm.synced_page} >= target=${target}`);
          return;
        }
        if (evm) {
          console.log(`Sync progress: EVM synced_page=${evm.synced_page ?? "null"}, target=${target}`);
        }
      }
    } catch { /* not ready */ }
    await delay(1000);
  }
  throw new Error(`Sync node did not catch up to EVM block ${target} within ${timeoutMs / 1000}s`);
}

async function getDBConnection(): Promise<Client> {
  const client = new pg.Client({
    host: DB_HOST, user: DB_USER, password: DB_PW,
    database: DB_NAME, port: DB_PORT,
  });
  client.on("error", (err: Error) => console.error("DB error:", err));
  await client.connect();
  return client;
}

async function test() {
  let db: Client | null = null;
  let caughtError = false;
  try {
    await startInfrastructure();
    await waitForOrchestrator();

    // ── Phase A: Infrastructure ─────────────────────────────────────────
    console.log("\n--- Phase A: Infrastructure Tests ---\n");

    await waitForProcess("generate-evm-mod", { waitForExit: true });
    console.log("EVM contracts deployed and mod generated.");

    await waitForProcess("cardano-submit-tx", { waitForExit: true, timeoutMs: 300_000 });
    console.log("Cardano transactions submitted.");

    const { evmReadyTest } = await import("./infra/evm-ready.test.ts");
    await evmReadyTest();

    const { cardanoReadyTest } = await import("./infra/cardano-ready.test.ts");
    await cardanoReadyTest();

    // Wait for sync node
    await waitForProcess("sync");
    await waitForHealth();
    await waitForSyncCaughtUp();
    console.log("Sync node is healthy and caught up.\n");

    // ── Phase B: State Machine / DB ─────────────────────────────────────
    console.log("\n--- Phase B: STM / DB Tests ---\n");
    db = await getDBConnection();

    // Wait for user migrations (applied on block 1 processing)
    console.log("Waiting for user migrations...");
    {
      const start = Date.now();
      let found = false;
      while (Date.now() - start < 60_000) {
        try {
          await db.query("SELECT 1 FROM launchpad_users LIMIT 0");
          found = true;
          break;
        } catch { await delay(1000); }
      }
      if (!found) {
        throw new Error("User migrations not applied within 60s — launchpad_users table does not exist");
      }
      console.log("User migrations applied.");
    }

    const { buyItemsNativeTest } = await import("./stm/buy-items-native.test.ts");
    await buyItemsNativeTest(db);

    const { buyItemsErc20Test } = await import("./stm/buy-items-erc20.test.ts");
    await buyItemsErc20Test(db);

    const { validationTest } = await import("./stm/validation.test.ts");
    await validationTest(db);

    const { cardanoPaymentTest } = await import("./stm/cardano-payment.test.ts");
    await cardanoPaymentTest(db);

    // ── Phase C: API Tests ──────────────────────────────────────────────
    console.log("\n--- Phase C: API Tests ---\n");

    const { launchpadsApiTest } = await import("./api/launchpads.test.ts");
    await launchpadsApiTest();

    const { userDataApiTest } = await import("./api/user-data.test.ts");
    await userDataApiTest();

    const { marketplaceApiTest } = await import("./api/marketplace.test.ts");
    await marketplaceApiTest();

    // ── Phase D: Cross-chain Tests ──────────────────────────────────────
    console.log("\n--- Phase D: Cross-chain Tests ---\n");

    const { multiPaymentTest } = await import("./cross-chain/multi-payment.test.ts");
    await multiPaymentTest();

    // ── Phase E: Frontend Tests ─────────────────────────────────────────
    console.log("\n--- Phase E: Frontend Tests ---\n");

    const { frontendBuildTest } = await import("./frontend/build-smoke.test.ts");
    await frontendBuildTest();

    const { frontendE2eTest } = await import("./frontend/e2e.test.ts");
    await frontendE2eTest();

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

test();

/**
 * EVM E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + Hardhat + deploy + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify infrastructure)
 * 4. Runs sync tests (verify STM wrote correct values to DB)
 * 5. Shuts down everything
 */
import {
  anyError,
  newSharedState,
  printSummary,
  type SharedState,
} from "@e2e-v2/engine";
import type { Client, PoolConfig } from "pg";
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

const CLI_PATH = path.resolve(import.meta.dirname!, "../../packages/build-tools/orchestrator-v2/src/cli.ts");
const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

// ── Infrastructure lifecycle ──────────────────────────────────────────────────

let orchestratorProc: ReturnType<typeof Bun.spawn> | null = null;

async function startInfrastructure(): Promise<void> {
  console.log(`Starting infrastructure via orchestrator-v2...`);
  console.log(`  CLI: ${CLI_PATH}`);
  console.log(`  Config: ${LAUNCHER_PATH}`);

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
  } catch {
    // orchestrator may already be down
  }
  // Give it a moment to clean up
  await delay(2000);
  orchestratorProc?.kill();
}

// ── Wait for services ─────────────────────────────────────────────────────────

async function waitForOrchestrator(): Promise<void> {
  console.log("Waiting for orchestrator API...");
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
  throw new Error(`Sync node health check failed within ${timeoutMs / 1000}s`);
}

// ── DB connection ─────────────────────────────────────────────────────────────

function getDBConnection(): Client {
  const client = new pg.Client({
    host: DB_HOST, user: DB_USER, password: DB_PW,
    database: DB_NAME, port: DB_PORT,
  });
  client.connect(() => {});
  client.on("error", (err: Error) => console.error("DB error:", err));
  return client;
}

// ── Test phases ───────────────────────────────────────────────────────────────

async function runToolingTests(): Promise<void> {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");
  const { hardhatLaunchTest } = await import("./tooling/hardhat-launch.test.ts");
  const { walletsTest } = await import("./tooling/wallets.test.ts");
  const { deployTest } = await import("./tooling/deploy.test.ts");
  const { transactionsTest } = await import("./tooling/transactions.test.ts");

  await hardhatLaunchTest();
  await walletsTest();
  await deployTest();
  await transactionsTest();
}

async function runSyncTests(db: Client, sharedState: SharedState): Promise<void> {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");
  const { erc20SyncTest } = await import("./sync/erc20.test.ts");
  const { erc721SyncTest } = await import("./sync/erc721.test.ts");
  const { erc1155SyncTest } = await import("./sync/erc1155.test.ts");
  const { paimaL2SyncTest } = await import("./sync/paima-l2.test.ts");
  const { customCounterSyncTest } = await import("./sync/custom-counter.test.ts");
  const { multiChainSyncTest } = await import("./sync/multi-chain.test.ts");
  const { scheduledDataTest } = await import("./sync/scheduled-data.test.ts");
  const { errorProcessingTest } = await import("./sync/error-processing.test.ts");

  await paimaL2SyncTest(db, sharedState);
  await erc20SyncTest(db, sharedState);
  await erc721SyncTest(db, sharedState);
  await erc1155SyncTest(db, sharedState);
  await customCounterSyncTest(db, sharedState);
  await multiChainSyncTest(db, sharedState);
  await scheduledDataTest(db, sharedState);
  await errorProcessingTest(db, sharedState);

  // Phase 3: Batcher tests (require sync + batcher running)
  console.log("\n--- Phase 3: Batcher Tests ---\n");
  const { batcherSyncTest } = await import("./sync/batcher.test.ts");
  await batcherSyncTest(db, sharedState);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure
    await startInfrastructure();
    await waitForOrchestrator();

    // 2. Wait for hardhat + contracts deployed + mod.ts generated
    await waitForProcess("generate-evm-mod", { waitForExit: true });
    console.log("EVM contracts deployed.\n");

    // 3. Run tooling tests (verify infra BEFORE sync)
    await runToolingTests();

    // 4. Wait for sync node + batcher to be healthy
    await waitForProcess("sync");
    await waitForProcess("batcher");
    await waitForHealth();
    console.log("Sync node + batcher are healthy.\n");

    // 5. Connect to DB and run sync tests (includes batcher tests)
    db = getDBConnection();
    const sharedState: SharedState = newSharedState();
    await runSyncTests(db, sharedState);

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

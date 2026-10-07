import { anyError, printSummary } from "./helpers.ts";
import type { Client } from "pg";
import pg from "pg";
import path from "path";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ORCHESTRATOR_PORT = 4747;
const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const DB_PORT = parseInt(process.env["DB_PORT"] || "5432", 10);

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

async function test() {
  let db: Client | null = null;
  let caughtError = false;
  try {
    await startInfrastructure();
    await waitForOrchestrator();

    console.log("\n--- Phase A: Infrastructure Tests ---\n");
    await waitForProcess("generate-evm-mod", { waitForExit: true, timeoutMs: 300_000 });
    console.log("EVM contracts deployed.");

    const { chainReadyTest } = await import("./infra/chain-ready.test.ts");
    await chainReadyTest();

    const { deployTest } = await import("./infra/deploy.test.ts");
    await deployTest();

    await waitForProcess("sync");
    await waitForHealth();
    console.log("Sync node is healthy.\n");

    console.log("\n--- Phase B: STM / DB / API Tests ---\n");
    db = new pg.Client({
      host: "localhost",
      user: "postgres",
      password: "postgres",
      database: "postgres",
      port: DB_PORT,
    });
    db.connect(() => {});
    db.on("error", (err: Error) => console.error("DB error:", err));

    const {
      saleAndOwnershipTest,
      nftMintTest,
      lvlUpTest,
      lvlUpAuthTest,
    } = await import("./stm/actions.test.ts");

    await saleAndOwnershipTest(db);
    await nftMintTest(db);
    await lvlUpTest(db);
    await lvlUpAuthTest(db);

    const { apiTest } = await import("./stm/api.test.ts");
    await apiTest();

    console.log("\n--- Phase C: Frontend Tests ---\n");
    await waitForProcess("frontend-build", { waitForExit: true, timeoutMs: 180_000 });
    await waitForProcess("frontend-server", { timeoutMs: 60_000 });

    const { frontendBuildTest } = await import("./frontend/build-smoke.test.ts");
    await frontendBuildTest();

    const { frontendRenderTest } = await import("./frontend/render.test.ts");
    await frontendRenderTest();

    const { frontendInteractionsTest } = await import(
      "./frontend/interactions.test.ts"
    );
    await frontendInteractionsTest();

    // Real end-to-end test: drives the local-JS wallet (EvmViem) through connect
    // → gameplay render → write tx in headless Chromium. Only possible because
    // EvmViem doesn't need a browser extension.
    const { frontendE2ETest } = await import("./frontend/e2e.test.ts");
    await frontendE2ETest();

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

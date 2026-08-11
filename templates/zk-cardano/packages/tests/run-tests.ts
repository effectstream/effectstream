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
  let deadExit: number | string | null = null;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/processes`);
      if (res.ok) {
        const data = await res.json() as any;
        const proc = data.processes?.find((p: any) => p.name === name);
        if (proc) {
          // Fail fast: a process that has already died will never reach
          // "done"/"running", so waiting out the timeout only buries the real
          // error under a misleading "did not complete within Ns". Recorded
          // here and thrown below because the catch swallows everything.
          if (proc.status === "failed" || proc.status === "stopped") {
            deadExit = proc.exitCode ?? "unknown";
          }
          if (waitForExit && proc.status === "done") return;
          if (!waitForExit && (proc.status === "running" || proc.status === "done")) return;
        }
      }
    } catch { /* not ready */ }
    if (deadExit !== null) {
      throw new Error(
        `Process "${name}" exited with code ${deadExit} while waiting for it to ${waitForExit ? "complete" : "start"}`,
      );
    }
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

function getDBConnection(): Client {
  const client = new pg.Client({
    host: DB_HOST, user: DB_USER, password: DB_PW,
    database: DB_NAME, port: DB_PORT,
  });
  client.connect(() => {});
  client.on("error", (err: Error) => console.error("DB error:", err));
  return client;
}

async function test() {
  let db: Client | null = null;
  // Infrastructure that never came up throws outside any assertion, leaving
  // anyError() false once an earlier phase has passed. Track it explicitly so
  // a boot failure can't exit 0 with later phases silently skipped.
  let infraError = false;
  try {
    await startInfrastructure();
    await waitForOrchestrator();

    // ── Phase A: Infrastructure ─────────────────────────────────────────
    console.log("\n--- Phase A: Infrastructure Tests ---\n");

    await waitForProcess("cardano-submit-tx", { waitForExit: true, timeoutMs: 300_000 });
    console.log("Cardano transactions submitted.");

    const { cardanoReadyTest } = await import("./infra/cardano-ready.test.ts");
    await cardanoReadyTest();

    await waitForProcess("midnight-contract", { waitForExit: true, timeoutMs: 600_000 });
    console.log("Midnight contract deployed.");

    const { midnightReadyTest } = await import("./infra/midnight-ready.test.ts");
    await midnightReadyTest();

    // Wait for sync node
    await waitForProcess("sync");
    await waitForHealth();
    console.log("Sync node is healthy.\n");

    const { syncReadyTest } = await import("./infra/sync-ready.test.ts");
    await syncReadyTest();

    // ── Phase B: State Machine ──────────────────────────────────────────
    console.log("\n--- Phase B: State Machine Tests ---\n");
    db = getDBConnection();

    const { delegationTest } = await import("./stm/delegation.test.ts");
    await delegationTest(db);

    const { ballotStateTest } = await import("./stm/ballot-state.test.ts");
    await ballotStateTest(db);

    const { crossChainTest } = await import("./stm/cross-chain.test.ts");
    await crossChainTest(db);

    // ── Phase C: API Tests ──────────────────────────────────────────────
    console.log("\n--- Phase C: API Tests ---\n");

    const { eligibilityApiTest } = await import("./api/eligibility.test.ts");
    await eligibilityApiTest(db);

    const { proposalsApiTest } = await import("./api/proposals.test.ts");
    await proposalsApiTest();

    // ── Phase D: Frontend Tests ─────────────────────────────────────────
    console.log("\n--- Phase D: Frontend Tests ---\n");
    const { frontendBuildTest } = await import("./frontend/build-smoke.test.ts");
    await frontendBuildTest();

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

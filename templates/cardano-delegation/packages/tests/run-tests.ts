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

const CLI_PATH = path.resolve(
  import.meta.dirname!,
  "../../node_modules/@effectstream/orchestrator/src/cli.ts",
);
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
    await fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, {
      method: "POST",
    });
  } catch {
    /* already down */
  }
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
    } catch {
      /* not ready */
    }
    await delay(500);
  }
  throw new Error("Orchestrator did not start within 120s");
}

async function waitForProcess(
  name: string,
  opts: { waitForExit?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const { waitForExit = false, timeoutMs = 120_000 } = opts;
  console.log(
    `Waiting for process "${name}"${waitForExit ? " to complete" : ""}...`,
  );
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(
        `http://localhost:${ORCHESTRATOR_PORT}/processes`,
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const proc = data.processes?.find((p: any) => p.name === name);
        if (proc) {
          if (waitForExit && proc.status === "done") return;
          if (
            !waitForExit &&
            (proc.status === "running" || proc.status === "done")
          )
            return;
        }
      }
    } catch {
      /* not ready */
    }
    await delay(500);
  }
  throw new Error(
    `Process "${name}" did not ${waitForExit ? "complete" : "start"} within ${timeoutMs / 1000}s`,
  );
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
    } catch {
      /* not ready */
    }
    await delay(500);
  }
  throw new Error("Sync node health check failed");
}

async function waitForUrl(
  url: string,
  timeoutMs = 60_000,
  bodyCheck?: (body: string) => boolean,
): Promise<void> {
  console.log(`Waiting for ${url}...`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        if (!bodyCheck) return;
        const body = await res.text();
        if (bodyCheck(body)) return;
      }
    } catch {
      /* not ready */
    }
    await delay(500);
  }
  throw new Error(`${url} did not respond within ${timeoutMs / 1000}s`);
}

function getDBConnection(): Client {
  const client = new pg.Client({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PW,
    database: DB_NAME,
    port: DB_PORT,
  });
  client.connect(() => {});
  client.on("error", (err: Error) => console.error("DB error:", err));
  return client;
}

async function test() {
  let db: Client | null = null;
  try {
    await startInfrastructure();
    await waitForOrchestrator();

    // -- Phase A: Infrastructure --
    console.log("\n--- Phase A: Infrastructure Tests ---\n");

    await waitForProcess("dolos-minibf-wait", { waitForExit: true, timeoutMs: 300_000 });

    const { cardanoReadyTest } = await import("./infra/cardano-ready.test.ts");
    await cardanoReadyTest();

    await waitForProcess("sync");
    await waitForHealth();
    console.log("Sync node is healthy.");

    console.log("Waiting for application migrations (first block)...");
    await waitForUrl(`http://localhost:${API_PORT}/api/pool-stats`, 120_000, (body) => {
      try { return JSON.parse(body).length > 0; } catch { return false; }
    });
    console.log("Application tables ready.\n");

    // -- Phase B: State Machine / DB --
    console.log("\n--- Phase B: State Machine Tests ---\n");
    db = getDBConnection();

    const { poolDelegationTest } = await import(
      "./stm/pool-delegation.test.ts"
    );
    await poolDelegationTest(db);

    // -- Phase C: Playwright E2E Tests --
    console.log("\n--- Phase C: Playwright E2E Tests ---\n");

    await waitForProcess("frontend-server");
    await waitForUrl("http://localhost:10599");

    const frontendDir = path.resolve(import.meta.dirname!, "../frontend");

    console.log("Installing Playwright browsers...");
    const installProc = Bun.spawn(
      ["bunx", "playwright", "install", "chromium"],
      {
        cwd: frontendDir,
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    await installProc.exited;

    console.log("Running Playwright tests...");
    const playwrightProc = Bun.spawn(
      ["bunx", "playwright", "test", "--config", "playwright.config.ts"],
      {
        cwd: frontendDir,
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    const playwrightExit = await playwrightProc.exited;

    const { assert } = await import("./helpers.ts");
    await assert(
      "Playwright E2E tests pass",
      async () => playwrightExit === 0,
    );

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

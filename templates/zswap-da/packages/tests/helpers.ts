import pg from "pg";
import path from "node:path";
import type { Client } from "pg";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const ORCHESTRATOR_PORT = 4747;
export const API_PORT = parseInt(
  process.env["EFFECTSTREAM_API_PORT"] || "9999",
  10,
);

const DB_HOST = process.env["DB_HOST"] || "localhost";
const DB_USER = process.env["DB_USER"] || "postgres";
const DB_PW = process.env["DB_PW"] || "postgres";
const DB_NAME = process.env["DB_NAME"] || "postgres";
const DB_PORT = parseInt(process.env["DB_PORT"] || "5432", 10);

const getMaxTimeout = (): number => {
  const envVal = process.env["E2E_MAX_TIMEOUT"];
  return envVal ? parseInt(envVal, 10) : 20000;
};

const testResults = {
  count: 0,
  passed: 0,
  failed: 0,
};

export function printSummary() {
  console.log(`\n[Summary]`);
  console.log(`  ${testResults.passed} tests passed`);
  console.log(`  ${testResults.failed} tests failed`);
}

export function anyError(): boolean {
  return testResults.count === 0 || testResults.failed > 0;
}

function startTest(testName: string) {
  console.log(`[Running] ${testResults.count + 1}: ${testName}`);
  testResults.count++;
}

export async function assert(
  testName: string,
  check: () => Promise<boolean>,
): Promise<boolean> {
  startTest(testName);
  try {
    const result = await check();
    if (!result) {
      testResults.failed++;
      console.log(`[FAIL] ${testName}`);
      return false;
    }
    testResults.passed++;
    console.log(`[PASS] ${testName}`);
    return true;
  } catch (e) {
    testResults.failed++;
    console.log(`[FAIL] ${testName}`);
    console.error("[ERROR]", e);
    return false;
  }
}

export async function assertSQL<RowType>(
  testName: string,
  db: Client,
  query: string,
  waitUntil: (rows: RowType[]) => boolean,
  check: (rows: RowType[]) => boolean,
): Promise<RowType[]> {
  startTest(testName);
  let remainingTime = getMaxTimeout();
  const retryDelay = 200;

  while (remainingTime > 0) {
    try {
      const res = await db.query<RowType>(query);
      if (!waitUntil(res.rows)) {
        await delay(retryDelay);
        remainingTime -= retryDelay;
        if (remainingTime <= 0) {
          testResults.failed++;
          console.log(`[FAIL] ${testName} (timeout waiting for data)`);
          console.error("[TIMEOUT] Data in DB:", res.rows);
          return res.rows;
        }
        continue;
      }

      if (!check(res.rows)) {
        testResults.failed++;
        console.log(`[FAIL] ${testName}`);
        console.error("[CHECK_ERROR] Data in DB:", res.rows);
        return res.rows;
      }

      testResults.passed++;
      console.log(`[PASS] ${testName}`);
      return res.rows;
    } catch (e) {
      await delay(retryDelay);
      remainingTime -= retryDelay;
      if (remainingTime <= 0) {
        testResults.failed++;
        console.log(`[FAIL] ${testName} (error)`);
        console.error("[ERROR]", e);
        return [];
      }
    }
  }
  return [];
}

let orchestratorProc: ReturnType<typeof Bun.spawn> | null = null;

export async function startInfrastructure(launcherPath: string): Promise<void> {
  const cliPath = path.resolve(
    import.meta.dirname!,
    "../../node_modules/@effectstream/orchestrator/src/cli.ts",
  );
  const cwd = path.resolve(import.meta.dirname!, "../..");
  console.log(`Starting test infrastructure (${cliPath})`);
  orchestratorProc = Bun.spawn(["bun", cliPath, "start", launcherPath], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
}

export async function stopInfrastructure(): Promise<void> {
  console.log("\nStopping infrastructure...");
  process.on("SIGTERM", () => {});
  try {
    await fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, {
      method: "POST",
    });
  } catch {
    // already down
  }
  await delay(2000);
  orchestratorProc?.kill();
}

export async function waitForOrchestrator(timeoutMs = 120_000): Promise<void> {
  console.log("Waiting for orchestrator...");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/health`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await delay(500);
  }
  throw new Error("Orchestrator did not start within timeout");
}

export async function waitForProcess(
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
            !waitForExit && (proc.status === "running" || proc.status === "done")
          ) {
            return;
          }
        }
      }
    } catch {
      // not ready
    }
    await delay(500);
  }
  throw new Error(
    `Process "${name}" did not ${
      waitForExit ? "complete" : "start"
    } within ${timeoutMs / 1000}s`,
  );
}

export async function waitForHealth(timeoutMs = 120_000): Promise<void> {
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
      // not ready
    }
    await delay(500);
  }
  throw new Error("Sync node health check failed");
}

export function getDBConnection(): Client {
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

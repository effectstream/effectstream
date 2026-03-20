/**
 * Shared test harness for starting/stopping EVM infrastructure.
 * Used by both evm/run-tests.ts and features/ tests.
 */
import pg from "pg";
import path from "path";
import type { Client } from "pg";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const ORCHESTRATOR_PORT = 4747;
export const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);

const DB_HOST = process.env["DB_HOST"] || "localhost";
const DB_USER = process.env["DB_USER"] || "postgres";
const DB_PW = process.env["DB_PW"] || "postgres";
const DB_NAME = process.env["DB_NAME"] || "postgres";
const DB_PORT = parseInt(process.env["DB_PORT"] || "5432", 10);

// Resolve from e2e-v2/shared/engine/ up to repo root
const CLI_PATH = path.resolve(import.meta.dirname!, "../../../packages/build-tools/orchestrator-v2/src/cli.ts");

let orchestratorProc: ReturnType<typeof Bun.spawn> | null = null;

export async function startInfrastructure(launcherPath: string): Promise<void> {
  const cwd = path.resolve(import.meta.dirname!, "../../..");
  console.log(`Starting infrastructure: ${path.basename(launcherPath)}`);
  orchestratorProc = Bun.spawn(["bun", CLI_PATH, "start", launcherPath], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
}

export async function stopInfrastructure(): Promise<void> {
  console.log("\nStopping infrastructure...");
  try {
    await fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, { method: "POST" });
  } catch { /* already down */ }
  await delay(2000);
  orchestratorProc?.kill();
}

export async function waitForOrchestrator(timeoutMs = 120_000): Promise<void> {
  console.log("Waiting for orchestrator API...");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/health`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await delay(500);
  }
  throw new Error("Orchestrator did not start within timeout");
}

export async function waitForProcess(
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

export async function waitForHealth(timeoutMs = 60_000): Promise<void> {
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

export function getDBConnection(): Client {
  const client = new pg.Client({
    host: DB_HOST, user: DB_USER, password: DB_PW,
    database: DB_NAME, port: DB_PORT,
  });
  client.connect(() => {});
  client.on("error", (err: Error) => console.error("DB error:", err));
  return client;
}

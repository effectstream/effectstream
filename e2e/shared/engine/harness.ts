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

// Resolve from e2e/shared/engine/ up to repo root
const CLI_PATH = path.resolve(import.meta.dirname!, "../../../packages/build-tools/orchestrator/src/cli.ts");

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
  // Ignore SIGTERM during shutdown — child process cleanup propagates signals
  const origHandler = process.listeners("SIGTERM");
  process.removeAllListeners("SIGTERM");
  process.on("SIGTERM", () => {});
  try {
    await fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, { method: "POST" });
  } catch { /* already down */ }
  if (orchestratorProc) {
    const timeout = setTimeout(() => orchestratorProc?.kill(), 15_000);
    await orchestratorProc.exited;
    clearTimeout(timeout);
    orchestratorProc = null;
  }
  // Restore original SIGTERM handlers
  process.removeAllListeners("SIGTERM");
  for (const handler of origHandler) {
    process.on("SIGTERM", handler as (...args: any[]) => void);
  }
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
    } catch { /* not ready */ }
    await delay(500);
  }
  throw new Error(`Sync node health check failed within ${timeoutMs / 1000}s`);
}

export async function waitForBlock(
  blockHeight: number,
  timeoutMs = 120_000,
): Promise<void> {
  console.log(`Waiting for block ${blockHeight} to be finalized...`);
  const start = Date.now();
  const client = getDBConnection();
  try {
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await client.query(
          `SELECT block_height FROM effectstream.effectstream_blocks
           WHERE effectstream_block_hash IS NOT NULL
           ORDER BY block_height DESC LIMIT 1`,
        );
        if (res.rows.length > 0 && res.rows[0].block_height >= blockHeight) {
          console.log(`Block ${res.rows[0].block_height} finalized.`);
          return;
        }
      } catch { /* table may not exist yet */ }
      await delay(500);
    }
    throw new Error(`Block ${blockHeight} not finalized within ${timeoutMs / 1000}s`);
  } finally {
    await client.end();
  }
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

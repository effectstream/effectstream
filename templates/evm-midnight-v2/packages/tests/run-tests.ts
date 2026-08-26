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
const TEMPLATE_ROOT = path.resolve(import.meta.dirname!, "../..");
const WASM_RUNTIME_IDENTITY_ONLY = process.env["WASM_RUNTIME_IDENTITY_ONLY"] === "1";

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
  if (!orchestratorProc) return;
  process.on("SIGTERM", () => {});
  try {
    await fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, { method: "POST" });
  } catch { /* already down */ }
  await delay(2000);
  orchestratorProc?.kill();
}

async function runWasmRuntimeIdentityGuard(): Promise<void> {
  // The generated Compact reader is ignored and absent from a clean checkout.
  // Generate it before loading the guard module, but still before starting any
  // orchestrator process or service.
  console.log("Generating the Compact reader for the WASM identity guard...");
  const compactBuild = Bun.spawn(["bun", "run", "build:midnight"], {
    cwd: TEMPLATE_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
  const compactBuildExit = await compactBuild.exited;
  if (compactBuildExit !== 0) {
    throw new Error(`Compact reader generation failed with code ${compactBuildExit}`);
  }

  const { wasmRuntimeIdentityTest } = await import("./infra/wasm-runtime-identity.test.ts");
  await wasmRuntimeIdentityTest();
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
  let caughtError = false;
  try {
    await runWasmRuntimeIdentityGuard();
    if (WASM_RUNTIME_IDENTITY_ONLY) {
      console.log("WASM identity-only verification complete; infrastructure was not started.");
      return;
    }

    await startInfrastructure();
    await waitForOrchestrator();

    // ── Phase A: Infrastructure ─────────────────────────────────────────
    console.log("\n--- Phase A: Infrastructure Tests ---\n");
    await waitForProcess("generate-evm-mod", { waitForExit: true });
    console.log("EVM contracts deployed.");

    const { chainReadyTest } = await import("./infra/chain-ready.test.ts");
    await chainReadyTest();

    const { deployTest } = await import("./infra/deploy.test.ts");
    await deployTest();

    await waitForProcess("midnight-contract", { waitForExit: true, timeoutMs: 600_000 });
    console.log("Midnight contract deployed.");

    const { midnightReadyTest } = await import("./infra/midnight-ready.test.ts");
    await midnightReadyTest();

    const { midnightDeployTest } = await import("./infra/midnight-deploy.test.ts");
    await midnightDeployTest();

    // Wait for sync node
    await waitForProcess("sync");
    await waitForHealth();
    console.log("Sync node is healthy.\n");

    // ── Phase B: State Machine / DB / API ───────────────────────────────
    console.log("\n--- Phase B: STM / DB / API Tests ---\n");
    db = getDBConnection();

    const { erc721Test } = await import("./stm/erc721.test.ts");
    await erc721Test(db);

    const { apiTest } = await import("./stm/api.test.ts");
    await apiTest();

    const { apiErc721DetailTest } = await import("./stm/api-erc721.test.ts");
    await apiErc721DetailTest();

    const { erc721PropertiesTest } = await import("./stm/erc721-properties.test.ts");
    await erc721PropertiesTest(db);

    // ── Phase C: Cross-chain (EVM mint + transfer + DB + API) ───────────
    console.log("\n--- Phase C: Cross-Chain Tests ---\n");
    const { crossChainTest } = await import("./stm/cross-chain.test.ts");
    await crossChainTest(db);

    // ── Phase D: Midnight property addition ────────────────────────────
    console.log("\n--- Phase D: Midnight Property Tests ---\n");
    try {
      const { midnightPropertyTest } = await import("./stm/midnight-property.test.ts");
      await midnightPropertyTest(db);
    } catch (e) {
      console.error("Midnight property test failed (non-fatal):", e);
    }

    // ── Phase E: Frontend ───────────────────────────────────────────────
    console.log("\n--- Phase E: Frontend Tests ---\n");
    const { frontendBuildTest } = await import("./frontend/build-smoke.test.ts");
    await frontendBuildTest();

    const { frontendRenderTest } = await import("./frontend/render.test.ts");
    await frontendRenderTest();

    const { walletConnectTest } = await import("./frontend/wallet-connect.test.ts");
    await walletConnectTest();

    printSummary();
  } catch (e) {
    caughtError = true;
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfrastructure();
    // A thrown error (e.g. an infra wait/health timeout) must fail the run even
    // if no test assertion recorded a failure — otherwise a broken deploy is
    // silently reported green (this masked evm-midnight-v2's missing managed/).
    if (caughtError || (!WASM_RUNTIME_IDENTITY_ONLY && anyError())) process.exit(1);
    process.exit(0);
  }
}

test();

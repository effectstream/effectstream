/**
 * Effectstream Node — performance / load test (MANUAL ONLY, not part of CI).
 *
 *   # smoke (PGLite, small N)
 *   bun run e2e/perf/run-tests.ts
 *
 *   # full run (real Postgres) — start PG first, then:
 *   PGLITE=false DB_HOST=... DB_PORT=... DB_USER=... DB_PW=... DB_NAME=... \
 *     TOTAL=1000000 bun run e2e/perf/run-tests.ts
 *
 * Drives volume through Counter.bulkIncrement(n) (n events per tx, one entry per
 * event) and measures: sync lag (mainNtp.buf × blockTimeMS/1000), throughput
 * (entries/sec, blocks/sec), peak memory, and API latency.
 *
 * Phase A — catch-up burst: fire all txs as fast as possible to build a backlog,
 *           then measure how fast the node drains it.
 * Phase B — steady-state: submit at a fixed rate, measure sustained behaviour.
 */
import {
  getDBConnection,
  startInfrastructure,
  stopInfrastructure,
  waitForBlock,
  waitForHealth,
  waitForOrchestrator,
  waitForProcess,
} from "@e2e/engine";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import pg from "pg";
import type { Client } from "pg";
import path from "path";
import { spawn } from "child_process";
import {
  getMetricsOnce,
  type PhaseResult,
  printReport,
  Sampler,
} from "./metrics.ts";
import { writeReport } from "./report.ts";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Knobs ──────────────────────────────────────────────────────────────────
const TOTAL = parseInt(process.env["TOTAL"] || "10000", 10);
const EVENTS_PER_TX = parseInt(process.env["EVENTS_PER_TX"] || "100", 10);
const BLOCK_TIME_MS = parseInt(process.env["PERF_NTP_BLOCK_TIME_MS"] || "1000", 10);
const SEND_CONCURRENCY = parseInt(process.env["PERF_SEND_CONCURRENCY"] || "200", 10);
// Phase A submission rate (tx/s). 0 = instant burst (catch-up test, all data
// collapses into ~1 block). Set >0 to PACE submission so events spread across
// blocks: at blockTimeMS-per-block, N seconds of submission ⇒ ~N×(1000/blockTimeMS)
// blocks. e.g. 5000 txs at 25 tx/s with blockTimeMS=200 ⇒ ~200s ⇒ ~1000 blocks.
const PHASE_A_TPS = parseInt(process.env["PERF_PHASE_A_TPS"] || "0", 10);
const SAMPLE_INTERVAL_MS = parseInt(process.env["PERF_SAMPLE_INTERVAL_MS"] || "1000", 10);
const RUN_PHASE_B = process.env["PERF_SKIP_PHASE_B"] !== "1";
const PHASE_B_TPS = parseInt(process.env["PERF_PHASE_B_TPS"] || "20", 10);
const PHASE_B_DURATION_S = parseInt(process.env["PERF_PHASE_B_DURATION_S"] || "30", 10);
// Generous per-tx gas; bump hardhat block gas limit if EVENTS_PER_TX is large.
const TX_GAS = BigInt(process.env["PERF_TX_GAS"] || String(200_000 + EVENTS_PER_TX * 15_000));
// Hardhat mempool mining interval (ms). 0 disables interval mining (auto-mine,
// one block per tx). With interval mining the mempool queues out-of-order nonces
// so a concurrent burst lands every tx. Default depends on mode:
//   - burst (PHASE_A_TPS=0): 100ms — drain the mempool fast.
//   - paced (PHASE_A_TPS>0): blockTimeMS — mine 1 block per NTP block so EVM
//     block timestamps (whole seconds) track real time and align with the NTP
//     main. Mining faster bumps EVM time +1s/block, racing ahead of wall-clock
//     and starving the merge (the node idles waiting for blocks, then stalls).
// An explicit PERF_MINE_INTERVAL_MS always wins.
const MINE_INTERVAL_MS = process.env["PERF_MINE_INTERVAL_MS"] != null
  ? parseInt(process.env["PERF_MINE_INTERVAL_MS"], 10)
  : PHASE_A_TPS > 0
  ? BLOCK_TIME_MS
  : 100;
// Auto-open the generated HTML report in the default browser. Set PERF_NO_OPEN=1
// to skip (e.g. headless / remote runs).
const OPEN_REPORT = process.env["PERF_NO_OPEN"] !== "1";
// On external Postgres (PGLITE=false), drop + recreate the target DB before each
// run so every run starts from a clean schema. Set PERF_DB_RESET=0 to skip.
const USE_PGLITE = process.env["PGLITE"] !== "false";
const DB_RESET = process.env["PERF_DB_RESET"] !== "0";
const DB_CONN = {
  host: process.env["DB_HOST"] || "localhost",
  port: parseInt(process.env["DB_PORT"] || "5432", 10),
  user: process.env["DB_USER"] || "postgres",
  password: process.env["DB_PW"] || "postgres",
};
const DB_NAME = process.env["DB_NAME"] || "postgres";
// Maintenance/template DBs we must never drop (and can't, while connected).
const RESERVED_DBS = new Set(["postgres", "template0", "template1"]);

const wallet0 = {
  privateKey:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
};

const counterAbi = [
  { inputs: [], name: "incrementCounter", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "n", type: "uint256" }], name: "bulkIncrement", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "getCount", outputs: [{ name: "", type: "int256" }], stateMutability: "view", type: "function" },
] as const;

const ORCHESTRATOR_PORT = 4747;
const CLI_PATH = path.resolve(
  import.meta.dirname!,
  "../../packages/build-tools/orchestrator/src/cli.ts",
);
const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./launcher.cli.ts");

const account = privateKeyToAccount(wallet0.privateKey);
const walletClient = createWalletClient({ account, chain: hardhat, transport: http() });
const publicClient = createPublicClient({ chain: hardhat, transport: http() });

let counterAddress: `0x${string}`;

/**
 * Switch Hardhat from auto-mine (one block per tx, rejects out-of-order nonces)
 * to mempool + interval mining (queues any nonce order, mines every intervalMs).
 * Best-effort: logs and continues if the node isn't Hardhat or rejects the call.
 */
async function enableIntervalMining(intervalMs: number): Promise<void> {
  if (intervalMs <= 0) return;
  try {
    await (publicClient as any).request({ method: "evm_setAutomine", params: [false] });
    await (publicClient as any).request({ method: "evm_setIntervalMining", params: [intervalMs] });
    console.log(`  Hardhat interval mining: ${intervalMs}ms (auto-mine off)`);
  } catch (e: any) {
    console.warn(`  could not enable interval mining (falling back to auto-mine): ${e?.shortMessage || e?.message || e}`);
  }
}

/** Restore Hardhat's default auto-mine. Best-effort. */
async function restoreAutomine(): Promise<void> {
  if (MINE_INTERVAL_MS <= 0) return;
  try {
    await (publicClient as any).request({ method: "evm_setIntervalMining", params: [0] });
    await (publicClient as any).request({ method: "evm_setAutomine", params: [true] });
  } catch { /* infra is tearing down anyway */ }
}

/**
 * Fail fast if the chain isn't fresh. The DB auto-reset can't clean the chain,
 * so an orphaned Hardhat from a previous run (notably one left behind by a
 * *failed* run on port 8545) would let the node ingest a stale, much larger
 * event history and silently corrupt results. A fresh deploy starts the Counter
 * at 0, so a non-zero count means we're pointed at a dirty chain.
 */
async function assertFreshChain(): Promise<void> {
  const count = (await publicClient.readContract({
    address: counterAddress,
    abi: counterAbi,
    functionName: "getCount",
  })) as bigint;
  if (count !== 0n) {
    throw new Error(
      `on-chain counter is ${count}, expected 0 — the Hardhat chain is not fresh ` +
        `(likely an orphaned node from a previous run on port 8545). Stop stale ` +
        `processes and retry: bun packages/build-tools/orchestrator/src/cli.ts stop`,
    );
  }
  console.log("Chain is fresh (on-chain counter = 0).");
}

async function countEntries(db: Client): Promise<number> {
  const res = await db.query("SELECT count(*)::int AS c FROM counter_results");
  return res.rows[0]?.c ?? 0;
}

/**
 * Drop + recreate the target Postgres DB so each run starts clean (no leftover
 * counter_results / engine schema). PGLite is already fresh per run, so this is
 * a no-op there. Skipped for reserved DBs (postgres/template*) since you can't
 * drop the maintenance DB you're connected through — pass a dedicated DB_NAME.
 */
async function resetTargetDatabase(): Promise<void> {
  if (USE_PGLITE || !DB_RESET) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(DB_NAME)) {
    throw new Error(`Refusing to reset DB with unsafe name "${DB_NAME}" (allowed: letters, digits, underscore; must not start with a digit).`);
  }
  if (RESERVED_DBS.has(DB_NAME)) {
    console.warn(`  DB_NAME="${DB_NAME}" is a reserved/maintenance database — skipping auto reset. Use a dedicated DB_NAME (e.g. DB_NAME=perf) for a clean DB each run.`);
    return;
  }
  const admin = new pg.Client({ ...DB_CONN, database: "postgres" });
  try {
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`  reset database "${DB_NAME}" (dropped + recreated)`);
  } catch (e: any) {
    throw new Error(`failed to reset database "${DB_NAME}": ${e?.message || e}. Ensure DB_USER can CREATE/DROP DATABASE, or set PERF_DB_RESET=0 and manage the DB yourself.`);
  } finally {
    await admin.end();
  }
}

const TX_MAX_ATTEMPTS = parseInt(process.env["PERF_TX_MAX_ATTEMPTS"] || "8", 10);

/**
 * Submit one bulkIncrement tx at a fixed nonce. Hardhat auto-mines, so a burst
 * of concurrent nonced txs can arrive out of order and the node rejects ones
 * whose nonce is "higher than expected" until the gap fills. We retry those
 * (the gap closes as lower nonces mine) and treat "too low / already known" as
 * a success (it already landed). Returns null on success, else the error text.
 */
async function sendBulkTx(nonce: number): Promise<string | null> {
  for (let attempt = 1; attempt <= TX_MAX_ATTEMPTS; attempt++) {
    try {
      await walletClient.writeContract({
        address: counterAddress,
        abi: counterAbi,
        functionName: "bulkIncrement",
        args: [BigInt(EVENTS_PER_TX)],
        nonce,
        gas: TX_GAS,
      });
      return null;
    } catch (e: any) {
      const msg = (e?.shortMessage || e?.message || String(e)).toLowerCase();
      if (msg.includes("too low") || msg.includes("already known") || msg.includes("already imported")) {
        return null; // it's already in the chain/pool
      }
      const transient = msg.includes("nonce") || msg.includes("higher than") || msg.includes("expected");
      if (transient && attempt < TX_MAX_ATTEMPTS) {
        await delay(40 * attempt);
        continue;
      }
      return e?.shortMessage || e?.message || String(e);
    }
  }
  return "exhausted retries";
}

/** Submit `count` txs paced at `tps` tx/s (spreads events across blocks). */
async function submitPaced(
  count: number,
  startNonce: number,
  tps: number,
): Promise<number> {
  const intervalMs = 1000 / tps;
  const t0 = Date.now();
  let submitted = 0;
  const inflight: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    const wait = t0 + i * intervalMs - Date.now();
    if (wait > 0) await delay(wait);
    inflight.push(sendBulkTx(startNonce + i).then((err) => {
      if (err === null) submitted++;
    }));
  }
  await Promise.allSettled(inflight);
  return submitted;
}

/** Fire `count` bulkIncrement txs as fast as possible; returns # submitted. */
async function fireBulkTxs(count: number, startNonce: number): Promise<number> {
  let inflight: Promise<void>[] = [];
  let submitted = 0;
  let failures = 0;
  for (let i = 0; i < count; i++) {
    const nonce = startNonce + i;
    inflight.push(
      sendBulkTx(nonce).then((err) => {
        if (err === null) submitted++;
        else if (++failures <= 5) console.error(`  tx send failed: ${err}`);
      }),
    );
    if (inflight.length >= SEND_CONCURRENCY) {
      await Promise.allSettled(inflight);
      inflight = [];
    }
  }
  await Promise.allSettled(inflight);
  if (failures > 0) console.error(`  tx send failures (after retries): ${failures}/${count}`);
  return submitted;
}

/** Poll until processed entry count reaches `target` (and backlog drains). */
async function waitForDrain(
  db: Client,
  target: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  const stallMs = parseInt(process.env["PERF_DRAIN_STALL_S"] || "120", 10) * 1000;
  const STALL_LOG_MS = 10_000; // while the count is flat, report node state this often
  let lastCount = -1;
  let lastChange = Date.now();
  let lastStallLog = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = await countEntries(db);
    const m = await getMetricsOnce();
    const main = m?.protocols.find((p) => p.name === "mainNtp");
    const evm = m?.protocols.find((p) => p.name.startsWith("parallelEvmRPC"));
    const buf = main?.buf ?? 0;
    if (c !== lastCount) {
      console.log(`  drained ${c.toLocaleString()}/${target.toLocaleString()} | mainNtp buf ${buf}`);
      lastCount = c;
      lastChange = Date.now();
      lastStallLog = Date.now();
    } else if (Date.now() - lastStallLog >= STALL_LOG_MS) {
      // No new entries since the last line. Show the *apply* lag (now − applied
      // block timestamp) — the real signal. A growing apply lag with the fetch
      // tip still climbing means the node is alive but apply-bound, not hung.
      const stalledFor = Math.round((Date.now() - lastChange) / 1000);
      const applied = m?.applied;
      console.log(
        `  ...waiting at ${lastCount.toLocaleString()}/${target.toLocaleString()} ` +
          `(${stalledFor}s without new entries) | apply lag ${applied?.lagSeconds ?? "?"}s ` +
          `(applied block ${applied?.blockNumber ?? "?"} of tip ${main?.ownBlockNumber ?? "?"}) | ` +
          `mainNtp buf ${buf} | evm block ${evm?.ownBlockNumber ?? "?"}`,
      );
      lastStallLog = Date.now();
    }
    // Done once every expected entry is applied. We deliberately don't also
    // wait for buf===0: under interval mining the chain keeps producing blocks,
    // so the NTP main's live tip always carries a 1-2 page buffer that never
    // settles to exactly 0 (target already accounts for all emitted entries).
    if (c >= target) return;
    if (Date.now() - lastChange > stallMs) {
      throw new Error(`drain stalled at ${lastCount}/${target} (no progress for ${stallMs / 1000}s, buf ${buf})`);
    }
    await delay(1000);
  }
  throw new Error(`drain timeout: only ${lastCount}/${target} after ${timeoutMs / 1000}s`);
}

async function runPhaseA(db: Client): Promise<PhaseResult> {
  const txs = Math.ceil(TOTAL / EVENTS_PER_TX);
  console.log(`\n=== Phase A — catch-up burst: ${txs} txs × ${EVENTS_PER_TX} events = ${(txs * EVENTS_PER_TX).toLocaleString()} entries ===`);

  const sampler = new Sampler(BLOCK_TIME_MS, SAMPLE_INTERVAL_MS, () => countEntries(db));
  const startCount = await countEntries(db);
  const startNonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });

  sampler.start();
  const t0 = Date.now();
  let submitted: number;
  if (PHASE_A_TPS > 0) {
    console.log(`  submitting ${txs} txs paced at ${PHASE_A_TPS} tx/s (spread across blocks)...`);
    submitted = await submitPaced(txs, startNonce, PHASE_A_TPS);
  } else {
    console.log("  firing txs (instant burst)...");
    submitted = await fireBulkTxs(txs, startNonce);
  }
  const expectedNew = submitted * EVENTS_PER_TX;
  console.log(`  ${submitted}/${txs} txs submitted; waiting for node to drain ${expectedNew.toLocaleString()} entries...`);
  await waitForDrain(db, startCount + expectedNew, Math.max(120_000, expectedNew * 50));
  const durationMs = Date.now() - t0;
  sampler.stop();

  const entriesProcessed = (await countEntries(db)) - startCount;
  const s = sampler.summary();
  const first = sampler.samples[0];
  const last = sampler.samples[sampler.samples.length - 1];
  const blocksPerSec = first && last && last.evmOwnBlock != null && first.evmOwnBlock != null
    ? ((last.evmOwnBlock - first.evmOwnBlock) / (durationMs / 1000))
    : undefined;

  return {
    name: "A (catch-up burst)",
    durationMs,
    entriesProcessed,
    entriesPerSec: entriesProcessed / (durationMs / 1000),
    blocksPerSec,
    sampler: s,
    samples: sampler.samples,
  };
}

async function runPhaseB(db: Client): Promise<PhaseResult> {
  const txs = PHASE_B_TPS * PHASE_B_DURATION_S;
  console.log(`\n=== Phase B — steady-state: ${PHASE_B_TPS} tx/s for ${PHASE_B_DURATION_S}s (${(txs * EVENTS_PER_TX).toLocaleString()} entries) ===`);

  const sampler = new Sampler(BLOCK_TIME_MS, SAMPLE_INTERVAL_MS, () => countEntries(db));
  const startCount = await countEntries(db);
  const startNonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });

  sampler.start();
  const t0 = Date.now();
  const submitted = await submitPaced(txs, startNonce, PHASE_B_TPS);
  const expectedNew = submitted * EVENTS_PER_TX;
  console.log(`  steady-state submission done (${submitted}/${txs} txs); waiting for drain...`);
  await waitForDrain(db, startCount + expectedNew, Math.max(120_000, expectedNew * 50));
  const durationMs = Date.now() - t0;
  sampler.stop();

  const entriesProcessed = (await countEntries(db)) - startCount;
  return {
    name: "B (steady-state)",
    durationMs,
    entriesProcessed,
    entriesPerSec: entriesProcessed / (durationMs / 1000),
    sampler: sampler.summary(),
    samples: sampler.samples,
  };
}

/** Open `file` with the OS default handler (browser for .html). Best-effort. */
function openInBrowser(file: string): void {
  const cmd = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
    ? "explorer"
    : "xdg-open";
  try {
    // Detached + unref so the viewer outlives this process's imminent exit().
    spawn(cmd, [file], { stdio: "ignore", detached: true }).unref();
  } catch { /* best-effort — the path is printed above regardless */ }
}

function emitReport(phases: PhaseResult[]): void {
  try {
    const { htmlPath, jsonPath } = writeReport(TOTAL, phases);
    console.log(`\nHTML report: ${htmlPath}`);
    console.log(`JSON report: ${jsonPath}`);
    if (OPEN_REPORT) openInBrowser(htmlPath);
  } catch (e) {
    console.error("failed to write report:", e);
  }
}

async function main() {
  let db: Client | null = null;
  const phases: PhaseResult[] = [];
  try {
    console.log(`Perf config: TOTAL=${TOTAL} EVENTS_PER_TX=${EVENTS_PER_TX} blockTimeMS=${BLOCK_TIME_MS} phaseB=${RUN_PHASE_B}`);
    await resetTargetDatabase();
    await startInfrastructure(LAUNCHER_PATH);
    await waitForOrchestrator();
    await waitForProcess("generate-evm-mod", { waitForExit: true });
    console.log("Contracts deployed.");
    counterAddress = contractAddressesEvmMain().chain31337["CounterModule#Counter"];
    await assertFreshChain(); // fail fast before the node ingests a stale chain
    await waitForProcess("sync");
    await waitForHealth();
    await waitForBlock(1);
    console.log("Node healthy.\n");

    db = getDBConnection();

    await enableIntervalMining(MINE_INTERVAL_MS);
    phases.push(await runPhaseA(db));
    if (RUN_PHASE_B) phases.push(await runPhaseB(db));

    printReport(TOTAL, phases);
    emitReport(phases);
  } catch (e) {
    console.error("\nPERF RUN FAILED:", e);
    if (phases.length) {
      printReport(TOTAL, phases);
      emitReport(phases);
    }
    process.exitCode = 1;
  } finally {
    await restoreAutomine();
    if (db) await db.end();
    await stopInfrastructure();
    process.exit(process.exitCode ?? 0);
  }
}

void main();

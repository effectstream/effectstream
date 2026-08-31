// Adversarial test suite for the midnight-balancer batcher (T1–T13).
//
// Run from the template root, host-side, with the Docker stack up:
//   bun run test:adversarial -- --phase 1              # run everything
//   bun run test:adversarial -- --phase 1 --only T3,T5 # subset
//
// Phase 1 records whether each known defect REPRODUCES against the current
// batcher; phase 3 asserts the fixed behavior. Results are appended to
// TESTING-RESULTS.md and printed as a table.
//
// Ground truth is on-chain (counter delta / sink balance / block scan) —
// never the batcher's own accounting.

import "@midnight-ntwrk/onchain-runtime-v3";

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

import { BATCHER_URL, NETWORK, SEEDS } from "@midnight-batcher/scripts/env";
import {
  getHealth,
  getPendingCount,
  getQueueStats,
  getStatus,
  sendTx,
  waitForBatcher,
} from "@midnight-batcher/scripts/batcher-client";
import {
  buildWallet,
  getDustCoins,
  type WalletCtx,
} from "@midnight-batcher/scripts/wallet";

const TEMPLATE_ROOT = path.join(import.meta.dirname!, "../..");
const RESULTS_FILE = path.join(TEMPLATE_ROOT, "TESTING-RESULTS.md");

const args = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const PHASE = Number(flag("phase", "1"));
const ONLY = flag("only", "").split(",").filter(Boolean);
const SLOTS = Number(flag("slots", process.env.BATCHER_MAX_SLOTS_PER_WALLET ?? "10"));

// ---------------------------------------------------------------------------
// Infra helpers
// ---------------------------------------------------------------------------

async function sh(cmd: string[], opts?: { cwd?: string }): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd ?? TEMPLATE_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, out: out + err };
}

const compose = (...c: string[]) => sh(["docker", "compose", ...c]);

async function appLogsSince(sinceIso: string): Promise<string> {
  const { out } = await compose("logs", "app", "--since", sinceIso, "--no-log-prefix");
  return out;
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g")) ?? []).length;
}

/** Run a workload script; returns the trailing JSON summary line. */
async function runWorkload(
  kind: "zswap" | "calls",
  opts: { count: number; concurrency?: number; verify?: boolean; verifyTimeout?: number },
): Promise<{ accepted: number; rejected: number; buildFailed: number; delivered: number | null; wallMs: number; code: number; out: string }> {
  const cmd = [
    "bun", "run", `workload:${kind}`, "--",
    "--count", String(opts.count),
    "--concurrency", String(opts.concurrency ?? 4),
  ];
  if (opts.verify) cmd.push("--verify");
  if (opts.verifyTimeout) cmd.push("--verify-timeout", String(opts.verifyTimeout));
  const { code, out } = await sh(cmd);
  const jsonLine = out.split("\n").reverse().find((l) => l.trim().startsWith('{"kind"'));
  const parsed = jsonLine ? JSON.parse(jsonLine) : { accepted: 0, rejected: 0, buildFailed: 0, delivered: null, wallMs: 0 };
  return { ...parsed, code, out };
}

async function readCounter(): Promise<bigint> {
  const { indexerPublicDataProvider } = await import("@midnight-ntwrk/midnight-js-indexer-public-data-provider");
  const { Counter } = await import("@midnight-batcher/midnight-contract");
  const addressFile = path.join(TEMPLATE_ROOT, `packages/contracts-midnight/contract-counter.${NETWORK.id}.json`);
  const { contractAddress } = JSON.parse(readFileSync(addressFile, "utf8"));
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const pdp = indexerPublicDataProvider(NETWORK.indexer, NETWORK.indexerWS);
      const state = await pdp.queryContractState(contractAddress);
      if (!state) throw new Error("no contract state");
      return BigInt(Counter.ledger(state.data).round);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Read the batcher wallet's dust coins from the OUTSIDE (same seed, read-only). */
let observerWallet: WalletCtx | null = null;
async function observeBatcherDust(): Promise<{ count: number; spendable: number; values: string[] }> {
  if (!observerWallet) {
    observerWallet = await buildWallet(NETWORK, SEEDS.batcher);
  }
  const info = await getDustCoins(observerWallet, 300_000_000_000_000n);
  return { count: info.count, spendable: info.spendable, values: info.values.map(String) };
}

async function nodeRpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(NETWORK.node, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      const j = await r.json() as { result: T };
      return j.result;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function currentBlockNumber(): Promise<number> {
  const header = await nodeRpc<{ number: string }>("chain_getHeader", []);
  return parseInt(header.number, 16);
}

/** Count user extrinsics (total minus 3 inherents) in blocks (from, to]. */
async function countUserExtrinsics(fromBlock: number, toBlock: number): Promise<number> {
  let total = 0;
  for (let n = fromBlock + 1; n <= toBlock; n++) {
    const hash = await nodeRpc<string>("chain_getBlockHash", [n]);
    const block = await nodeRpc<{ block: { extrinsics: string[] } }>("chain_getBlock", [hash]);
    total += Math.max(0, (block?.block?.extrinsics?.length ?? 0) - 3);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Memory benchmarking — docker stats sampled for the whole run
// ---------------------------------------------------------------------------

const memStats = {
  peakMiB: {} as Record<string, number>,
  finalMiB: {} as Record<string, number>,
  samples: 0,
};
let memSamplerRunning = false;
let memSamplerStop = false;

function parseMiB(usage: string): number {
  // "187.9MiB / 62.66GiB" → 187.9 ; "1.2GiB / …" → 1228.8
  const m = usage.match(/([\d.]+)\s*([KMG])iB/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return m[2] === "G" ? v * 1024 : m[2] === "K" ? v / 1024 : v;
}

async function sampleMemoryOnce(): Promise<void> {
  const { code, out } = await sh(["docker", "stats", "--no-stream", "--format", "{{json .}}"]);
  if (code !== 0) return;
  for (const line of out.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const s = JSON.parse(line) as { Name: string; MemUsage: string };
      if (!s.Name?.startsWith("midnight-batcher-")) continue;
      const name = s.Name.replace("midnight-batcher-", "").replace(/-1$/, "");
      const mib = parseMiB(s.MemUsage);
      memStats.finalMiB[name] = mib;
      memStats.peakMiB[name] = Math.max(memStats.peakMiB[name] ?? 0, mib);
    } catch {
      /* skip malformed line */
    }
  }
  memStats.samples += 1;
}

function startMemSampler(intervalMs = 5_000): void {
  if (memSamplerRunning) return;
  memSamplerRunning = true;
  memSamplerStop = false;
  void (async () => {
    while (!memSamplerStop) {
      await sampleMemoryOnce().catch(() => {});
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  })();
}

function memReportLines(): string[] {
  const services = Object.keys(memStats.peakMiB).sort();
  if (services.length === 0) return ["(no memory samples collected)"];
  return [
    ``,
    `**Memory (docker stats, ${memStats.samples} samples):**`,
    ``,
    `| service | peak MiB | final MiB |`,
    `|---|---|---|`,
    ...services.map((s) =>
      `| ${s} | ${memStats.peakMiB[s].toFixed(1)} | ${(memStats.finalMiB[s] ?? 0).toFixed(1)} |`
    ),
  ];
}

async function waitForQueueDrained(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pending = await getPendingCount().catch(() => -1);
    if (pending === 0) return true;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Test registry
// ---------------------------------------------------------------------------

interface TestResult {
  id: string;
  name: string;
  outcome: "pass" | "fail" | "reproduced" | "not-reproduced" | "observed" | "error";
  notes: string;
}

type TestFn = () => Promise<TestResult>;

const ERROR_SIGNATURES = {
  balanceDust: /Insufficient Funds: could not balance dust/,
  dustWait: /dust still unavailable after \d+ms/,
  dropping: /Dropping input after \d+ failed retries/,
};

const tests: Record<string, { name: string; fn: TestFn }> = {};

function register(id: string, name: string, fn: TestFn) {
  tests[id] = { name, fn };
}

// ── T1 / T2: baselines ─────────────────────────────────────────────────────

register("T1", "Baseline zswap balancing", async () => {
  const r = await runWorkload("zswap", { count: 1, verify: true, verifyTimeout: 300_000 });
  const ok = r.accepted === 1 && r.delivered === 1;
  return {
    id: "T1",
    name: tests.T1.name,
    outcome: ok ? "pass" : "fail",
    notes: `accepted=${r.accepted} delivered=${r.delivered}`,
  };
});

register("T2", "Baseline contract call balancing", async () => {
  const r = await runWorkload("calls", { count: 1, verify: true, verifyTimeout: 300_000 });
  const ok = r.accepted === 1 && r.delivered === 1;
  return {
    id: "T2",
    name: tests.T2.name,
    outcome: ok ? "pass" : "fail",
    notes: `accepted=${r.accepted} delivered=${r.delivered}`,
  };
});

// ── T3: burst > slots (dust drain) + T4: value-trap log analysis ───────────

let t3Logs = "";

register("T3", "Burst > slots drains dust (doomed balance attempts)", async () => {
  const since = new Date().toISOString();
  const count = SLOTS * 3;
  const before = await readCounter();
  const r = await runWorkload("calls", { count, concurrency: 8, verify: true, verifyTimeout: 900_000 });
  await new Promise((res) => setTimeout(res, 10_000));
  t3Logs = await appLogsSince(since);
  const dustErrors = countMatches(t3Logs, ERROR_SIGNATURES.balanceDust);
  const dustWaits = countMatches(t3Logs, ERROR_SIGNATURES.dustWait);
  const drops = countMatches(t3Logs, ERROR_SIGNATURES.dropping);
  const after = await readCounter();
  const delivered = Number(after - before);
  const notes =
    `submitted=${count} accepted=${r.accepted} delivered=${delivered} ` +
    `balanceDustErrors=${dustErrors} 60sWaits=${dustWaits} drops=${drops}`;
  if (PHASE === 1) {
    return {
      id: "T3", name: tests.T3.name,
      outcome: dustErrors > 0 || dustWaits > 0 ? "reproduced" : "not-reproduced",
      notes,
    };
  }
  const ok = delivered === r.accepted && dustErrors === 0 && drops === 0;
  return { id: "T3", name: tests.T3.name, outcome: ok ? "pass" : "fail", notes };
});

register("T4", "Count-vs-value gate trap (analysis of T3 logs)", async () => {
  const logs = t3Logs || (await appLogsSince(new Date(Date.now() - 3600_000).toISOString()));
  // The trap signature: the gate reported dust AVAILABLE (or never warned),
  // yet the balance failed — i.e. more balance-dust errors than 60s-timeout
  // warnings can account for (each wait warning precedes at most one batch of
  // failures; errors without a preceding warning mean the count-gate passed).
  const dustErrors = countMatches(logs, ERROR_SIGNATURES.balanceDust);
  const dustWaits = countMatches(logs, ERROR_SIGNATURES.dustWait);
  const gatePassedButFailed = countMatches(logs, /dust available after \d+ms/);
  const notes = `balanceDustErrors=${dustErrors} 60sWaits=${dustWaits} gatePassedLines=${gatePassedButFailed}`;
  if (PHASE === 1) {
    const reproduced = dustErrors > 0 && gatePassedButFailed > 0;
    return { id: "T4", name: tests.T4.name, outcome: reproduced ? "reproduced" : dustErrors > 0 ? "observed" : "not-reproduced", notes };
  }
  return { id: "T4", name: tests.T4.name, outcome: dustErrors === 0 ? "pass" : "fail", notes };
});

// ── T5: silent drop under sustained overload ───────────────────────────────

register("T5", "Silent input drop after 3 retries", async () => {
  const since = new Date().toISOString();
  const count = SLOTS * 4;
  const before = await readCounter();
  const r = await runWorkload("calls", { count, concurrency: 8 });
  // Let the batcher chew through retries until the queue is empty or 15 min.
  const drained = await waitForQueueDrained(900_000);
  await new Promise((res) => setTimeout(res, 15_000));
  const after = await readCounter();
  const delivered = Number(after - before);
  const logs = await appLogsSince(since);
  const drops = countMatches(logs, ERROR_SIGNATURES.dropping);
  const notes = `accepted=${r.accepted} delivered=${delivered} drops=${drops} drained=${drained}`;
  if (PHASE === 1) {
    const reproduced = drops > 0 || delivered < r.accepted;
    return { id: "T5", name: tests.T5.name, outcome: reproduced ? "reproduced" : "not-reproduced", notes };
  }
  const ok = delivered === r.accepted && drops === 0;
  return { id: "T5", name: tests.T5.name, outcome: ok ? "pass" : "fail", notes };
});

// ── T6: dust leak on mid-pipeline failure (proof servers die) ──────────────

register("T6", "Dust leak when prove/finalize fails mid-batch", async () => {
  const dustBefore = await observeBatcherDust();
  const since = new Date().toISOString();
  // Submit a burst, give the batcher time to balance (dust booked), then kill
  // proving so sign/finalize throws on the post-balance path.
  const submit = runWorkload("calls", { count: Math.min(SLOTS, 5), concurrency: 5 });
  await new Promise((r) => setTimeout(r, 20_000));
  await compose("stop", "proof-server", "proof-server-2", "proof-server-3");
  const r = await submit;
  await new Promise((res) => setTimeout(res, 60_000));
  await compose("start", "proof-server", "proof-server-2", "proof-server-3");
  // Give it 3 minutes to settle, then compare dust coin counts.
  await new Promise((res) => setTimeout(res, 180_000));
  const dustAfter = await observeBatcherDust();
  const logs = await appLogsSince(since);
  const reverts = countMatches(logs, /revert/i);
  const notes =
    `dustCoins ${dustBefore.count}→${dustAfter.count} spendable ${dustBefore.spendable}→${dustAfter.spendable} ` +
    `accepted=${r.accepted} revertMentions=${reverts}`;
  const leaked = dustAfter.count < dustBefore.count;
  if (PHASE === 1) {
    return { id: "T6", name: tests.T6.name, outcome: leaked ? "reproduced" : "observed", notes };
  }
  return { id: "T6", name: tests.T6.name, outcome: leaked ? "fail" : "pass", notes };
});

// ── T7: submit-timeout dust handling (node paused during submit) ───────────

register("T7", "Dust booked across submit timeout (node paused)", async () => {
  const dustBefore = await observeBatcherDust();
  const since = new Date().toISOString();
  const before = await readCounter();
  const submit = runWorkload("calls", { count: 3, concurrency: 3 });
  // Balancing+proving takes a while; pause the node before submission lands.
  await new Promise((r) => setTimeout(r, 15_000));
  await compose("pause", "node");
  const r = await submit;
  // Hold through the adapter's 90s submit timeout.
  await new Promise((res) => setTimeout(res, 120_000));
  await compose("unpause", "node");
  await waitForQueueDrained(600_000);
  await new Promise((res) => setTimeout(res, 30_000));
  const after = await readCounter();
  const dustAfter = await observeBatcherDust();
  const logs = await appLogsSince(since);
  const timeouts = countMatches(logs, /submitTransaction timed out/);
  const notes =
    `accepted=${r.accepted} delivered=${Number(after - before)} submitTimeouts=${timeouts} ` +
    `dustCoins ${dustBefore.count}→${dustAfter.count}`;
  return { id: "T7", name: tests.T7.name, outcome: "observed", notes };
});

// ── T8: node outage resilience ─────────────────────────────────────────────

register("T8", "Node outage mid-run: park + recover, no drops", async () => {
  const since = new Date().toISOString();
  const before = await readCounter();
  const submit = runWorkload("calls", { count: 8, concurrency: 4, verify: true, verifyTimeout: 900_000 });
  await new Promise((r) => setTimeout(r, 10_000));
  await compose("pause", "node");
  await new Promise((r) => setTimeout(r, 60_000));
  await compose("unpause", "node");
  const r = await submit;
  await waitForQueueDrained(600_000);
  await new Promise((res) => setTimeout(res, 15_000));
  const after = await readCounter();
  const delivered = Number(after - before);
  const logs = await appLogsSince(since);
  const drops = countMatches(logs, ERROR_SIGNATURES.dropping);
  const notes = `accepted=${r.accepted} delivered=${delivered} drops=${drops}`;
  if (PHASE === 1) {
    const reproduced = drops > 0 || delivered < r.accepted;
    return { id: "T8", name: tests.T8.name, outcome: reproduced ? "reproduced" : "not-reproduced", notes };
  }
  const ok = delivered === r.accepted && drops === 0;
  return { id: "T8", name: tests.T8.name, outcome: ok ? "pass" : "fail", notes };
});

// ── T9: poison input among good ones ───────────────────────────────────────

register("T9", "Poison input does not block or kill good inputs", async () => {
  const since = new Date().toISOString();
  const before = await readCounter();
  // A syntactically valid JSON input whose tx hex is garbage — passes HTTP
  // validation, fails deserialization inside buildBatchData.
  const poison = await sendTx("", {
    rawInput: JSON.stringify({ tx: "deadbeef".repeat(8), txStage: "finalized" }),
  });
  const r = await runWorkload("calls", { count: 4, concurrency: 4, verify: true, verifyTimeout: 600_000 });
  await new Promise((res) => setTimeout(res, 20_000));
  const after = await readCounter();
  const delivered = Number(after - before);
  const pendingLeft = await getPendingCount().catch(() => -1);
  const logs = await appLogsSince(since);
  const deserializeErrors = countMatches(logs, /Deserialize failed/);
  const notes =
    `poisonAccepted=${poison.ok} goodAccepted=${r.accepted} goodDelivered=${delivered} ` +
    `deserializeErrors=${deserializeErrors} pendingLeft=${pendingLeft}`;
  if (PHASE === 1) {
    // Known defect: deserialize-failed inputs are skipped but never removed —
    // they sit in the queue forever (pendingLeft > 0 after the good ones land).
    const reproduced = poison.ok && pendingLeft > 0;
    return { id: "T9", name: tests.T9.name, outcome: delivered === r.accepted ? (reproduced ? "reproduced" : "observed") : "reproduced", notes };
  }
  const ok = delivered === r.accepted && pendingLeft === 0;
  return { id: "T9", name: tests.T9.name, outcome: ok ? "pass" : "fail", notes };
});

// ── T10: duplicate submission ──────────────────────────────────────────────

register("T10", "Duplicate tx submission handled deterministically", async () => {
  const since = new Date().toISOString();
  // Build ONE feeless zswap tx and submit the identical hex twice.
  const { buildFeelessShieldedTransfer, buildWallet: bw, getShieldedBalance, toHex, waitSynced } =
    await import("@midnight-batcher/scripts/wallet");
  const maker = await bw(NETWORK, SEEDS.zswapMaker);
  const sink = await bw(NETWORK, SEEDS.zswapSink);
  await waitSynced(maker, { label: "t10-maker" });
  await waitSynced(sink, { label: "t10-sink" });
  const sinkBefore = await getShieldedBalance(sink);
  const sinkAddr = await sink.wallet.shielded.getAddress();
  const finalized = await buildFeelessShieldedTransfer(maker, sinkAddr, 1n);
  const hex = toHex(finalized.serialize());
  const r1 = await sendTx(hex, { txStage: "finalized", address: "t10-dup" });
  const r2 = await sendTx(hex, { txStage: "finalized", address: "t10-dup" });
  await waitForQueueDrained(300_000);
  await new Promise((res) => setTimeout(res, 30_000));
  const sinkAfter = await getShieldedBalance(sink);
  const deliveredUnits = Number(sinkAfter - sinkBefore);
  const logs = await appLogsSince(since);
  const intentExists = countMatches(logs, /IntentAlreadyExists/);
  const notes = `accepted1=${r1.ok} accepted2=${r2.ok} deliveredUnits=${deliveredUnits} intentAlreadyExists=${intentExists}`;
  await Promise.allSettled([maker.wallet.stop(), sink.wallet.stop()]);
  const ok = deliveredUnits === 1;
  return {
    id: "T10", name: tests.T10.name,
    outcome: PHASE === 1 ? "observed" : ok ? "pass" : "fail",
    notes,
  };
});

// ── T11: restart durability ────────────────────────────────────────────────

register("T11", "Batcher restart with non-empty queue", async () => {
  const before = await readCounter();
  const r = await runWorkload("calls", { count: 6, concurrency: 6 });
  await new Promise((res) => setTimeout(res, 5_000));
  await compose("restart", "app");
  await waitForBatcher(300_000);
  await waitForQueueDrained(900_000);
  await new Promise((res) => setTimeout(res, 20_000));
  const after = await readCounter();
  const delivered = Number(after - before);
  const notes = `accepted=${r.accepted} deliveredAfterRestart=${delivered}`;
  const ok = delivered >= r.accepted;
  return {
    id: "T11", name: tests.T11.name,
    outcome: PHASE === 1 ? (ok ? "observed" : "reproduced") : ok ? "pass" : "fail",
    notes: notes + (delivered > r.accepted ? " (DOUBLE-SUBMIT!)" : ""),
  };
});

// ── T12: garbage input rejected at the door ────────────────────────────────

register("T12", "Garbage input rejected without poisoning the queue", async () => {
  const cases: Array<{ label: string; raw: string }> = [
    { label: "not-json-not-hex", raw: "hello world this is not a tx" },
    { label: "empty", raw: "" },
    { label: "bad-stage", raw: JSON.stringify({ tx: "aabb", txStage: "bogus" }) },
    { label: "huge", raw: JSON.stringify({ tx: "ab".repeat(500_000) }) },
  ];
  const outcomes: string[] = [];
  for (const c of cases) {
    const r = await sendTx("", { rawInput: c.raw, timeoutMs: 30_000 }).catch((e) => ({
      ok: false, status: 0, body: String(e),
    }));
    outcomes.push(`${c.label}:${r.ok ? "ACCEPTED" : `rejected(${r.status})`}`);
  }
  const healthy = await getHealth();
  const anyAccepted = outcomes.some((o) => o.includes("ACCEPTED"));
  const notes = `${outcomes.join(" ")} healthyAfter=${healthy}`;
  if (PHASE === 1) {
    return { id: "T12", name: tests.T12.name, outcome: anyAccepted ? "reproduced" : "not-reproduced", notes };
  }
  return { id: "T12", name: tests.T12.name, outcome: !anyAccepted && healthy ? "pass" : "fail", notes };
});

// ── T13: TPS soak ──────────────────────────────────────────────────────────

register("T13", "TPS soak (mixed zswap + calls)", async () => {
  const since = new Date().toISOString();
  const startBlock = await currentBlockNumber();
  const before = await readCounter();
  const t0 = performance.now();
  const [calls, zswaps] = await Promise.all([
    runWorkload("calls", { count: Number(flag("soak-calls", "40")), concurrency: 8, verify: true, verifyTimeout: 1_800_000 }),
    runWorkload("zswap", { count: Number(flag("soak-zswaps", "15")), concurrency: 4, verify: true, verifyTimeout: 1_800_000 }),
  ]);
  const wallS = (performance.now() - t0) / 1000;
  const after = await readCounter();
  const endBlock = await currentBlockNumber();
  const chainTxs = await countUserExtrinsics(startBlock, endBlock).catch(() => -1);
  const logs = await appLogsSince(since);
  const dustErrors = countMatches(logs, ERROR_SIGNATURES.balanceDust);
  const drops = countMatches(logs, ERROR_SIGNATURES.dropping);
  const deliveredCalls = Number(after - before);
  const total = deliveredCalls + (zswaps.delivered ?? 0);
  const tps = total / wallS;
  const notes =
    `calls=${deliveredCalls}/${calls.accepted} zswaps=${zswaps.delivered}/${zswaps.accepted} ` +
    `wall=${wallS.toFixed(1)}s end2endTPS=${tps.toFixed(2)} chainUserTxs=${chainTxs} ` +
    `blocks=${startBlock}→${endBlock} dustErrors=${dustErrors} drops=${drops}`;
  if (PHASE === 1) {
    return { id: "T13", name: tests.T13.name, outcome: "observed", notes };
  }
  const ok = dustErrors === 0 && drops === 0 &&
    deliveredCalls === calls.accepted && zswaps.delivered === zswaps.accepted;
  return { id: "T13", name: tests.T13.name, outcome: ok ? "pass" : "fail", notes };
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  setNetworkId(NETWORK.id as never);
  console.log(`[suite] phase=${PHASE} batcher=${BATCHER_URL} slots=${SLOTS}`);
  await waitForBatcher(300_000);
  console.log(`[suite] batcher healthy; status=${JSON.stringify(await getStatus().catch(() => "n/a")).slice(0, 200)}`);

  const ids = ONLY.length > 0 ? ONLY : Object.keys(tests);
  const results: TestResult[] = [];
  startMemSampler();

  for (const id of ids) {
    const test = tests[id];
    if (!test) {
      console.error(`[suite] unknown test ${id}`);
      continue;
    }
    console.log(`\n[suite] ════ ${id}: ${test.name} ════`);
    const t0 = performance.now();
    try {
      const result = await test.fn();
      results.push(result);
      console.log(`[suite] ${id} → ${result.outcome} (${Math.round((performance.now() - t0) / 1000)}s) — ${result.notes}`);
    } catch (e) {
      const notes = e instanceof Error ? e.message : String(e);
      results.push({ id, name: test.name, outcome: "error", notes });
      console.error(`[suite] ${id} → ERROR: ${notes}`);
    }
    // Settle between tests.
    await waitForQueueDrained(120_000).catch(() => {});
  }

  // Report
  memSamplerStop = true;
  await sampleMemoryOnce().catch(() => {});
  const stamp = new Date().toISOString();
  const lines = [
    ``,
    `## Run ${stamp} (phase ${PHASE})`,
    ``,
    `| # | Test | Outcome | Notes |`,
    `|---|------|---------|-------|`,
    ...results.map((r) => `| ${r.id} | ${r.name} | **${r.outcome}** | ${r.notes.replaceAll("|", "\\|")} |`),
    ...memReportLines(),
  ];
  appendFileSync(RESULTS_FILE, lines.join("\n") + "\n");
  console.log("\n" + lines.join("\n"));
  console.log(`\n[suite] results appended to ${RESULTS_FILE}`);

  if (observerWallet) await observerWallet.wallet.stop().catch(() => {});
  const failed = results.filter((r) => r.outcome === "fail" || r.outcome === "error");
  process.exit(PHASE === 3 && failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[suite] fatal:", e);
  process.exit(1);
});

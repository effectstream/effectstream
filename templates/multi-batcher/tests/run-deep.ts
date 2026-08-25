// DEEP suite for the shared multi-product batcher (manual / nightly).
//
// This is where we try to BREAK the shared batcher: exhaustive policy rules,
// timeouts and cooldowns, tampered storage, restarts, cross-product
// interference, floods. The fast "nothing broke" guard lives in
// e2e/multi-batcher and is deliberately kept lean.
//
//   docker compose up -d           # stack on the 18400-block sibling ports
//   bun run test:deep              # everything
//   bun run test:deep -- --only M3,M7
//
// Ground truth is always on-chain (counter delta, sink balance) or the
// batcher's own queue accounting — never a workload's self-report.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";

import { ACTOR_SEEDS, BATCHER_URL, NETWORK } from "../shared/env.ts";
import {
  clearInputs,
  getPendingCountFor,
  getStats,
  getTargetStats,
  retireProductCOffers,
  sendTx,
  waitForBatcher,
  waitForDrained,
} from "../shared/batcher-client.ts";
import {
  buildWallet,
  getShieldedBalance,
  ignoreCleanWebSocketClose,
  waitSynced,
} from "../shared/wallet.ts";
import { buildProducts } from "../shared-batcher/registry.ts";

const TEMPLATE_ROOT = path.join(import.meta.dirname!, "..");
const RESULTS_FILE = path.join(TEMPLATE_ROOT, "TESTING-RESULTS.md");
const STORAGE_FILE = path.join(TEMPLATE_ROOT, "batcher-data/pending-inputs.jsonl");

const args = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const ONLY = flag("only", "").split(",").filter(Boolean);

// ---------------------------------------------------------------------------
// Infra helpers
// ---------------------------------------------------------------------------

async function sh(cmd: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, { cwd: TEMPLATE_ROOT, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out: out + err };
}

const compose = (...c: string[]) => sh(["docker", "compose", ...c]);

async function appLogsSince(sinceIso: string): Promise<string> {
  return (await compose("logs", "app", "--since", sinceIso, "--no-log-prefix")).out;
}

/**
 * Pause or unpause a compose service, ASSERTING the transition took effect.
 *
 * `docker compose pause`/`unpause` can report success while the container's
 * freezer cgroup and the daemon's own metadata disagree — after which docker
 * refuses both `pause` ("container not running") and `unpause` ("is not
 * paused") while the process stays frozen at the cgroup level. The node's
 * 2-second healthcheck `docker exec` makes that race easy to hit, because an
 * exec is almost always in flight when the pause lands.
 *
 * A scenario that only REQUESTS the transition then spends its entire drain
 * budget waiting on a chain that will never produce another block, and reports
 * the timeout as a batcher failure. Measured here: the whole suite sat on a
 * frozen node for 36 minutes and M8 never noticed. So the state is verified
 * against the daemon, and a divergence is raised immediately, by name.
 *
 * Recovery, if it happens: `docker restart <node container>`. The chain lives
 * in the container's writable layer, so a restart keeps it — only a recreate
 * (a compose CONFIG change plus `up -d`) wipes it.
 */
async function setServicePaused(service: string, paused: boolean): Promise<void> {
  const verb = paused ? "pause" : "unpause";
  const { code, out } = await compose(verb, service);
  if (code !== 0) {
    throw new Error(
      `docker compose ${verb} ${service} failed (exit ${code}): ${out.trim().slice(-300)}`,
    );
  }
  const id = (await compose("ps", "-q", service)).out.trim();
  if (!id) throw new Error(`could not resolve a container id for service ${service}`);
  const inspected = await sh(["docker", "inspect", id, "--format", "{{.State.Paused}}"]);
  const actual = inspected.out.trim() === "true";
  if (actual !== paused) {
    throw new Error(
      `${service} should be ${verb}d, but docker reports Paused=${actual}. ` +
        `The daemon's pause state has diverged from the container's freezer ` +
        `cgroup; recover with \`docker restart\` on that container.`,
    );
  }
}

/**
 * The node is only genuinely back when it answers RPC — the container's
 * metadata is not evidence, as the divergence above proves.
 */
async function waitForNodeRpc(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(NETWORK.node, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "chain_getBlockHash",
          params: [1],
        }),
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) {
        const body = await response.json() as { result?: string };
        if (typeof body.result === "string") return true;
      }
    } catch { /* still frozen or still starting */ }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return false;
}

function countMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  return (text.match(new RegExp(pattern.source, flags)) ?? []).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Must stay identical to the adapter's trace hash. */
function inputContentHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(31, h) + input.charCodeAt(i) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function corruptByteAt(hex: string, fraction: number): string {
  const bytes = Buffer.from(hex, "hex");
  const offset = Math.max(0, Math.min(bytes.length - 1, Math.floor(bytes.length * fraction)));
  bytes[offset] = bytes[offset]! ^ 0x01;
  return bytes.toString("hex");
}

/** Run a product workload; returns its trailing JSON summary. */
async function workload(
  product: "a" | "b" | "c",
  extra: string[] = [],
): Promise<Record<string, number | string | null>> {
  const { out } = await sh(["bun", "run", `workload:${product}`, "--", ...extra]);
  const line = out.split("\n").reverse().find((l) => l.trim().startsWith('{"kind"'));
  if (!line) throw new Error(`workload ${product} produced no summary:\n${out.slice(-800)}`);
  return JSON.parse(line);
}

async function readCounter(): Promise<bigint> {
  const { Counter } = await import("../product-a/contract-counter/src/index.ts");
  const addressFile = path.join(
    TEMPLATE_ROOT,
    `product-a/contract-counter.${NETWORK.id}.json`,
  );
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

async function sinkBalance(seed: string): Promise<bigint> {
  const w = await buildWallet(NETWORK, seed);
  try {
    await waitSynced(w, { label: "sink-probe" });
    return await getShieldedBalance(w);
  } finally {
    await w.wallet.stop().catch(() => {});
  }
}

// Memory sampling (same shape as the midnight-batcher suite).
const memStats = { peakMiB: {} as Record<string, number>, finalMiB: {} as Record<string, number>, samples: 0 };
const validationChildRss = { peakMiB: {} as Record<string, number>, samples: 0 };
let appContainerId = "";
let memStop = false;
function parseMiB(usage: string): number {
  const m = usage.match(/([\d.]+)\s*([KMG])iB/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return m[2] === "G" ? v * 1024 : m[2] === "K" ? v / 1024 : v;
}
async function sampleMemory(): Promise<void> {
  const { code, out } = await sh(["docker", "stats", "--no-stream", "--format", "{{json .}}"]);
  if (code !== 0) return;
  for (const line of out.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const s = JSON.parse(line) as { Name: string; MemUsage: string };
      const match = s.Name?.match(/-(app|indexer|node|proof-lb|proof-server(?:-2|-3)?)-\d+$/);
      if (!match) continue;
      const name = match[1]!;
      const mib = parseMiB(s.MemUsage);
      memStats.finalMiB[name] = mib;
      memStats.peakMiB[name] = Math.max(memStats.peakMiB[name] ?? 0, mib);
    } catch { /* skip */ }
  }
  memStats.samples += 1;

  // Container totals hide the D6 residual: every validation child has its own
  // ledger WASM heap. Sample the actual validation-worker processes via the
  // host's `docker top` view and report RSS per PID.
  if (!appContainerId) {
    appContainerId = (await compose("ps", "-q", "app")).out.trim();
  }
  if (appContainerId) {
    const top = await sh(["docker", "top", appContainerId, "-eo", "pid,ppid,rss,args"]);
    if (top.code === 0) {
      for (const line of top.out.split("\n")) {
        const row = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
        if (!row || !row[4]!.includes("validation-worker.ts")) continue;
        const pid = row[1]!;
        const mib = Number(row[3]) / 1024;
        validationChildRss.peakMiB[pid] = Math.max(
          validationChildRss.peakMiB[pid] ?? 0,
          mib,
        );
      }
      validationChildRss.samples += 1;
    }
  }
}
function startMemSampler(): void {
  void (async () => {
    while (!memStop) {
      await sampleMemory().catch(() => {});
      await new Promise((r) => setTimeout(r, 5_000));
    }
  })();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

interface TestResult {
  id: string;
  name: string;
  outcome: "pass" | "fail" | "observed" | "error";
  notes: string;
}
type TestFn = () => Promise<TestResult>;
const tests: Record<string, { name: string; fn: TestFn }> = {};
const register = (id: string, name: string, fn: TestFn) => {
  tests[id] = { name, fn };
};

const ok = (id: string, pass: boolean, notes: string): TestResult => ({
  id,
  name: tests[id].name,
  outcome: pass ? "pass" : "fail",
  notes,
});

// ── M1: policy matrix — every product accepts its own shape, rejects others ──

register("M1", "Policy matrix: each product accepts only its own shape", async () => {
  const { buildIncrementHex } = await import("../product-a/workload.ts");
  const { buildTransferHex } = await import("../product-b/workload.ts");
  const { buildMatchedSwapHex } = await import("../product-c/workload.ts");

  const callHex = await buildIncrementHex();
  const transferHex = await buildTransferHex(1n);
  const swapHex = await buildMatchedSwapHex(1n);

  const cases: Array<[string, string, string, "unbound" | "finalized" | "unproven", boolean]> = [
    // [label, target, hex, stage, expectAccept]
    ["call→a", "product-a", callHex, "unbound", true],
    ["transfer→a", "product-a", transferHex, "finalized", false],
    ["swap→a", "product-a", swapHex, "unproven", false],
    ["transfer→b", "product-b", transferHex, "finalized", true],
    ["call→b", "product-b", callHex, "unbound", false],
    ["swap→c", "product-c", swapHex, "unproven", true],
    ["transfer→c", "product-c", transferHex, "finalized", false], // custom filter
    ["call→c", "product-c", callHex, "unbound", false],
  ];

  const wrong: string[] = [];
  for (const [label, target, hex, stage, expectAccept] of cases) {
    const r = await sendTx(hex, { target, txStage: stage });
    if (r.ok !== expectAccept) {
      wrong.push(`${label}: got ${r.ok ? "ACCEPT" : `reject(${r.status})`}, want ${expectAccept ? "ACCEPT" : "reject"}`);
    }
  }
  await retireProductCOffers();
  await waitForDrained(undefined, 300_000);
  return ok("M1", wrong.length === 0, wrong.length ? wrong.join("; ") : `${cases.length}/${cases.length} cases correct`);
});

// ── M2: cross-product dust isolation ────────────────────────────────────────

register("M2", "One product's dust exhaustion does not stall the others", async () => {
  const since = new Date().toISOString();
  const beforeCounter = await readCounter();
  const beforeSinkB = await sinkBalance(ACTOR_SEEDS.bSink);

  // Flood product-a hard while b and c do normal work.
  //
  // product-c's payload is a matched-delta swap OFFER — half a trade, so it can
  // never settle and its rows must be retired rather than waited on. Retire them
  // as soon as c's own workload finishes, NOT after Promise.all: left queued
  // they exhaust their retry budget and get dropped, and the size of that window
  // is set by how long product-a's flood runs. That made this assertion pass on
  // a fast machine and fail on a loaded one.
  const cWork = workload("c", ["--count", "3"]).then(async (r) => {
    await retireProductCOffers().catch(() => {});
    return r;
  });
  const [a, b, c] = await Promise.all([
    workload("a", ["--count", "30", "--concurrency", "10"]),
    workload("b", ["--count", "4", "--concurrency", "2"]),
    cWork,
  ]);
  await retireProductCOffers();
  await waitForDrained(undefined, 900_000);
  await new Promise((r) => setTimeout(r, 20_000));

  const deliveredA = Number(await readCounter() - beforeCounter);
  const deliveredB = Number((await sinkBalance(ACTOR_SEEDS.bSink)) - beforeSinkB);
  const logs = await appLogsSince(since);
  // Drops are counted for the products whose isolation is under test. A dropped
  // product-c offer says nothing about whether a starved product-a stalled
  // anyone — that payload is undeliverable by design — so it is reported for
  // visibility but not asserted on.
  const drops = countMatches(logs, /DROPPING input.*target=product-[ab]\b/);
  const cDrops = countMatches(logs, /DROPPING input.*target=product-c\b/);
  const notes =
    `a: ${deliveredA}/${a.accepted} b: ${deliveredB}/${b.accepted} ` +
    `c accepted=${c.accepted} drops(a,b)=${drops} cOffersReaped=${cDrops}`;
  // product-c must have gotten work through too. Without this the test passes
  // while c contributes nothing, which is exactly the "not stalled" claim it
  // exists to make — a silent 0 here once hid a bug in c's workload.
  return ok(
    "M2",
    deliveredA === Number(a.accepted) && deliveredB === Number(b.accepted) &&
      Number(c.accepted) === 3 && drops === 0,
    notes,
  );
});

// ── M3: shared-queue dedup — identical payload to two targets ───────────────

register("M3", "Byte-identical payload on two targets creates two independent rows", async () => {
  // This is the guard for the shared-queue dedup key (FileStorage.createInputKey
  // must include the target). The payload has to be one that BOTH targets
  // accept, or only one row is ever created and the collision can't happen: a
  // matched swap offer qualifies — product-b takes it as a plain zswap
  // transfer, product-c takes it as a matched swap.
  //
  // With the old key (target cancelled out) the second submission collided
  // with the first row and was swallowed as a duplicate, so `c` would show 0.
  const { buildMatchedSwapHex } = await import("../product-c/workload.ts");
  const hex = await buildMatchedSwapHex(1n);

  await clearInputs(); // unambiguous counts
  const rb = await sendTx(hex, { target: "product-b", txStage: "unproven" });
  const rc = await sendTx(hex, { target: "product-c", txStage: "unproven" });

  const pb = await getPendingCountFor("product-b");
  const pc = await getPendingCountFor("product-c");

  // Neither row can settle — a swap offer is half a trade — so retire both
  // rather than waiting on delivery.
  await clearInputs("product-b").catch(() => {});
  await clearInputs("product-c").catch(() => {});

  return ok(
    "M3",
    rb.ok && rc.ok && pb >= 1 && pc >= 1,
    `b=${rb.ok ? "accepted" : `rejected(${rb.status})`} ` +
      `c=${rc.ok ? "accepted" : `rejected(${rc.status})`} rows: b=${pb} c=${pc}`,
  );
});

register("M4", "Unaddressed and unknown-target inputs are refused", async () => {
  const { buildTransferHex } = await import("../product-b/workload.ts");
  const hex = await buildTransferHex(1n);
  const noTarget = await sendTx(hex, { target: "product-b", txStage: "finalized", omitTarget: true });
  const unknown = await sendTx(hex, { target: "product-zzz", txStage: "finalized" });
  const pending = (await getStats()).totalPendingInputs;
  return ok(
    "M4",
    !noTarget.ok && noTarget.status === 400 && !unknown.ok && unknown.status === 404 && pending === 0,
    `noTarget=${noTarget.status} unknownTarget=${unknown.status} pending=${pending}`,
  );
});

// ── M5: tampered storage — policy re-checked pre-batch ──────────────────────

register("M5", "A policy-violating row written straight to storage is refused", async () => {
  const since = new Date().toISOString();
  const { buildTransferHex } = await import("../product-b/workload.ts");
  const hex = await buildTransferHex(1n);

  // Bypass /send-input entirely: append a transfer addressed to product-a
  // (whose policy only permits counter calls) directly into the shared queue.
  const storedInput = JSON.stringify({ tx: hex, txStage: "finalized" });
  const row = {
    address: "tamper",
    addressType: 5,
    input: storedInput,
    timestamp: String(Date.now()),
    target: "product-a",
  };
  appendFileSync(STORAGE_FILE, JSON.stringify(row) + "\n");

  // Every count below is scoped to THIS row's own trace hash, so no other
  // product's traffic can satisfy the assertion on its behalf.
  const traceHash = inputContentHash(storedInput);
  const hashPattern = escapeRegExp(traceHash);

  const drained = await waitForDrained("product-a", 300_000);
  const logs = await appLogsSince(since);

  // The defence-in-depth re-check of untrusted storage rows now lives in the
  // PRE-SPEND gate rather than in batch selection: a stored row that violates
  // policy is refused there, by name, with the typed permanent verdict
  // POLICY_REJECTED, and is REMOVED — where it used to be marked failed,
  // retry-charged to exhaustion and reaped by storage with a DROPPING warning.
  // Same property, enforced earlier and for free; the assertions below say so
  // explicitly rather than continuing to measure the old symptom.
  const policyRejects = countMatches(
    logs,
    new RegExp(`#${hashPattern}.*\\[permanentRejected\\]: Rejected by policy`),
  );
  const typedRemoval = countMatches(
    logs,
    /Permanently rejecting \d+ input\(s\) for target product-a: .*POLICY_REJECTED/,
  );
  // A batch that neither submitted nor retry-charged anything: the row cost
  // the sponsor no dust and no proving, which is the point of the gate.
  const zeroCostBatch = countMatches(
    logs,
    /Results: 0 submitted, 1 permanently rejected, 0 deferred, 0 retry-charged/,
  );
  const proved = countMatches(logs, new RegExp(`#${hashPattern}.*Proved \\(`));
  const retryCharged = countMatches(logs, new RegExp(`#${hashPattern}.*\\[failed\\]`));
  // Scoped to product-a: a permanent rejection must not go through the
  // retry-to-exhaustion path at all, so its target must never be dropped.
  const drops = countMatches(logs, /DROPPING input.*target=product-a\b/);
  // Other products must be unaffected.
  const b = await getTargetStats("product-b");
  return ok(
    "M5",
    drained && policyRejects > 0 && typedRemoval > 0 && zeroCostBatch > 0 &&
      proved === 0 && retryCharged === 0 && drops === 0 && b.pendingInputs === 0,
    `drained=${drained} hash=#${traceHash} policyRejects=${policyRejects} ` +
      `typedRemoval=${typedRemoval} zeroCostBatch=${zeroCostBatch} ` +
      `proved=${proved} retryCharged=${retryCharged} drops=${drops} ` +
      `productBPending=${b.pendingInputs}`,
  );
});

// ── M6: garbage / oversized intake ──────────────────────────────────────────

register("M6", "Garbage and oversized payloads are refused at intake", async () => {
  const cases: Array<[string, string]> = [
    ["not-json-not-hex", "hello world"],
    ["empty", ""],
    ["bad-stage", JSON.stringify({ tx: "aabb", txStage: "bogus" })],
    ["garbage-hex", JSON.stringify({ tx: "deadbeef".repeat(8), txStage: "finalized" })],
    ["huge", JSON.stringify({ tx: "ab".repeat(500_000) })],
  ];
  const results: string[] = [];
  for (const [label, raw] of cases) {
    const r = await sendTx("", { target: "product-b", rawInput: raw, timeoutMs: 30_000 })
      .catch((e) => ({ ok: false, status: 0, body: String(e) }));
    results.push(`${label}:${r.ok ? "ACCEPTED" : `rejected(${r.status})`}`);
  }
  const anyAccepted = results.some((r) => r.includes("ACCEPTED"));
  const pending = (await getStats()).totalPendingInputs;
  return ok("M6", !anyAccepted && pending === 0, `${results.join(" ")} pending=${pending}`);
});

// ── M7: per-target health + queue visibility ────────────────────────────────

register("M7", "Per-product health is observable via /queue-stats", async () => {
  const stats = await getStats();
  const products = buildProducts(NETWORK.id).map((p) => p.target);
  const missing = products.filter((t) => !stats.targets.some((s) => s.target === t));
  const withHealth = stats.targets.filter((t) => t.health?.workersTotal !== undefined);
  const detail = stats.targets
    .map((t) => `${t.target}[w=${t.health?.workersBusy ?? "?"}/${t.health?.workersTotal ?? "?"} dust=${t.health?.dustUtxos?.join("+") ?? "?"}]`)
    .join(" ");
  return ok(
    "M7",
    missing.length === 0 && withHealth.length === products.length,
    `${detail} missing=${missing.join(",") || "none"}`,
  );
});

// ── M8: node outage — park, recover, no drops, all products ────────────────

register("M8", "Node outage parks every product and drops nothing", async () => {
  const since = new Date().toISOString();
  const beforeCounter = await readCounter();
  const beforeSinkB = await sinkBalance(ACTOR_SEEDS.bSink);

  const running = Promise.all([
    workload("a", ["--count", "5", "--concurrency", "3"]),
    workload("b", ["--count", "3", "--concurrency", "2"]),
  ]);
  await new Promise((r) => setTimeout(r, 12_000));
  await setServicePaused("node", true);
  await new Promise((r) => setTimeout(r, 60_000));
  await setServicePaused("node", false);
  // Assert the chain is actually back before anything downstream is measured.
  // Without this, every later assertion silently becomes a measurement of a
  // frozen node rather than of the batcher's outage handling.
  if (!await waitForNodeRpc(180_000)) {
    throw new Error(
      "node did not answer RPC within 180s of unpause — the chain is still " +
        "frozen, so nothing after this point would be measuring the batcher",
    );
  }
  const [a, b] = await running;

  await retireProductCOffers();
  await waitForDrained(undefined, 900_000);
  await new Promise((r) => setTimeout(r, 20_000));
  const deliveredA = Number(await readCounter() - beforeCounter);
  const deliveredB = Number((await sinkBalance(ACTOR_SEEDS.bSink)) - beforeSinkB);
  const logs = await appLogsSince(since);
  const drops = countMatches(logs, /DROPPING input/);
  const parked = countMatches(logs, /Infra failure for target/);
  return ok(
    "M8",
    deliveredA === Number(a.accepted) && deliveredB === Number(b.accepted) && drops === 0,
    `a=${deliveredA}/${a.accepted} b=${deliveredB}/${b.accepted} parked=${parked} drops=${drops}`,
  );
});

// ── M9: restart with a mixed multi-product queue ────────────────────────────

register("M9", "Restart with a mixed queue delivers every product exactly once", async () => {
  const beforeCounter = await readCounter();
  const beforeSinkB = await sinkBalance(ACTOR_SEEDS.bSink);
  const [a, b] = await Promise.all([
    workload("a", ["--count", "4", "--concurrency", "4"]),
    workload("b", ["--count", "3", "--concurrency", "3"]),
  ]);
  await new Promise((r) => setTimeout(r, 3_000));
  await compose("restart", "app");
  await waitForBatcher(300_000);
  await retireProductCOffers();
  await waitForDrained(undefined, 900_000);
  await new Promise((r) => setTimeout(r, 20_000));

  const deliveredA = Number(await readCounter() - beforeCounter);
  const deliveredB = Number((await sinkBalance(ACTOR_SEEDS.bSink)) - beforeSinkB);
  const exact = deliveredA === Number(a.accepted) && deliveredB === Number(b.accepted);
  return ok(
    "M9",
    exact,
    `a=${deliveredA}/${a.accepted} b=${deliveredB}/${b.accepted}` +
      (deliveredA > Number(a.accepted) || deliveredB > Number(b.accepted) ? " (DOUBLE-SUBMIT!)" : ""),
  );
});

// ── M10: mixed soak + memory ───────────────────────────────────────────────

register("M10", "Mixed three-product soak", async () => {
  const since = new Date().toISOString();
  const beforeCounter = await readCounter();
  const beforeSinkB = await sinkBalance(ACTOR_SEEDS.bSink);
  const t0 = performance.now();
  const [a, b, c] = await Promise.all([
    workload("a", ["--count", "25", "--concurrency", "8"]),
    workload("b", ["--count", "10", "--concurrency", "4"]),
    workload("c", ["--count", "6"]),
  ]);
  await retireProductCOffers();
  await waitForDrained(undefined, 1_800_000);
  await new Promise((r) => setTimeout(r, 20_000));
  const wallS = (performance.now() - t0) / 1000;

  const deliveredA = Number(await readCounter() - beforeCounter);
  const deliveredB = Number((await sinkBalance(ACTOR_SEEDS.bSink)) - beforeSinkB);
  const logs = await appLogsSince(since);
  const dustErrors = countMatches(logs, /Insufficient Funds: could not balance dust/);
  const drops = countMatches(logs, /DROPPING input/);
  const lagP99Samples = [...logs.matchAll(/\[event-loop-lag\][^\n]*p99=([\d.]+)ms/g)]
    .map((match) => Number(match[1]));
  const lagP99Ms = lagP99Samples.length > 0 ? Math.max(...lagP99Samples) : Number.NaN;
  await sampleMemory();
  const childRss = Object.values(validationChildRss.peakMiB).sort((x, y) => x - y);
  const childRssMedian = childRss.length > 0 ? childRss[Math.floor(childRss.length / 2)]! : 0;
  const total = deliveredA + deliveredB + Number(c.accepted);
  return ok(
    "M10",
    dustErrors === 0 && drops === 0 && deliveredA === Number(a.accepted) &&
      deliveredB === Number(b.accepted) && Number.isFinite(lagP99Ms) && childRss.length > 0,
    `a=${deliveredA}/${a.accepted} b=${deliveredB}/${b.accepted} c=${c.accepted} ` +
      `wall=${wallS.toFixed(1)}s tps=${(total / wallS).toFixed(2)} ` +
      `eventLoopLagP99(max 5s window)=${lagP99Ms.toFixed(2)}ms ` +
      `validationChildRSS=${childRss.length} children ` +
      `${childRss[0]?.toFixed(1) ?? "?"}/${childRssMedian.toFixed(1)}/${childRss[childRss.length - 1]?.toFixed(1) ?? "?"} MiB min/median/max ` +
      `dustErrors=${dustErrors} drops=${drops}`,
  );
});

// ── M11: corrupted zswap proof dies before dust/proving ───────────────────

register("M11", "Corrupted proof is admitted, then permanently rejected pre-spend", async () => {
  const { buildTransferHex } = await import("../product-b/workload.ts");
  const { Transaction } = await import("@midnight-ntwrk/ledger-v8");
  const { ValidationExecutor } = await import(
    "../../../packages/batcher/adapters/validation-executor.ts"
  );
  const { makeIndexerBlockDataFetcher } = await import(
    "../../../packages/batcher/adapters/ledger-params-cache.ts"
  );

  await retireProductCOffers();
  await clearInputs("product-b").catch(() => {});
  const originalHex = await buildTransferHex(1n);
  const originalBytes = Buffer.from(originalHex, "hex");
  const block = await makeIndexerBlockDataFetcher(NETWORK.indexer)();
  const paramsBytes = block.ledgerParameters.serialize();
  const executor = new ValidationExecutor({ concurrency: 1, jobTimeoutMs: 30_000 });

  let corruptedHex = "";
  let corruptReason = "";
  let corruptFraction = 0;
  let finalizedDiagnostics: Record<string, unknown> | undefined;
  try {
    // D7: these are the original bytes of a real finalized transaction built
    // against this live stack. The optional diagnostic is captured inside the
    // child when it constructs WellFormedStrictness at the WASM boundary.
    const legitimate = await executor.submit({
      txBytes: originalBytes,
      paramsBytes,
      networkId: NETWORK.id,
      phase: "pre-spend",
      txStage: "finalized",
      nowMs: Date.now(),
      includeDiagnostics: true,
    });
    if (!legitimate.valid) {
      throw new Error(`legitimate finalized worker round trip failed: ${legitimate.reason}`);
    }
    finalizedDiagnostics = legitimate.diagnostics as unknown as Record<string, unknown>;
    const expectedDiagnostics = {
      phase: "pre-spend",
      txStage: "finalized",
      strictness: {
        enforceBalancing: false,
        verifySignatures: true,
        enforceLimits: false,
        verifyNativeProofs: false,
        verifyContractProofs: false,
      },
    };
    if (JSON.stringify(legitimate.diagnostics) !== JSON.stringify(expectedDiagnostics)) {
      throw new Error(`finalized diagnostics were not strict: ${JSON.stringify(legitimate.diagnostics)}`);
    }

    // The empirical spike found the proof body at 50/70/90% of this exact
    // transaction shape. Select only a candidate that still typed-deserializes
    // and that the real worker identifies specifically as an invalid zswap
    // proof, so a structural corruption cannot make M11 pass accidentally.
    for (const fraction of [0.5, 0.7, 0.9]) {
      const candidate = corruptByteAt(originalHex, fraction);
      try {
        Transaction.deserialize(
          "signature",
          "proof",
          "binding",
          Buffer.from(candidate, "hex"),
        );
      } catch {
        continue;
      }
      const verdict = await executor.submit({
        txBytes: Buffer.from(candidate, "hex"),
        paramsBytes,
        networkId: NETWORK.id,
        phase: "pre-spend",
        txStage: "finalized",
        nowMs: Date.now(),
      });
      if (!verdict.valid && /Invalid proof.*Zswap proof/i.test(verdict.reason ?? "")) {
        corruptedHex = candidate;
        corruptReason = verdict.reason ?? "";
        corruptFraction = fraction;
        break;
      }
    }
  } finally {
    await executor.close();
  }
  if (!corruptedHex) throw new Error("could not produce a parseable corrupted zswap proof");

  const storedInput = JSON.stringify({ tx: corruptedHex, txStage: "finalized" });
  const traceHash = inputContentHash(storedInput);
  const hashPattern = escapeRegExp(traceHash);
  const beforeDust = [...((await getTargetStats("product-b")).health?.dustUtxos ?? [])];
  const since = new Date().toISOString();

  const noWait = await sendTx(corruptedHex, {
    target: "product-b",
    txStage: "finalized",
    confirmationLevel: "no-wait",
  });
  const firstDrained = await waitForDrained("product-b", 300_000);

  // Re-submit only after removal so this is a fresh row, not a dedup hit.
  const waitReceipt = await sendTx(corruptedHex, {
    target: "product-b",
    txStage: "finalized",
    confirmationLevel: "wait-receipt",
    timeoutMs: 300_000,
  });
  const secondDrained = await waitForDrained("product-b", 300_000);
  const afterDust = [...((await getTargetStats("product-b")).health?.dustUtxos ?? [])];
  const logs = await appLogsSince(since);
  const receiptBody = waitReceipt.body as { errorCode?: string; retryable?: boolean } | null;

  const proved = countMatches(logs, new RegExp(`#${hashPattern}.*Proved \\(`));
  const proofRejects = countMatches(
    logs,
    new RegExp(`#${hashPattern}.*Invalid proof.*Zswap proof`, "i"),
  );
  const permanent = countMatches(
    logs,
    new RegExp(`#${hashPattern}.*\\[permanentRejected\\]`),
  );
  const wronglyRetryCharged = countMatches(
    logs,
    new RegExp(`#${hashPattern}.*\\[failed\\]`),
  );
  const zeroRetryOutcomes = countMatches(
    logs,
    /Results: 0 submitted, 1 permanently rejected, 0 deferred, 0 retry-charged/,
  );
  const dustUnchanged = JSON.stringify(afterDust) === JSON.stringify(beforeDust);
  const typedLateRejection = !waitReceipt.ok && waitReceipt.status === 400 &&
    receiptBody?.errorCode === "NOT_WELL_FORMED" && receiptBody.retryable === false;

  return ok(
    "M11",
    noWait.ok && noWait.status === 200 && firstDrained && secondDrained &&
      typedLateRejection && proved === 0 && proofRejects >= 2 &&
      permanent >= 2 && wronglyRetryCharged === 0 && zeroRetryOutcomes >= 2 &&
      beforeDust.length > 0 && dustUnchanged,
    `hash=#${traceHash} corruptAt=${Math.round(corruptFraction * 100)}% ` +
      `noWait=${noWait.status} waitReceipt=${waitReceipt.status}/${receiptBody?.errorCode ?? "?"} ` +
      `proved=${proved} proofRejects=${proofRejects} permanent=${permanent} ` +
      `retryCharged=${wronglyRetryCharged} zeroRetryOutcomes=${zeroRetryOutcomes} ` +
      `dust=${JSON.stringify(beforeDust)}→${JSON.stringify(afterDust)} ` +
      `D7=${JSON.stringify(finalizedDiagnostics)} reason=${corruptReason}`,
  );
});

// ── M12: intent TTL is sampled after the dust wait ────────────────────────

register("M12", "Intent-bearing call that expires during dust wait is refused", async () => {
  const { buildIncrementHex } = await import("../product-a/workload.ts");
  const { Transaction } = await import("@midnight-ntwrk/ledger-v8");
  const {
    enforcePreSpendTtl,
    PreSpendPermanent,
    waitForDustThenEnforceTtl,
  } = await import("../../../packages/batcher/adapters/midnight-balancing-adapter.ts");

  // Real live-stack bytes, not a transfer and not a fabricated transaction.
  // The clock and dust wait are deterministic because waiting for a real
  // contract call's default TTL to nearly expire would take many minutes.
  const callHex = await buildIncrementHex();
  const tx = Transaction.deserialize(
    "signature",
    "proof",
    "pre-binding",
    Buffer.from(callHex, "hex"),
  );
  const intents = [...(tx.intents?.values() ?? [])];
  const ttlValues = intents.map((intent) => {
    const ttl = (intent as { ttl?: Date | number | bigint }).ttl;
    return ttl instanceof Date ? ttl.getTime() : Number(ttl);
  }).filter(Number.isFinite);
  if (intents.length === 0 || ttlValues.length !== intents.length) {
    throw new Error(`real contract call did not expose readable intent TTLs (${intents.length})`);
  }

  const floor = 120_000;
  const earliestTtl = Math.min(...ttlValues);
  let nowMs = earliestTtl - floor - 1_000;
  const beforeWaitMs = earliestTtl - nowMs;
  enforcePreSpendTtl(tx as never, nowMs, floor); // safe immediately before the wait

  const order: string[] = [];
  let thrown: unknown;
  try {
    await waitForDustThenEnforceTtl({
      waitForDust: async () => {
        order.push("wait");
        nowMs += 2_000;
      },
      tx: () => {
        order.push("ttl");
        return tx as never;
      },
      now: () => nowMs,
      minRemainingMs: floor,
    });
  } catch (error) {
    thrown = error;
  }

  const rejection = thrown as { errorCode?: string; message?: string } | undefined;
  return ok(
    "M12",
    order.join("→") === "wait→ttl" && thrown instanceof PreSpendPermanent &&
      rejection?.errorCode === "TTL_TOO_SHORT",
    `realCallBytes=${callHex.length / 2} intents=${intents.length} ` +
      `beforeWait=${beforeWaitMs}ms afterWait=${earliestTtl - nowMs}ms ` +
      `floor=${floor}ms order=${order.join("→")} verdict=${rejection?.errorCode ?? "none"}`,
  );
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  setNetworkId(NETWORK.id as never);
  console.log(`[deep] batcher=${BATCHER_URL} network=${NETWORK.id}`);
  await waitForBatcher(300_000);
  startMemSampler();

  const ids = ONLY.length > 0 ? ONLY : Object.keys(tests);
  const results: TestResult[] = [];
  for (const id of ids) {
    const test = tests[id];
    if (!test) {
      console.error(`[deep] unknown test ${id}`);
      continue;
    }
    console.log(`\n[deep] ════ ${id}: ${test.name} ════`);
    const t0 = performance.now();
    try {
      const result = await test.fn();
      results.push(result);
      console.log(`[deep] ${id} → ${result.outcome} (${Math.round((performance.now() - t0) / 1000)}s) — ${result.notes}`);
    } catch (e) {
      const notes = e instanceof Error ? e.message : String(e);
      results.push({ id, name: test.name, outcome: "error", notes });
      console.error(`[deep] ${id} → ERROR: ${notes}`);
    }
    await retireProductCOffers().catch(() => {});
    await waitForDrained(undefined, 180_000).catch(() => {});
  }

  memStop = true;
  await sampleMemory().catch(() => {});
  const services = Object.keys(memStats.peakMiB).sort();
  const validationPids = Object.keys(validationChildRss.peakMiB)
    .sort((a, b) => Number(a) - Number(b));
  const validationRssValues = validationPids
    .map((pid) => validationChildRss.peakMiB[pid]!)
    .sort((a, b) => a - b);
  const validationRssMedian = validationRssValues.length > 0
    ? validationRssValues[Math.floor(validationRssValues.length / 2)]!
    : 0;
  const lines = [
    ``,
    `## Deep run ${new Date().toISOString()}`,
    ``,
    `| # | Test | Outcome | Notes |`,
    `|---|------|---------|-------|`,
    ...results.map((r) => `| ${r.id} | ${r.name} | **${r.outcome}** | ${r.notes.replaceAll("|", "\\|")} |`),
    ``,
    `**Memory (docker stats, ${memStats.samples} samples):**`,
    ``,
    `| service | peak MiB | final MiB |`,
    `|---|---|---|`,
    ...services.map((s) => `| ${s} | ${memStats.peakMiB[s].toFixed(1)} | ${(memStats.finalMiB[s] ?? 0).toFixed(1)} |`),
    ``,
    `**Validation child RSS (${validationChildRss.samples} samples):**`,
    ``,
    `| host PID | peak RSS MiB |`,
    `|---|---|`,
    ...validationPids.map((pid) => `| ${pid} | ${validationChildRss.peakMiB[pid]!.toFixed(1)} |`),
    ``,
    validationRssValues.length > 0
      ? `Per-child RSS min/median/max: ${validationRssValues[0]!.toFixed(1)} / ` +
        `${validationRssMedian.toFixed(1)} / ${validationRssValues[validationRssValues.length - 1]!.toFixed(1)} MiB ` +
        `across ${validationRssValues.length} children.`
      : `Per-child RSS: no validation-worker process was observed.`,
  ];
  try {
    appendFileSync(RESULTS_FILE, lines.join("\n") + "\n");
  } catch {
    writeFileSync(RESULTS_FILE, lines.join("\n") + "\n");
  }
  console.log("\n" + lines.join("\n"));

  const failed = results.filter((r) => r.outcome === "fail" || r.outcome === "error");
  process.exit(failed.length > 0 ? 1 : 0);
}

ignoreCleanWebSocketClose("deep");

main().catch((e) => {
  console.error("[deep] fatal:", e);
  process.exit(1);
});

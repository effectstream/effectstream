/**
 * Verifies the fetch-backpressure feature (Option B′) over the synthetic `test`
 * chain through the real runtime (`start()` + in-process PGLite).
 *
 *  1a — unbounded buffering: with a cap, the fetch loop pauses when the buffer is
 *       full, so it stays bounded (~cap + stepSize) instead of racing to the whole
 *       backlog — while the node keeps applying blocks (liveness).
 *  1b — head-of-line blocking: a stalled slow chain STILL halts block production
 *       (the merge gate is correct), but the fast chain's buffer is now bounded by
 *       the cap instead of ballooning behind the head-of-line block.
 *
 * Before the fix these buffers reached ~49k–50k (see
 * e2e/perf/results/BACKPRESSURE-BASELINE.md); these tests assert they now
 * stay at the cap. Each test also writes a JSON time-series artifact to
 * e2e/perf/results/ whose field names match e2e/perf/metrics.ts `Sample`, so the
 * perf HTML report's Backpressure section can render the same signals.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { TestChainControl } from "@effectstream/sync";
import fs from "node:fs";
import path from "node:path";
import {
  bufferSize,
  type Harness,
  latestFinalizedHeight,
  type RunningNode,
  setupHarness,
  sleep,
  TEST_PRIMITIVE_TYPE,
} from "./harness.ts";

const START_TIME = 1_700_000_000_000;
const BLOCK_TIME_MS = 1000;
const STEP_SIZE = 1000;
// A deep backlog the arithmetic fetcher would race through if uncapped (baseline
// hit ~49k–50k). The slow chain (1b) is pinned low so the merge stalls at its tip.
const BIG_TIP = 50_000;
const SLOW_TIP = 50;
// Explicit small cap so the bound is deterministic and far below the backlog.
// The fetch pauses at >= CAP; one in-flight chunk can overshoot by ~stepSize, so
// the buffer settles in [~CAP, CAP + stepSize]. We assert it lands in that band.
const CAP = 3000;
const CAP_FLOOR = CAP - STEP_SIZE; // proves backpressure actually engaged
const BUFFER_BOUND = CAP + STEP_SIZE + 200; // upper bound incl. one overshoot chunk

// e2e/perf/results lives at the repo root: reproduction → test → runtime →
// node-sdk → packages → <root>/e2e/perf/results.
const RESULTS_DIR = path.resolve(
  import.meta.dirname!,
  "../../../../../e2e/perf/results",
);

/** One time-series row; field names mirror e2e/perf/metrics.ts `Sample`. */
type BufSample = {
  t: number;
  wall: number;
  mainBuf: number;
  evmBuf: number; // the parallel chain's buffer (report labels it "parallel buf")
  mainOwnBlock: number | null;
  evmOwnBlock: number | null;
  rss: number;
  appliedBlock: number | null;
};

function ownBlock(node: RunningNode, name: string): number | null {
  return node.syncProtocols().find((p) => p.name === name)?.lastPage
    ?.ownBlockNumber ?? null;
}

/** Backpressure "fired" counter (rising edges) exposed on SyncState / /debug/metrics. */
function pauses(node: RunningNode, name: string): number {
  return node.syncProtocols().find((p) => p.name === name)
    ?.backpressurePauses ?? 0;
}

/** Side-effect-only artifact write; never throws into the test. */
function writeArtifact(
  name: string,
  samples: BufSample[],
  meta: Record<string, unknown>,
): void {
  try {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(RESULTS_DIR, `${name}-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify({ meta, samples }, null, 2));
    console.log(`buffering artifact: ${file}`);
  } catch (e) {
    console.warn(`failed to write buffering artifact: ${String(e)}`);
  }
}

let h: Harness;
beforeEach(async () => {
  h = await setupHarness();
});
afterEach(async () => {
  await h?.teardown();
});

// ── 1a — unbounded buffering, now bounded by the cap ────────────────────────────

const MAIN_1A = "mainClock1a";
const PAR_1A = "parallelP1a";

function buildConfig1a() {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-buffering-1a"))
    .buildNetworks((b) =>
      b
        .addNetwork({
          name: "clock",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainP",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
    )
    .buildDeployments((b) => b)
    .buildSyncProtocols((b) =>
      b
        .addMain(
          (n) => n.clock,
          () => ({
            name: MAIN_1A,
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            maxBufferedPages: CAP,
          }),
        )
        .addParallel(
          (n) => (n as any).chainP,
          () => ({
            name: PAR_1A,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            delayMs: 0,
            events: [],
            maxBufferedPages: CAP,
          }),
        )
    )
    .buildPrimitives((b) =>
      b.addPrimitive(
        (sp) => (sp as any)[PAR_1A],
        () => ({ name: "noEvt1a", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
      )
    )
    .build();
}

test("1a: backpressure caps the buffer while the node keeps applying blocks", async () => {
  // Tips far ahead of where the one-block-per-txn merge can drain to: without a
  // cap the fetcher would race to ~50k; with the cap it must plateau near CAP.
  TestChainControl.setTip(MAIN_1A, BIG_TIP);
  TestChainControl.setTip(PAR_1A, BIG_TIP);

  const node = await h.runNode({ config: buildConfig1a(), apiPort: 19141 });
  const samples: BufSample[] = [];
  let peakMain = 0;
  let peakEvm = 0;
  let lastApplied = 0;
  let mainPauses = 0;
  try {
    const startMs = Date.now();
    const deadline = startMs + 6000;
    while (Date.now() < deadline) {
      const wall = Date.now();
      const mainBuf = bufferSize(node, MAIN_1A);
      const evmBuf = bufferSize(node, PAR_1A);
      const appliedBlock = await latestFinalizedHeight(h.pool);
      samples.push({
        t: wall - startMs,
        wall,
        mainBuf,
        evmBuf,
        mainOwnBlock: ownBlock(node, MAIN_1A),
        evmOwnBlock: ownBlock(node, PAR_1A),
        rss: process.memoryUsage().rss,
        appliedBlock,
      });
      peakMain = Math.max(peakMain, mainBuf);
      peakEvm = Math.max(peakEvm, evmBuf);
      lastApplied = appliedBlock ?? lastApplied;
      // Backpressure engaged (buffer hit the cap) AND the node is still applying
      // blocks → we've captured the bounded steady state; stop early.
      if (peakMain >= CAP && lastApplied >= 20) break;
      await sleep(50);
    }
  } finally {
    mainPauses = pauses(node, MAIN_1A);
    writeArtifact("buffering-1a", samples, {
      mode: "1a-bounded-by-cap",
      stepSize: STEP_SIZE,
      bigTip: BIG_TIP,
      cap: CAP,
      bufferBound: BUFFER_BOUND,
      peakMainBuf: peakMain,
      peakEvmBuf: peakEvm,
      lastApplied,
      pauses: mainPauses,
    });
    await node.stop();
  }

  // Backpressure engaged: the buffer reached the cap (not starved)...
  expect(peakMain).toBeGreaterThanOrEqual(CAP_FLOOR);
  // ...but stayed bounded — nowhere near the uncapped ~49k backlog.
  expect(Math.max(peakMain, peakEvm)).toBeLessThanOrEqual(BUFFER_BOUND);
  // ...the node kept producing/applying blocks (no deadlock)...
  expect(lastApplied).toBeGreaterThanOrEqual(20);
  // ...and the cap actually fired (the observability metric populated).
  expect(mainPauses).toBeGreaterThan(0);
}, 60_000);

// ── 1b — head-of-line blocking, sibling buffer now bounded ──────────────────────

const MAIN_1B = "mainClock1b";
const FAST_1B = "fastP1b";
const SLOW_1B = "slowP1b";

function buildConfig1b() {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-buffering-1b"))
    .buildNetworks((b) =>
      b
        .addNetwork({
          name: "clock",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainFast",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainSlow",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
    )
    .buildDeployments((b) => b)
    .buildSyncProtocols((b) =>
      b
        .addMain(
          (n) => n.clock,
          () => ({
            name: MAIN_1B,
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            maxBufferedPages: CAP,
          }),
        )
        .addParallel(
          (n) => (n as any).chainFast,
          () => ({
            name: FAST_1B,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            delayMs: 0,
            events: [],
            maxBufferedPages: CAP,
          }),
        )
        .addParallel(
          (n) => (n as any).chainSlow,
          () => ({
            name: SLOW_1B,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            delayMs: 0,
            events: [],
            maxBufferedPages: CAP,
          }),
        )
    )
    .buildPrimitives((b) =>
      b
        .addPrimitive(
          (sp) => (sp as any)[FAST_1B],
          () => ({ name: "noEvtFast", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
        )
        .addPrimitive(
          (sp) => (sp as any)[SLOW_1B],
          () => ({ name: "noEvtSlow", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
        )
    )
    .build();
}

test("1b: a stalled chain still halts production, but the fast chain's buffer stays capped", async () => {
  // slowP pinned at a low tip → the merge stalls there forever (correct). fastP and
  // the main clock keep fetching toward their high tips, but the cap now bounds them.
  TestChainControl.setTip(MAIN_1B, BIG_TIP);
  TestChainControl.setTip(FAST_1B, BIG_TIP);
  TestChainControl.setTip(SLOW_1B, SLOW_TIP);

  const node = await h.runNode({ config: buildConfig1b(), apiPort: 19142 });
  const samples: BufSample[] = [];
  let peakMain = 0;
  let peakFast = 0;
  let stalledHeight = -1;
  let fastPauses = 0;
  try {
    const startMs = Date.now();
    const deadline = startMs + 15_000;
    let lastHeight = -1;
    let lastChange = Date.now();
    while (Date.now() < deadline) {
      const wall = Date.now();
      const mainBuf = bufferSize(node, MAIN_1B);
      const fastBuf = bufferSize(node, FAST_1B);
      const appliedBlock = await latestFinalizedHeight(h.pool);
      samples.push({
        t: wall - startMs,
        wall,
        mainBuf,
        evmBuf: fastBuf,
        mainOwnBlock: ownBlock(node, MAIN_1B),
        evmOwnBlock: ownBlock(node, FAST_1B),
        rss: process.memoryUsage().rss,
        appliedBlock,
      });
      peakMain = Math.max(peakMain, mainBuf);
      peakFast = Math.max(peakFast, fastBuf);
      if (appliedBlock !== lastHeight) {
        lastHeight = appliedBlock;
        lastChange = wall;
      }
      // Production has stalled (height flat ≥1.5s) AND the fast chain has hit its
      // cap → the head-of-line block holds while the sibling buffer is bounded.
      if (wall - lastChange >= 1500 && peakFast >= CAP_FLOOR) {
        stalledHeight = appliedBlock ?? -1;
        break;
      }
      await sleep(50);
    }
  } finally {
    fastPauses = pauses(node, FAST_1B);
    writeArtifact("buffering-1b", samples, {
      mode: "1b-hol-sibling-bounded",
      stepSize: STEP_SIZE,
      bigTip: BIG_TIP,
      slowTip: SLOW_TIP,
      cap: CAP,
      bufferBound: BUFFER_BOUND,
      stalledHeight,
      peakMainBuf: peakMain,
      peakFastBuf: peakFast,
      fastPauses,
    });
    await node.stop();
  }

  // Block production still stalls at ~the slow chain's tip (the merge gate is correct)...
  expect(stalledHeight).toBeGreaterThanOrEqual(0);
  expect(stalledHeight).toBeLessThanOrEqual(SLOW_TIP + 10);
  // ...the fast chain's buffer engaged the cap...
  expect(peakFast).toBeGreaterThanOrEqual(CAP_FLOOR);
  // ...but stayed bounded behind the head-of-line block (was ~50k uncapped)...
  expect(peakFast).toBeLessThanOrEqual(BUFFER_BOUND);
  expect(peakMain).toBeLessThanOrEqual(BUFFER_BOUND);
  // ...and the cap actually fired on the fast chain (observability metric populated).
  expect(fastPauses).toBeGreaterThan(0);
}, 60_000);

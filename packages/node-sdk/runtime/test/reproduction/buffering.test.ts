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
 *  1c — skip-ahead: the merge-demand exemption lifts the cap while the merge is gated
 *       on a chain whose page is far behind the (skipped-ahead) root, so it advances
 *       instead of deadlocking.
 *  1d — density: the same exemption when a parallel chain is finer-grained than the cap.
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
    const deadline = startMs + 30_000;
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
    // Generous for slow CI; exits early once the stall + capped sibling are captured.
    const deadline = startMs + 30_000;
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

// ── 1c — skip-ahead: merge-demand exemption keeps the cap from deadlocking ────────
//
// The root (main clock) starts far ahead of a parallel chain that starts at block 1.
// To produce the first root block at τ (main page SKIP_START) the merge needs the
// parallel page PAST τ — so the fetcher must scan ~SKIP_START blocks, more than the
// cap. The exemption lifts the cap while the merge is gated on this chain, so it
// reaches τ and production proceeds (without it the node wedges on the first block).

const MAIN_1C = "mainClock1c";
const PAR_1C = "parallelP1c";
// Main genesis page (skip-ahead); cap far below it so the parallel chain must buffer
// past the cap to reach τ.
const SKIP_START = 300;
const SMALL_STEP = 50;
const SMALL_CAP = 100;
// Liveness: past the first non-empty block at SKIP_START.
const LIVE_TARGET_1C = SKIP_START + 10;
// Bounded by necessity: at most the skip window + one in-flight chunk.
const SKIP_BUFFER_BOUND = SKIP_START + SMALL_STEP + 200;

function buildConfig1c() {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-buffering-1c"))
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
            name: MAIN_1C,
            type: ConfigSyncProtocolType.TEST_MAIN,
            // Skipped far ahead of the parallel chain (the recovery skip-ahead).
            startBlockHeight: SKIP_START,
            pollingInterval: 30,
            stepSize: SMALL_STEP,
            maxBufferedPages: SMALL_CAP,
          }),
        )
        .addParallel(
          (n) => (n as any).chainP,
          () => ({
            name: PAR_1C,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: SMALL_STEP,
            delayMs: 0,
            events: [],
            maxBufferedPages: SMALL_CAP,
          }),
        )
    )
    .buildPrimitives((b) =>
      b.addPrimitive(
        (sp) => (sp as any)[PAR_1C],
        () => ({ name: "noEvt1c", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
      )
    )
    .build();
}

test("1c: a skipped-ahead root does NOT deadlock the merge on the first non-empty block", async () => {
  // Main skipped to SKIP_START; parallel starts at 1 with a high tip.
  TestChainControl.setTip(MAIN_1C, SKIP_START + 100);
  TestChainControl.setTip(PAR_1C, 10_000);

  const node = await h.runNode({ config: buildConfig1c(), apiPort: 19143 });
  const samples: BufSample[] = [];
  let peakPar = 0;
  let lastApplied = 0;
  try {
    const startMs = Date.now();
    // Generous for slow CI; exits early once the liveness target is reached.
    const deadline = startMs + 30_000;
    while (Date.now() < deadline) {
      const wall = Date.now();
      const mainBuf = bufferSize(node, MAIN_1C);
      const parBuf = bufferSize(node, PAR_1C);
      const appliedBlock = await latestFinalizedHeight(h.pool);
      samples.push({
        t: wall - startMs,
        wall,
        mainBuf,
        evmBuf: parBuf,
        mainOwnBlock: ownBlock(node, MAIN_1C),
        evmOwnBlock: ownBlock(node, PAR_1C),
        rss: process.memoryUsage().rss,
        appliedBlock,
      });
      peakPar = Math.max(peakPar, parBuf);
      lastApplied = appliedBlock ?? lastApplied;
      // Got past the first non-empty block → the deadlock is broken; stop early.
      if (lastApplied >= LIVE_TARGET_1C) break;
      await sleep(50);
    }
  } finally {
    writeArtifact("buffering-1c", samples, {
      mode: "1c-skip-ahead-deadlock",
      stepSize: SMALL_STEP,
      skipStart: SKIP_START,
      cap: SMALL_CAP,
      liveTarget: LIVE_TARGET_1C,
      peakParBuf: peakPar,
      lastApplied,
    });
    await node.stop();
  }

  // Liveness: production advanced past the first non-empty block (no wedge).
  expect(lastApplied).toBeGreaterThanOrEqual(LIVE_TARGET_1C);
  // Bounded by necessity: only the skip window + one chunk, not the whole tip.
  expect(peakPar).toBeLessThanOrEqual(SKIP_BUFFER_BOUND);
}, 60_000);

// ── 1d — density: same exemption when a chain is finer-grained than the cap ───────
//
// Same circular wait without a skip-ahead: a parallel chain far finer than the root
// (100 parallel blocks per root slot). Each root block needs the parallel page past
// the slot boundary (~PER_SLOT buffered items), but the cap is below that. The
// exemption lets the per-slot window buffer and drain each slot (without it the node
// wedges on the first block).

const MAIN_1D = "mainClock1d";
const PAR_1D = "parallelP1d";
const DENSE_BLOCK_MS = 10; // 100 parallel blocks per 1000ms root slot
const PER_SLOT = BLOCK_TIME_MS / DENSE_BLOCK_MS; // 100 parallel items per root slot
// Step + cap small enough that cap + one overshoot chunk (~40) stays below PER_SLOT
// (100), so the fetcher pauses before its page can cross the slot boundary.
const DENSE_STEP = 10;
const CAP_1D = 30;
const LIVE_TARGET_1D = 20;
// Bounded by the per-slot need plus one chunk — not the whole tip.
const DENSE_BUFFER_BOUND = PER_SLOT + DENSE_STEP + 150;

function buildConfig1d() {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-buffering-1d"))
    .buildNetworks((b) =>
      b
        .addNetwork({
          name: "clock",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainDense",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: DENSE_BLOCK_MS,
        })
    )
    .buildDeployments((b) => b)
    .buildSyncProtocols((b) =>
      b
        .addMain(
          (n) => n.clock,
          () => ({
            name: MAIN_1D,
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: DENSE_STEP,
            maxBufferedPages: 200,
          }),
        )
        .addParallel(
          (n) => (n as any).chainDense,
          () => ({
            name: PAR_1D,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: DENSE_STEP,
            delayMs: 0,
            events: [],
            maxBufferedPages: CAP_1D,
          }),
        )
    )
    .buildPrimitives((b) =>
      b.addPrimitive(
        (sp) => (sp as any)[PAR_1D],
        () => ({ name: "noEvt1d", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
      )
    )
    .build();
}

test("1d: a parallel chain denser than the cap does NOT deadlock the merge", async () => {
  TestChainControl.setTip(MAIN_1D, 60);
  TestChainControl.setTip(PAR_1D, 10_000);

  const node = await h.runNode({ config: buildConfig1d(), apiPort: 19144 });
  const samples: BufSample[] = [];
  let peakPar = 0;
  let lastApplied = 0;
  try {
    const startMs = Date.now();
    // Generous for slow CI; exits early once the liveness target is reached.
    const deadline = startMs + 30_000;
    while (Date.now() < deadline) {
      const wall = Date.now();
      const mainBuf = bufferSize(node, MAIN_1D);
      const parBuf = bufferSize(node, PAR_1D);
      const appliedBlock = await latestFinalizedHeight(h.pool);
      samples.push({
        t: wall - startMs,
        wall,
        mainBuf,
        evmBuf: parBuf,
        mainOwnBlock: ownBlock(node, MAIN_1D),
        evmOwnBlock: ownBlock(node, PAR_1D),
        rss: process.memoryUsage().rss,
        appliedBlock,
      });
      peakPar = Math.max(peakPar, parBuf);
      lastApplied = appliedBlock ?? lastApplied;
      if (lastApplied >= LIVE_TARGET_1D) break;
      await sleep(50);
    }
  } finally {
    writeArtifact("buffering-1d", samples, {
      mode: "1d-density-deadlock",
      stepSize: SMALL_STEP,
      denseBlockMs: DENSE_BLOCK_MS,
      perSlot: PER_SLOT,
      cap: CAP_1D,
      liveTarget: LIVE_TARGET_1D,
      peakParBuf: peakPar,
      lastApplied,
    });
    await node.stop();
  }

  // Liveness: the node produces blocks (no wedge on block 1).
  expect(lastApplied).toBeGreaterThanOrEqual(LIVE_TARGET_1D);
  // Bounded by the per-slot need: ~one slot of parallel data plus one chunk.
  expect(peakPar).toBeLessThanOrEqual(DENSE_BUFFER_BOUND);
}, 60_000);

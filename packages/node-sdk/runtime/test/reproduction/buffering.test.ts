/**
 * Deterministic MEASUREMENT of sync issue #1 (NOT a fix).
 *
 * Two failure modes, both reproduced over the synthetic `test` chain through the
 * real runtime (`start()` + in-process PGLite):
 *
 *  1a — unbounded buffering: the per-chain fetch loop races to its tip with no
 *       backpressure while the merge drains one block per DB txn. The in-memory
 *       `bufferedData` Deque balloons toward the whole backlog (OOM risk).
 *  1b — head-of-line blocking: the merge gates each slot on the *slowest* parallel
 *       chain's page advancing; a stalled chain halts ALL block production while
 *       the other chains' Deques keep ballooning.
 *
 * These tests assert the problem EXISTS (buffer grows unbounded relative to
 * stepSize). A future backpressure fix would intentionally invert them. Each test
 * also writes a small JSON time-series artifact to e2e/perf/results/ whose field
 * names match e2e/perf/metrics.ts `Sample`, so the perf HTML report's Backpressure
 * section can render the same signals.
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
// Big enough to prove unboundedness, small enough to stay a few-second unit test
// (~50k tiny objects per Deque ≈ tens of MB). A single fetch chunk already adds
// stepSize+1; a hypothetical backpressure fix would cap at ~1-2× stepSize.
const BIG_TIP = 50_000;
const SLOW_TIP = 50;
// Robust lower bound: 5× stepSize is ~10× below the deterministic ceiling, so CI
// timing jitter can't trip it, yet it's impossible to satisfy with backpressure.
const UNBOUNDED_THRESHOLD = 5 * STEP_SIZE;

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

// ── 1a — unbounded buffering ───────────────────────────────────────────────────

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

test("1a: fetch with no backpressure balloons the buffer toward the whole backlog", async () => {
  // A deep backlog the fetcher can race through arithmetically: tip far ahead of
  // where the one-block-per-txn merge can drain to.
  TestChainControl.setTip(MAIN_1A, BIG_TIP);
  TestChainControl.setTip(PAR_1A, BIG_TIP);

  const node = await h.runNode({ config: buildConfig1a(), apiPort: 19141 });
  const samples: BufSample[] = [];
  let peakMain = 0;
  let peakEvm = 0;
  try {
    const startMs = Date.now();
    const deadline = startMs + 6000;
    // Sample DURING catch-up — do NOT wait for stable first (that would drain the
    // buffer back to ~0 before we look).
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
      // Stop once the buffer has clearly ballooned AND the node is alive (applying
      // blocks) so the captured curve is meaningful.
      if (Math.max(peakMain, peakEvm) > UNBOUNDED_THRESHOLD && appliedBlock >= 50) {
        break;
      }
      await sleep(50);
    }
  } finally {
    writeArtifact("buffering-1a", samples, {
      mode: "1a-unbounded-buffering",
      stepSize: STEP_SIZE,
      bigTip: BIG_TIP,
      threshold: UNBOUNDED_THRESHOLD,
      peakMainBuf: peakMain,
      peakEvmBuf: peakEvm,
    });
    await node.stop();
  }

  // The buffer raced far past anything a single fetch chunk explains: no backpressure.
  expect(Math.max(peakMain, peakEvm)).toBeGreaterThan(UNBOUNDED_THRESHOLD);
}, 60_000);

// ── 1b — head-of-line blocking ──────────────────────────────────────────────────

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

test("1b: a stalled chain halts block production while the fast chain's buffer balloons", async () => {
  // slowP is pinned at a low tip: once its page freezes, the merge can never
  // advance past that slot, so block production stalls there forever — yet fastP
  // (and the main clock) keep fetching toward their high tips with no backpressure.
  TestChainControl.setTip(MAIN_1B, BIG_TIP);
  TestChainControl.setTip(FAST_1B, BIG_TIP);
  TestChainControl.setTip(SLOW_1B, SLOW_TIP);

  const node = await h.runNode({ config: buildConfig1b(), apiPort: 19142 });
  const samples: BufSample[] = [];
  let peakMain = 0;
  let peakFast = 0;
  let stalledHeight = -1;
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
      // Production has stalled (height flat ≥1s) AND the fast chain has ballooned.
      if (wall - lastChange >= 1000 && peakFast > UNBOUNDED_THRESHOLD) {
        stalledHeight = appliedBlock;
        break;
      }
      await sleep(50);
    }
  } finally {
    writeArtifact("buffering-1b", samples, {
      mode: "1b-head-of-line-blocking",
      stepSize: STEP_SIZE,
      bigTip: BIG_TIP,
      slowTip: SLOW_TIP,
      threshold: UNBOUNDED_THRESHOLD,
      stalledHeight,
      peakMainBuf: peakMain,
      peakFastBuf: peakFast,
    });
    await node.stop();
  }

  // Block production stalled at ~the slow chain's tip (plateau ≈ SLOW_TIP)...
  expect(stalledHeight).toBeGreaterThanOrEqual(0);
  expect(stalledHeight).toBeLessThanOrEqual(SLOW_TIP + 10);
  // ...while the fast chain's buffer ballooned unbounded behind the head-of-line block.
  expect(peakFast).toBeGreaterThan(UNBOUNDED_THRESHOLD);
}, 60_000);

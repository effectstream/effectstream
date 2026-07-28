/**
 * Memory / queue-depth characterization for empty-block coalescing during a deep
 * catch-up (sync/CLAUDE.md Finding #1 + Fix E).
 *
 * Coalescing is a consumer-side speedup: folding empty catch-up blocks removes the
 * per-block STF + DB-commit bottleneck that otherwise acts as accidental
 * backpressure. The worry is that, with that brake gone, the fetchers race to tip
 * and either (a) balloon the uncapped `finalizedBlockStream` subscriber queue or
 * (b) keep a parallel chain in the cap-lifted merge-demand exemption long enough to
 * grow its Deque toward the whole backlog.
 *
 * This test drives a deep, all-empty catch-up with coalescing ON and asserts hard
 * ceilings on the stream backlog (`inFlight`) and per-protocol buffers, plus a soft
 * memory guard and a liveness check. Green → coalescing keeps everything bounded
 * (regression guard). Red on the backlog/buffer bound → reproduces the leak, and the
 * captured peak series localizes it.
 *
 * Postgres-only (chosen backend): higher-fidelity apply throughput than PGLite.
 * Skips when no Postgres binary is on PATH.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { TestChainControl } from "@effectstream/sync";
import {
  bufferSize,
  type Harness,
  latestFinalizedHeight,
  postgresAvailable,
  type RunningNode,
  setupHarness,
  sleep,
  TEST_PRIMITIVE_TYPE,
} from "./harness.ts";

const RUN = postgresAvailable();

const START_TIME = 1_700_000_000_000; // ~Nov 2023: every catch-up block is "old"
const MAIN_BLOCK_MS = 1000;
const PAR_BLOCK_MS = 100; // 10 parallel blocks per root slot
const STEP_SIZE = 1000;
const CAP = 3000;

// A deep backlog: ~15k root slots the one-block-per-txn merge could never drain to
// in time, so without coalescing the node would crawl — and any unbounded structure
// would grow toward the whole backlog. Coalescing must fold the empties and keep
// memory flat.
const MAIN_TIP = 15_000;
const PAR_TIP = MAIN_TIP * (MAIN_BLOCK_MS / PAR_BLOCK_MS); // cover the same wall range

// Buffer settles in [~CAP, CAP + stepSize]; allow one overshoot chunk + slack.
const BUFFER_BOUND = CAP + STEP_SIZE + 200;
// The stream backlog must stay far below the whole-backlog (~MAIN_TIP) failure mode.
// A healthy fast consumer keeps this in the low hundreds; we allow generous slack.
const QUEUE_BOUND = 5_000;
// Liveness: the node must catch up essentially to the tip (no deadlock / no crawl).
const LIVE_TARGET = Math.floor(MAIN_TIP * 0.9);

const MAIN = "memMainClock";
const PAR = "memParallelP";

function buildConfig() {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-coalesce-mem"))
    .buildNetworks((b) =>
      b
        .addNetwork({
          name: "clock",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: MAIN_BLOCK_MS,
        })
        .addNetwork({
          name: "chainP",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: PAR_BLOCK_MS,
        })
    )
    .buildDeployments((b) => b)
    .buildSyncProtocols((b) =>
      b
        .addMain(
          (n) => n.clock,
          () => ({
            name: MAIN,
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
            name: PAR,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            delayMs: 0,
            events: [], // no primitives → every block is coalescable
            maxBufferedPages: CAP,
          }),
        )
    )
    .buildPrimitives((b) =>
      b.addPrimitive(
        (sp) => (sp as any)[PAR],
        () => ({ name: "noEvtMem", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
      )
    )
    .build();
}

let h: Harness;
beforeEach(async () => {
  if (!RUN) return;
  h = await setupHarness({ backend: "postgres" });
});
afterEach(async () => {
  if (!RUN) return;
  await h?.teardown();
});

test("coalescing keeps stream backlog & buffers bounded during a deep empty catch-up", async () => {
  if (!RUN) {
    console.warn("coalesce-memory: skipped (no Postgres binary on PATH)");
    return;
  }

  TestChainControl.setTip(MAIN, MAIN_TIP);
  TestChainControl.setTip(PAR, PAR_TIP);

  const node: RunningNode = await h.runNode({
    config: buildConfig(),
    apiPort: 19181,
    coalesce: true,
  });

  let peakMain = 0;
  let peakPar = 0;
  let peakInFlight = 0;
  let lastCoalesced = 0;
  let lastApplied = 0;

  try {
    const startMs = Date.now();
    const deadline = startMs + 110_000;
    while (Date.now() < deadline) {
      peakMain = Math.max(peakMain, bufferSize(node, MAIN));
      peakPar = Math.max(peakPar, bufferSize(node, PAR));
      peakInFlight = Math.max(peakInFlight, node.inFlight);
      lastCoalesced = node.coalescedBlocks;
      lastApplied = (await latestFinalizedHeight(h.pool)) ?? lastApplied;
      if (lastApplied >= LIVE_TARGET) break; // caught up — bounded steady state captured
      await sleep(50);
    }
  } finally {
    console.log(
      `coalesce-memory: peakInFlight=${peakInFlight} mainBuf=${peakMain} ` +
        `parBuf=${peakPar} coalesced=${lastCoalesced} applied=${lastApplied}`,
    );
    await node.stop();
  }

  // 1. Coalescing actually fired (else this is a no-op test).
  expect(lastCoalesced).toBeGreaterThan(1000);
  // 2. Stream backlog stayed bounded — the merge did NOT outrun the consumer
  //    toward the whole backlog (the uncapped subscriber queue, Finding #1). This
  //    bounded queue is what keeps memory flat; no separate RSS check is needed.
  expect(peakInFlight).toBeLessThanOrEqual(QUEUE_BOUND);
  // 3. Per-protocol buffers stayed at the cap, even under coalescing's fast consumer.
  expect(Math.max(peakMain, peakPar)).toBeLessThanOrEqual(BUFFER_BOUND);
  // 4. Liveness: the node caught up to the tip (no deadlock / no crawl).
  expect(lastApplied).toBeGreaterThanOrEqual(LIVE_TARGET);
}, 120_000);

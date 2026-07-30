/**
 * Timing must not change state.
 *
 * The whole pipeline rests on one property: two nodes syncing the same chains
 * reach byte-identical state, regardless of how fast they got there. Block `n`
 * always holds the same data on every machine, so the block-hash chain — and
 * everything downstream of it — agrees.
 *
 * That property is easy to break by accident, and three changes in this branch
 * touch the fetch path: per-request timeouts, unconditional loop pacing, and
 * producer supervision. All three alter *when* a fetch happens, so this test
 * varies exactly those knobs and asserts the resulting databases are identical.
 *
 * Why it holds, and what would break it:
 *
 *   - Pacing changes only how often the loop asks. A block's content is a pure
 *     function of its height (the main clock derives timestamps arithmetically;
 *     parallel data merges into the first root block whose timestamp is >= its
 *     own), so polling faster only reaches the same answer sooner.
 *
 *   - A timeout makes `readData` throw, and `lastPage` only advances on a
 *     COMPLETE `DataFetched` — so a timeout re-fetches the same range rather
 *     than skipping it. A slower machine that times out where a faster one does
 *     not therefore converges on the same data. It would NOT be safe if a
 *     partial result were ever committed, which is why the fetchers build their
 *     whole page-range before returning.
 *
 * The synthetic chain is deterministic by construction, so any difference here
 * comes from the engine rather than from the chain.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { TestChainControl } from "@effectstream/sync";
import {
  compareConsistencySnapshots,
  type ConsistencySnapshot,
  dumpConsistencySnapshot,
  SYNC_BOOKKEEPING_TABLES,
} from "./consistency-snapshot.ts";
import { type Harness, setupHarness, TEST_PRIMITIVE_TYPE } from "./harness.ts";

const START_TIME = 1_700_000_000_000;
const BLOCK_TIME_MS = 1000;
const TARGET = 60;
/**
 * The parallel chain is deliberately fetched further than the main clock. The
 * merge only folds a parallel chain's data into root timestamp T once that
 * chain's page is STRICTLY past T, so a parallel tip equal to the main tip
 * stalls production one block short of the target (see the merge-boundary note
 * in sync/CLAUDE.md).
 */
const PARALLEL_TIP = TARGET + 40;

const MAIN = "detMain";
const PAR = "detParallel";

/** Events spread across the range so several blocks carry state. */
const EVENTS = [
  { atBlock: 12, payload: { v: "a" } },
  { atBlock: 25, payload: { v: "b" } },
  { atBlock: 44, payload: { v: "c" } },
];

type Timing = {
  pollingInterval: number;
  stepSize: number;
  requestTimeoutMs: number;
};

function buildConfig(timing: Timing) {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-determinism"))
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
            name: MAIN,
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: timing.pollingInterval,
            stepSize: timing.stepSize,
            requestTimeoutMs: timing.requestTimeoutMs,
          }),
        )
        .addParallel(
          (n) => (n as any).chainP,
          () => ({
            name: PAR,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: timing.pollingInterval,
            stepSize: timing.stepSize,
            requestTimeoutMs: timing.requestTimeoutMs,
            delayMs: 0,
            events: EVENTS,
          }),
        )
    )
    .buildPrimitives((b) =>
      b.addPrimitive(
        (sp) => (sp as any)[PAR],
        () => ({ name: "detEvt", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
      )
    )
    .build();
}

/** Sync a fresh database to TARGET under the given timing, then fingerprint it. */
async function syncUnder(
  timing: Timing,
  apiPort: number,
): Promise<ConsistencySnapshot> {
  const h: Harness = await setupHarness();
  try {
    TestChainControl.clear();
    TestChainControl.setTip(MAIN, TARGET);
    TestChainControl.setTip(PAR, PARALLEL_TIP);

    await h.runToHeight({
      events: [],
      // Keyed by THIS config's protocol names; a mismatch would leave the
      // synthetic chain on its wall-clock fallback tip and sync to "now".
      tips: { [MAIN]: TARGET, [PAR]: PARALLEL_TIP },
      target: TARGET,
      apiPort,
      config: buildConfig(timing),
    });

    // Bookkeeping tables legitimately differ by path (the page queue records
    // where a run happened to be), so compare observable state.
    return await dumpConsistencySnapshot(h.pool, {
      excludeTables: SYNC_BOOKKEEPING_TABLES,
    });
  } finally {
    await h.teardown();
  }
}

beforeEach(() => {
  TestChainControl.clear();
});
afterEach(() => {
  TestChainControl.clear();
});

test("state is identical regardless of polling speed, chunk size and timeouts", async () => {
  // Fast + fine-grained: many small fetches, tight deadline.
  const fast = await syncUnder(
    { pollingInterval: 5, stepSize: 5, requestTimeoutMs: 1_000 },
    19201,
  );

  // Slow + coarse: fewer, larger fetches, generous deadline. A different
  // machine under different load is somewhere between these two.
  const slow = await syncUnder(
    { pollingInterval: 60, stepSize: 100, requestTimeoutMs: 30_000 },
    19202,
  );

  const { diffs } = compareConsistencySnapshots(fast, slow);
  expect(diffs).toEqual([]);

  // Guard against the assertion passing vacuously on two empty databases.
  const rows = [...fast.values()].reduce((sum, f) => sum + f.rowCount, 0);
  expect(rows).toBeGreaterThan(0);
}, 180_000);

test("the block hash chain is identical across timings", async () => {
  const a = await syncUnder(
    { pollingInterval: 5, stepSize: 5, requestTimeoutMs: 1_000 },
    19203,
  );
  const b = await syncUnder(
    { pollingInterval: 60, stepSize: 100, requestTimeoutMs: 30_000 },
    19204,
  );

  // effectstream_blocks carries block_height + effectstream_block_hash, so an
  // identical fingerprint here means every block hashed the same on both runs —
  // the property consensus actually depends on. Called out separately from the
  // whole-database check so a failure points straight at the hash chain.
  const key = "effectstream.effectstream_blocks";
  expect(a.get(key)).toBeDefined();
  expect(a.get(key)!.rowCount).toBeGreaterThan(0);
  expect(b.get(key)?.fingerprint).toBe(a.get(key)!.fingerprint);
}, 180_000);

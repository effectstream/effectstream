/**
 * Sync liveness on `/health` (sync/CLAUDE.md Finding #6).
 *
 * `/health` used to report only `poolErrors.state()` — database reachability.
 * Every failure mode found in this investigation is invisible to that check:
 * a blackholed RPC, a producer whose stream ended, or simply one chain that
 * stopped advancing all end the same way — the merge blocks on that chain's
 * page and block production stops — while the database stays perfectly
 * healthy and `/health` keeps answering `200 {"status":"ok"}`.
 *
 * This test stalls the merge deterministically (a parallel chain pinned far
 * behind the main clock, the head-of-line case from `buffering.test.ts` 1b) and
 * asserts that `/health` now:
 *   - reports 503 with `status: "stalled"`,
 *   - names the protocol the merge is waiting on (`blockingMerge`),
 *   - and still reports the healthy chain as `ok`.
 *
 * The apply-lag threshold is driven by EFFECTSTREAM_LAG_THRESHOLD_MS so this
 * runs in seconds rather than the 20× block-time default.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { TestChainControl } from "@effectstream/sync";
import {
  type Harness,
  type RunningNode,
  setupHarness,
  sleep,
  TEST_PRIMITIVE_TYPE,
} from "./harness.ts";

const START_TIME = 1_700_000_000_000;
const BLOCK_TIME_MS = 1000;
const STEP_SIZE = 1000;

const MAIN = "healthMain";
const PAR_OK = "healthParallelOk";
const PAR_STALLED = "healthParallelStalled";

/** Main clock runs far ahead; the stalled chain is pinned just above genesis. */
const MAIN_TIP = 5_000;
const OK_TIP = 5_000;
const STALLED_TIP = 5;

/** Well below the time this test spends waiting, so "stalled" latches quickly. */
const LAG_THRESHOLD_MS = 2_000;

function buildConfig() {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-health"))
    .buildNetworks((b) =>
      b
        .addNetwork({
          name: "clock",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainOk",
          type: ConfigNetworkType.TEST,
          startTime: START_TIME,
          blockTimeMS: BLOCK_TIME_MS,
        })
        .addNetwork({
          name: "chainStalled",
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
            pollingInterval: 30,
            stepSize: STEP_SIZE,
          }),
        )
        .addParallel(
          (n) => (n as any).chainOk,
          () => ({
            name: PAR_OK,
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: STEP_SIZE,
            delayMs: 0,
            events: [],
          }),
        )
        .addParallel(
          (n) => (n as any).chainStalled,
          () => ({
            name: PAR_STALLED,
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
        (sp) => (sp as any)[PAR_OK],
        () => ({ name: "noEvtHealth", type: TEST_PRIMITIVE_TYPE, startBlockHeight: 1 }),
      )
    )
    .build();
}

type HealthProtocol = {
  name: string;
  status: string;
  blockingMerge: boolean;
  ownBlockNumber: number | null;
  consecutiveErrors: number;
  producerRestarts: number;
};
type HealthBody = {
  status: string;
  db: { sustained: boolean };
  apply: {
    blockHeight: number | null;
    sinceLastAppliedMs: number | null;
    lagMs: number | null;
  };
  protocols: HealthProtocol[];
};

async function getHealth(
  port: number,
): Promise<{ httpStatus: number; body: HealthBody }> {
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  return { httpStatus: res.status, body: (await res.json()) as HealthBody };
}

let h: Harness;
let node: RunningNode | undefined;

beforeEach(async () => {
  TestChainControl.clear();
  process.env.EFFECTSTREAM_LAG_THRESHOLD_MS = String(LAG_THRESHOLD_MS);
  h = await setupHarness();
});
afterEach(async () => {
  await node?.stop();
  node = undefined;
  delete process.env.EFFECTSTREAM_LAG_THRESHOLD_MS;
  await h?.teardown();
});

test("/health reports a stalled merge instead of a bare 'ok'", async () => {
  TestChainControl.setTip(MAIN, MAIN_TIP);
  TestChainControl.setTip(PAR_OK, OK_TIP);
  // Pinned far behind: once the root timestamp passes this chain's tip, the
  // merge blocks on its page and block production stops for good.
  TestChainControl.setTip(PAR_STALLED, STALLED_TIP);

  node = await h.runNode({ config: buildConfig(), apiPort: 19171 });

  // Let the node apply what it can, then sit past the lag threshold.
  await sleep(LAG_THRESHOLD_MS * 3);

  const { httpStatus, body } = await getHealth(node.apiPort);

  // The database is fine — this is exactly why the old db-only check passed.
  expect(body.db.sustained).toBe(false);

  // ...but the node has not applied a block in a long time. Measured in
  // wall-clock time since the last apply, not block-timestamp lag: the
  // synthetic chain's blocks are dated 2023, and a node replaying history is
  // legitimately far behind in block time while being perfectly healthy.
  expect(body.status).toBe("stalled");
  expect(httpStatus).toBe(503);
  expect(body.apply.sinceLastAppliedMs).toBeGreaterThan(LAG_THRESHOLD_MS);

  // The report must name WHICH chain is holding up the merge, otherwise an
  // operator has a stalled node and no idea where to look.
  const stalled = body.protocols.find((p) => p.name === PAR_STALLED);
  expect(stalled).toBeDefined();
  expect(stalled!.blockingMerge).toBe(true);

  // The healthy chains are still reported healthy — "stalled" is a property of
  // the pipeline, not of every protocol in it.
  const ok = body.protocols.find((p) => p.name === PAR_OK);
  expect(ok).toBeDefined();
  expect(ok!.blockingMerge).toBe(false);
  expect(ok!.consecutiveErrors).toBe(0);
}, 120_000);

test("/health reports ok while blocks are flowing", async () => {
  // All chains advancing: the merge is never gated, blocks keep applying.
  TestChainControl.setTip(MAIN, MAIN_TIP);
  TestChainControl.setTip(PAR_OK, OK_TIP);
  TestChainControl.setTip(PAR_STALLED, OK_TIP);

  node = await h.runNode({ config: buildConfig(), apiPort: 19172 });

  // Poll: the node needs a moment to apply its first block, and once it does
  // the status must be ok (not merely "not stalled").
  let body: HealthBody | undefined;
  let httpStatus = 0;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    ({ httpStatus, body } = await getHealth(node.apiPort));
    if (body.status === "ok") break;
    await sleep(100);
  }

  expect(body!.status).toBe("ok");
  expect(httpStatus).toBe(200);
  expect(body!.apply.blockHeight).toBeGreaterThan(0);
  for (const p of body!.protocols) {
    expect(p.consecutiveErrors).toBe(0);
    expect(p.producerRestarts).toBe(0);
  }
}, 120_000);

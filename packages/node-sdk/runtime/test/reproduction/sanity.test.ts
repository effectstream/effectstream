/**
 * Sanity end-to-end test for the synthetic `test` chain (no fixes required).
 *
 * Proves the foundation this PR adds works: a TEST_MAIN clock + a TEST_PARALLEL
 * chain sync through the real runtime (`start()` + PGLite), a config-declared
 * event is processed into `effectstream.primitive_accounting`, and committed
 * state survives a restart.
 *
 * (The buffering / resume / fast-catchup reproduction tests land alongside their
 * fixes in follow-up PRs — they assert behaviour that only those fixes provide.)
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { TestChainControl } from "@effectstream/sync";
import {
  countEventRows,
  type Harness,
  latestFinalizedHeight,
  setupHarness,
  TEST_PRIMITIVE_TYPE,
  waitForHeight,
  waitUntilStable,
} from "./harness.ts";

const START_TIME = 1_700_000_000_000;
const BLOCK_TIME_MS = 1000;

function buildConfig() {
  return new ConfigBuilder()
    .setNamespace((b) => b.setSecurityNamespace("sync-sanity"))
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
            name: "mainClock",
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: 1000,
          }),
        )
        .addParallel(
          (n) => (n as any).chainP,
          () => ({
            name: "parallelP",
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 30,
            stepSize: 1000,
            delayMs: 0,
            events: [{ atBlock: 50, payload: { marker: "evt50" } }],
          }),
        )
    )
    .buildPrimitives((b) =>
      b.addPrimitive(
        (sp) => (sp as any).parallelP,
        () => ({
          name: "testEvt",
          type: TEST_PRIMITIVE_TYPE,
          startBlockHeight: 1,
        }),
      )
    )
    .build();
}

let h: Harness;

beforeAll(async () => {
  h = await setupHarness();
});

afterAll(async () => {
  await h?.teardown();
});

test("test chain syncs, processes a configured event, and survives restart", async () => {
  // Parallel tip (200) stays ahead of the main clock (100) so the merge is not
  // gated at the chunk boundary.
  TestChainControl.setTip("mainClock", 100);
  TestChainControl.setTip("parallelP", 200);

  const n1 = await h.runNode({ config: buildConfig(), apiPort: 19131 });
  await waitForHeight(n1, h.pool, 100);
  await waitUntilStable(n1, h.pool);

  expect(await latestFinalizedHeight(h.pool)).toBe(100);
  // The event declared at block 50 was processed into primitive_accounting.
  expect(await countEventRows(h.pool, "evt50")).toBe(1);
  await n1.stop();

  // Restart: committed state must persist (chain already fully caught up).
  await h.simulateRestart();
  TestChainControl.setTip("mainClock", 100);
  TestChainControl.setTip("parallelP", 200);

  const n2 = await h.runNode({ config: buildConfig(), apiPort: 19132 });
  await waitUntilStable(n2, h.pool);

  expect(await latestFinalizedHeight(h.pool)).toBe(100);
  expect(await countEventRows(h.pool, "evt50")).toBe(1);
  await n2.stop();
}, 60_000);

/**
 * Sanity end-to-end test for the synthetic `test` chain (no fixes required).
 *
 * Proves the foundation this PR adds works: a TEST_MAIN clock + a TEST_PARALLEL
 * chain sync through the real runtime (`start()`), a config-declared event is
 * processed into `effectstream.primitive_accounting`, and committed state
 * survives a restart.
 *
 * Runs on whichever backend `setupHarness` picks: the default in-memory PGLite
 * (no external dependency) or real Postgres when `PGLITE=false`. Either way
 * each node runs in its own subprocess (see harness.ts / node-runner.ts), so a
 * restart is a genuine new OS process booting against the same database.
 *
 * (The buffering / resume / fast-catchup reproduction tests land alongside their
 * fixes in follow-up PRs — they assert behaviour that only those fixes provide.)
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  countEventRows,
  type Harness,
  latestFinalizedHeight,
  setupHarness,
} from "./harness.ts";

let h: Harness;

beforeAll(async () => {
  h = await setupHarness();
});

afterAll(async () => {
  await h?.teardown();
});

test("test chain syncs, processes a configured event, and survives restart", async () => {
  const events = [{ atBlock: 50, marker: "evt50" }];

  // Parallel tip (200) stays ahead of the main clock (100) so the merge is not
  // gated at the chunk boundary.
  await h.runToHeight({
    events,
    tips: { mainClock: 100, parallelP: 200 },
    target: 100,
    apiPort: 19131,
  });

  const height1 = await latestFinalizedHeight(h.pool);
  const events1 = await countEventRows(h.pool, "evt50");
  console.log(
    `[sanity] after sync:    height ${height1} (expect 100), ` +
      `evt50 rows ${events1} (expect 1)`,
  );
  expect(height1).toBe(100);
  // The event declared at block 50 was processed into primitive_accounting.
  expect(events1).toBe(1);

  // Restart: a new process boots against the same database. Committed state must
  // persist; the chain is already fully caught up, so nothing new is produced.
  await h.runToHeight({
    events,
    tips: { mainClock: 100, parallelP: 200 },
    target: 100,
    apiPort: 19132,
  });

  const height2 = await latestFinalizedHeight(h.pool);
  const events2 = await countEventRows(h.pool, "evt50");
  console.log(
    `[sanity] after restart: height ${height2} (expect 100, was ${height1}), ` +
      `evt50 rows ${events2} (expect 1, was ${events1})`,
  );
  expect(height2).toBe(100);
  expect(events2).toBe(1);
}, 60_000);

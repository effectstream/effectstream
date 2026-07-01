/**
 * Regression test: a thrown error from `updateState`, `producerChannel.send`,
 * or the merge step must not crash the node — it should log, retry, and the
 * sync loop must still reach its target height. This mirrors the design
 * already documented for `stateToInput`/`readData` in
 * packages/node-sdk/sync/CLAUDE.md ("Errors are swallowed via tryYield ...").
 *
 * Before this fix, none of these three call sites were wrapped: an error
 * there propagated out of the spawned effection task and the `run()` root in
 * node-runner.ts rejected (see its `bootErr` handling), so the node subprocess
 * exited non-zero and `runToHeight` below would have rejected instead of
 * resolving.
 *
 * Fault injection is one-shot and deterministic (see
 * packages/node-sdk/sync/src/sync-protocols/test/control.ts): the very first
 * call to the given stage for the given protocol throws; every later call
 * succeeds — so each test proves both "the failure really happened" (the loop
 * has to recover) and "the loop still finishes" (it did recover).
 *
 * Each scenario gets its own fresh harness/database rather than sharing one:
 * a second run against an already-synced database might resume with nothing
 * left to fetch, never touching the faulty call site, and pass vacuously.
 */
import { expect, test } from "bun:test";
import { latestFinalizedHeight, setupHarness } from "./harness.ts";

test("a one-shot updateState failure is logged and retried, not fatal", async () => {
  const h = await setupHarness();
  try {
    await h.runToHeight({
      events: [],
      tips: { mainClock: 50, parallelP: 200 },
      target: 50,
      apiPort: 19141,
      faults: [{ protocol: "mainClock", stage: "updateState", times: 1 }],
    });
    expect(await latestFinalizedHeight(h.pool)).toBe(50);
  } finally {
    await h.teardown();
  }
}, 30_000);

test("a one-shot producerChannel.send failure is logged and retried, not fatal", async () => {
  const h = await setupHarness();
  try {
    await h.runToHeight({
      events: [],
      tips: { mainClock: 50, parallelP: 200 },
      target: 50,
      apiPort: 19142,
      faults: [{ protocol: "parallelP", stage: "producerChannel", times: 1 }],
    });
    expect(await latestFinalizedHeight(h.pool)).toBe(50);
  } finally {
    await h.teardown();
  }
}, 30_000);

test("a one-shot merge failure discards the candidate block and retries, not fatal", async () => {
  const h = await setupHarness();
  try {
    await h.runToHeight({
      events: [],
      tips: { mainClock: 50, parallelP: 200 },
      target: 50,
      apiPort: 19143,
      faults: [{ protocol: "mainClock", stage: "merge", times: 1 }],
    });
    expect(await latestFinalizedHeight(h.pool)).toBe(50);
  } finally {
    await h.teardown();
  }
}, 30_000);

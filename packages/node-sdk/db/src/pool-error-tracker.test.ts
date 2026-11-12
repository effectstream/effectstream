import { expect, test } from "bun:test";
import { PoolErrorTracker } from "./pool-error-tracker.ts";

const transient = () => ({
  code: "ECONNRESET",
  message: "Client network socket disconnected before secure TLS connection",
  stack: "    at node_modules/pg-pool/index.js:45:11",
});

// A clock moved only by the test. It starts away from 0 because the tracker
// uses firstFailureAt = 0 to mean "no failure recorded".
function manualClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

// The tracker queues its exit with setImmediate while logging. An immediate
// queued afterwards runs after it, so awaiting one observes any exit the
// preceding log() call scheduled.
const nextImmediate = () => new Promise<void>((resolve) => setImmediate(resolve));

test("ignores non-transient errors (auth/schema bugs)", () => {
  const t = new PoolErrorTracker();
  t.log(new Error("column foo does not exist"), ["sync-write"]);
  expect(t.state().consecutive).toBe(0);
  expect(t.state().sustained).toBe(false);
});

test("counts consecutive transient failures and reports sustained at the threshold", async () => {
  const clock = manualClock();
  const exits: number[] = [];
  // Thresholds differ from the defaults, so a tracker that ignored them fails.
  const t = new PoolErrorTracker({
    sustainedMs: 200,
    fatalMs: 1_000,
    now: clock.now,
    exit: (code) => exits.push(code),
  });

  t.log(transient(), ["sync-write"]);
  expect(t.state()).toEqual({
    consecutive: 1,
    firstFailureAt: 1_000_000,
    sustainedDurationMs: 0,
    sustained: false,
  });

  clock.advance(199);
  t.log(transient(), ["sync-write"]);
  expect(t.state()).toEqual({
    consecutive: 2,
    firstFailureAt: 1_000_000,
    sustainedDurationMs: 199,
    sustained: false,
  });

  clock.advance(1);
  expect(t.state().sustained).toBe(true);
  t.log(transient(), ["sync-write"]);
  expect(t.state()).toEqual({
    consecutive: 3,
    firstFailureAt: 1_000_000,
    sustainedDurationMs: 200,
    sustained: true,
  });
  await nextImmediate();
  expect(exits).toEqual([]);
});

test("markHealthy resets the failure clock", async () => {
  // A recording exit keeps an exit regression from ending the test process.
  const exits: number[] = [];
  const t = new PoolErrorTracker({ exit: (code) => exits.push(code) });
  t.log(transient(), ["sync-write"]);
  t.markHealthy();
  const s = t.state();
  expect(s.consecutive).toBe(0);
  expect(s.firstFailureAt).toBe(0);
  expect(s.sustained).toBe(false);
  await nextImmediate();
  expect(exits).toEqual([]);
});

test("exits with code 1 on the tick after a failure reaches the fatal threshold", async () => {
  const clock = manualClock();
  const exits: number[] = [];
  const t = new PoolErrorTracker({
    sustainedMs: 200,
    fatalMs: 1_000,
    now: clock.now,
    exit: (code) => exits.push(code),
  });

  t.log(transient(), ["sync-write"]);
  await nextImmediate();
  expect(exits).toEqual([]);

  clock.advance(999);
  t.log(transient(), ["sync-write"]);
  await nextImmediate();
  expect(exits).toEqual([]);

  clock.advance(1);
  t.log(transient(), ["sync-write"]);
  // Deferred, so the fatal log line can flush before the process ends.
  expect(exits).toEqual([]);
  await nextImmediate();
  expect(exits).toEqual([1]);
});

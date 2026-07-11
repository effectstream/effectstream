import { afterEach, expect, test } from "bun:test";

// Thresholds are read from env at module load (and `envMs` rejects 0, so use
// small positive values). SUSTAINED=5ms → a failure older than 5ms is
// "sustained"; FATAL=30ms → older than 30ms triggers the process.exit
// escalation. Dynamic import so these are picked up before the module
// computes its constants.
process.env.POOL_SUSTAINED_THRESHOLD_MS = "5";
process.env.POOL_FATAL_THRESHOLD_MS = "30";
const { PoolErrorTracker } = await import("./pool-error-tracker.ts");

const transient = () => ({
  code: "ECONNRESET",
  message: "Client network socket disconnected before secure TLS connection",
  stack: "    at node_modules/pg-pool/index.js:45:11",
});

const realExit = process.exit;
afterEach(() => {
  process.exit = realExit;
});

test("ignores non-transient errors (auth/schema bugs)", () => {
  const t = new PoolErrorTracker();
  t.log(new Error("column foo does not exist"), ["sync-write"]);
  expect(t.state().consecutive).toBe(0);
  expect(t.state().sustained).toBe(false);
});

test("counts consecutive transient failures and reports sustained", async () => {
  const t = new PoolErrorTracker();
  t.log(transient(), ["sync-write"]);
  expect(t.state().sustained).toBe(false); // fresh failure, < 5ms old
  await Bun.sleep(15); // exceed SUSTAINED_THRESHOLD_MS=5, stay under FATAL=30
  t.log(transient(), ["sync-write"]);
  const s = t.state();
  expect(s.consecutive).toBe(2);
  expect(s.sustained).toBe(true);
});

test("markHealthy resets the failure clock", () => {
  const t = new PoolErrorTracker();
  t.log(transient(), ["sync-write"]);
  t.markHealthy();
  const s = t.state();
  expect(s.consecutive).toBe(0);
  expect(s.firstFailureAt).toBe(0);
  expect(s.sustained).toBe(false);
});

test("exits the process once failures persist past the fatal threshold", async () => {
  let exitCode: number | undefined;
  process.exit = ((code?: number) => {
    exitCode = code;
  }) as typeof process.exit;

  const t = new PoolErrorTracker();
  t.log(transient(), ["sync-write"]); // starts the clock; not yet fatal
  await Bun.sleep(40); // exceed FATAL_THRESHOLD_MS=20
  t.log(transient(), ["sync-write"]); // now duration >= fatal → schedules exit

  // exit is deferred via setImmediate so the fatal log line can flush first.
  await new Promise((resolve) => setImmediate(resolve));
  expect(exitCode).toBe(1);
});

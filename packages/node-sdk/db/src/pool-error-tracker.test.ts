import { expect, test } from "bun:test";
import { PoolErrorTracker } from "./pool-error-tracker.ts";

// The tracker reads its thresholds from the environment once, at module load.
// Any earlier import in the same test process (pg-connection.ts imports it)
// fixes them at the defaults, so the threshold scenarios run in a child
// process that loads the module with the environment set below.
const scenarioScript = new URL(
  "../test/fixtures/pool-error-tracker/scenario.ts",
  import.meta.url,
).pathname;

async function runScenario(
  scenario: "sustained" | "fatal",
  gapMs: number,
  thresholds: { sustainedMs: number; fatalMs: number },
) {
  const child = Bun.spawn([process.execPath, scenarioScript, scenario, String(gapMs)], {
    env: {
      ...process.env,
      POOL_SUSTAINED_THRESHOLD_MS: String(thresholds.sustainedMs),
      POOL_FATAL_THRESHOLD_MS: String(thresholds.fatalMs),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, exitCode, output: `${stdout}\n${stderr}` };
}

const transient = () => ({
  code: "ECONNRESET",
  message: "Client network socket disconnected before secure TLS connection",
  stack: "    at node_modules/pg-pool/index.js:45:11",
});

test("ignores non-transient errors (auth/schema bugs)", () => {
  const t = new PoolErrorTracker();
  t.log(new Error("column foo does not exist"), ["sync-write"]);
  expect(t.state().consecutive).toBe(0);
  expect(t.state().sustained).toBe(false);
});

test("counts consecutive transient failures and reports sustained", async () => {
  // The fatal threshold is far out of reach, so only the sustained threshold
  // can change the outcome.
  const { stdout, exitCode, output } = await runScenario("sustained", 300, {
    sustainedMs: 200,
    fatalMs: 600_000,
  });
  expect(exitCode, output).toBe(0);
  const line = stdout.split("\n").find((l) => l.startsWith("POOL_TRACKER_STATES "));
  expect(line, output).toBeDefined();
  const { fresh, later } = JSON.parse(line!.slice("POOL_TRACKER_STATES ".length));
  expect(fresh.consecutive).toBe(1);
  expect(fresh.sustained).toBe(false); // younger than the 200 ms threshold
  expect(later.consecutive).toBe(2);
  expect(later.sustained).toBe(true); // first failure is at least 300 ms old
}, 30_000);

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
  const { exitCode, output } = await runScenario("fatal", 200, {
    sustainedMs: 50,
    fatalMs: 100,
  });
  // A fresh failure must not exit; the one 200 ms later must.
  expect(output).toContain("POOL_TRACKER_FIRST_FAILURE_LOGGED");
  expect(output).toContain("POOL_TRACKER_SECOND_FAILURE_LOGGED");
  expect(output).not.toContain("POOL_TRACKER_STILL_RUNNING");
  expect(exitCode, output).toBe(1);
}, 30_000);

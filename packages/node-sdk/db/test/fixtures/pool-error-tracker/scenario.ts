// Runs one PoolErrorTracker scenario in a process of its own. The tracker reads
// POOL_SUSTAINED_THRESHOLD_MS and POOL_FATAL_THRESHOLD_MS once, when its module
// loads, so the parent sets them in this process's environment before spawning.
import { PoolErrorTracker } from "../../../src/pool-error-tracker.ts";

const transient = () => ({
  code: "ECONNRESET",
  message: "Client network socket disconnected before secure TLS connection",
  stack: "    at node_modules/pg-pool/index.js:45:11",
});

const [scenario, gapArg] = process.argv.slice(2);
const gapMs = Number(gapArg);
const tracker = new PoolErrorTracker();

switch (scenario) {
  case "sustained": {
    tracker.log(transient(), ["sync-write"]);
    const fresh = tracker.state();
    await Bun.sleep(gapMs);
    tracker.log(transient(), ["sync-write"]);
    const later = tracker.state();
    console.info(`POOL_TRACKER_STATES ${JSON.stringify({ fresh, later })}`);
    break;
  }
  case "fatal": {
    tracker.log(transient(), ["sync-write"]);
    console.info("POOL_TRACKER_FIRST_FAILURE_LOGGED");
    await Bun.sleep(gapMs);
    tracker.log(transient(), ["sync-write"]);
    console.info("POOL_TRACKER_SECOND_FAILURE_LOGGED");
    // The tracker defers process.exit(1) to a setImmediate queued before this
    // one, so reaching the line below means it did not exit.
    await new Promise((resolve) => setImmediate(resolve));
    console.info("POOL_TRACKER_STILL_RUNNING");
    break;
  }
  default:
    throw new Error(`unknown pool tracker scenario: ${scenario}`);
}

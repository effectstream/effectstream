import assert from "node:assert/strict";
import { mock } from "bun:test";
import { run } from "effection";

const scenario = process.argv[2];
process.env.MQTT_BROKER = scenario === "disabled" ? "false" : "true";

const startupError = new Error("startup after broker failed");
const brokerStartError = new Error("broker start failed");
const brokerShutdownError = new Error("broker shutdown failed");
let brokerConstructed = 0;
let brokerStarts = 0;
let brokerShutdowns = 0;
let poolEnds = 0;

mock.module("@effectstream/event-server", () => ({
  EventBroker: class {
    constructor() {
      brokerConstructed++;
    }
    async start() {
      brokerStarts++;
      if (scenario === "start-failure") throw brokerStartError;
    }
    async shutdown() {
      brokerShutdowns++;
      if (scenario === "shutdown-failure") throw brokerShutdownError;
    }
  },
}));

const dbConn = {
  async end() {
    poolEnds++;
  },
};
const actualDb = await import("@effectstream/db");
mock.module("@effectstream/db", () => ({
  ...actualDb,
  getConnection: () => dbConn,
}));
const actualDbVersion = await import("@effectstream/db/version");
mock.module("@effectstream/db/version", () => ({
  ...actualDbVersion,
  getVersionInfo: function* () {
    throw startupError;
  },
  getLastBlockHeight: function* () {
    return 0;
  },
}));
const actualSync = await import("@effectstream/sync");
mock.module("@effectstream/sync", () => ({
  ...actualSync,
  genSyncProtocols: function* () {
    assert.fail("sync workers must not be constructed after startup failure");
  },
}));

const { start } = await import("../src/main.ts");

const result = await Promise.resolve(run(function* () {
  yield* start({
    appName: "runtime-broker-test",
    appVersion: "1.0.0",
    syncInfo: [],
    events: false,
  });
})).then(
  () => ({ ok: true as const }),
  (error) => ({ ok: false as const, error }),
);

assert.equal(result.ok, false);
if (scenario === "disabled") {
  assert.equal((result as any).error, startupError);
  assert.equal(brokerConstructed, 0);
  assert.equal(brokerStarts, 0);
  assert.equal(brokerShutdowns, 0);
} else if (scenario === "start-failure") {
  assert.equal((result as any).error, brokerStartError);
  assert.equal(brokerConstructed, 1);
  assert.equal(brokerStarts, 1);
  assert.equal(brokerShutdowns, 0);
} else if (scenario === "startup-failure") {
  assert.equal((result as any).error, startupError);
  assert.equal(brokerConstructed, 1);
  assert.equal(brokerStarts, 1);
  assert.equal(brokerShutdowns, 1);
} else if (scenario === "shutdown-failure") {
  assert.equal((result as any).error, brokerShutdownError);
  assert.equal(brokerConstructed, 1);
  assert.equal(brokerStarts, 1);
  assert.equal(brokerShutdowns, 1);
} else {
  assert.fail(`Unknown runtime broker scenario: ${scenario}`);
}
assert.equal(poolEnds, 1);
console.log("ok");

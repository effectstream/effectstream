import { beforeEach, expect, mock, test } from "bun:test";
import { run, suspend } from "effection";

let mode: "normal" | "start-failure" | "shutdown-failure" = "normal";
let starts = 0;
let shutdowns = 0;
const startError = new Error("telemetry start failed");
const shutdownError = new Error("telemetry shutdown failed");

mock.module("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start() {
      starts++;
      if (mode === "start-failure") throw startError;
    }

    async shutdown() {
      shutdowns++;
      if (mode === "shutdown-failure") throw shutdownError;
    }
  },
}));

const { initTelemetry } = await import("../src/telemetry.ts");

beforeEach(() => {
  mode = "normal";
  starts = 0;
  shutdowns = 0;
});

test("natural scope completion shuts telemetry down", async () => {
  await run(function* () {
    yield* initTelemetry();
  });
  expect(starts).toBe(1);
  expect(shutdowns).toBe(1);
});

test("halt shuts telemetry down before settling", async () => {
  const task = run(function* () {
    yield* initTelemetry();
    yield* suspend();
  });
  void task.catch(() => {});
  await task.halt();
  expect(starts).toBe(1);
  expect(shutdowns).toBe(1);
});

test("shutdown was registered before telemetry start", async () => {
  mode = "start-failure";
  await expect(Promise.resolve(run(function* () {
    yield* initTelemetry();
  }))).rejects.toBe(startError);
  expect(starts).toBe(1);
  expect(shutdowns).toBe(1);
});

test("telemetry shutdown rejection is structural", async () => {
  mode = "shutdown-failure";
  await expect(Promise.resolve(run(function* () {
    yield* initTelemetry();
  }))).rejects.toBe(shutdownError);
  expect(starts).toBe(1);
  expect(shutdowns).toBe(1);
});

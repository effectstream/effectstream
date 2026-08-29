/**
 * Subprocess fixture for the telemetry lifecycle reproductions (spec 00031, G4).
 *
 * `init()` installs OpenTelemetry auto-instrumentation, which monkey-patches
 * `http`, `pg` and friends process-wide. Running it inside the shared `bun test`
 * process would leak that patching into every other suite, so each scenario gets
 * its own process and communicates through stdout markers.
 *
 * Usage: `bun telemetry-lifecycle.ts <observe|failing-shutdown>`
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ensure, run, suspend } from "effection";
import { init } from "../../../src/main.ts";

const mode = process.argv[2] ?? "observe";

const realShutdown = NodeSDK.prototype.shutdown;
NodeSDK.prototype.shutdown = function (this: NodeSDK): Promise<void> {
  console.log("TELEMETRY_SHUTDOWN");
  if (mode === "failing-shutdown") {
    return Promise.reject(new Error("telemetry-shutdown-boom"));
  }
  return realShutdown.call(this);
};

const realConsoleError = console.error;
console.error = (...args: unknown[]) => {
  realConsoleError(...args);
  const rendered = args.map((arg) =>
    arg instanceof Error ? arg.message : String(arg)
  ).join(" ");
  if (rendered.includes("telemetry-shutdown-boom")) {
    console.log("TELEMETRY_SHUTDOWN_REPORTED");
  }
};

const task = run(function* () {
  yield* init();
  // Stands in for every resource the runtime acquires after init(): broker,
  // HTTP, database, child tasks. Registered later, so it must tear down first.
  yield* ensure(function* () {
    console.log("SIBLING_CLEANUP");
  });
  yield* suspend();
});

const outcome = await task.halt().then(
  () => "ok",
  (error: unknown) => `err:${error instanceof Error ? error.message : String(error)}`,
);
console.log(`HALT_SETTLED:${outcome}`);

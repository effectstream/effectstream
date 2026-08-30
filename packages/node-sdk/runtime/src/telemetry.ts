import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import opentelemetry from "@opentelemetry/api";
import { defaultOtelSetup, PaimaTelemetryContext } from "@effectstream/log";
import { call, ensure, type Operation } from "effection";
import fs from "node:fs";
import path from "node:path";
import { parse } from "jsonc-parser";

// TODO: this is hacky, but there is no proper way to do this unfortunately
// We're blocked by any of the following
// 1. Allowing `type: jsonc` imports: https://github.com/denoland/deno/issues/20374#issuecomment-2543118482
// 2. Allowing `type: tesxt` imports: https://github.com/denoland/deno/issues/25354
const version = "0.3.0";
// 3. import.meta.dirname is undefined when loaded as a jsr package
// const DenoConfig = parse(fs.readFileSync(
//   path.resolve(import.meta.dirname!, "../", "./deno.json"),
//   "utf-8",
// ));

export function* initTelemetry(): Operation<void> {
  const sdk = new NodeSDK({
    ...defaultOtelSetup("effectstream-node", version), // DenoConfig.version),
    // TODO: set OTEL_EXPORTER_OTLP_PROTOCOL to json for @effectstream/collector support until it supports protobuf
    instrumentations: [getNodeAutoInstrumentations()],
  });

  const tracer = opentelemetry.trace.getTracer("paima", version); // DenoConfig.version);
  yield* PaimaTelemetryContext.set(
    {
      tracer,
      span: undefined,
    },
  );

  sdk.start();

  // `initTelemetry` is delegated with `yield*`, so this registers in the
  // caller's scope: telemetry lives exactly as long as whoever called `init()`,
  // and — being the first thing that scope acquires — is released last, after
  // the broker, HTTP server, database and child tasks it instruments.
  //
  // The SDK owns a periodic metric reader plus batch span/log processors; left
  // running they keep exporting (and holding timers) past the lifetime of the
  // node that created them.
  let stopped = false;
  yield* ensure(function* () {
    // A re-entrant unwind must not shut the same SDK down twice: OpenTelemetry
    // rejects the second call rather than treating it as a no-op.
    if (stopped) return;
    stopped = true;
    try {
      yield* call(() => sdk.shutdown());
    } catch (error) {
      // Reported, never fatal. `shutdown()` also rejects when the collector is
      // simply unreachable, and a lost telemetry flush must not turn an
      // otherwise clean runtime shutdown into a failed one — every resource
      // that matters (broker, HTTP, database, child tasks) has already been
      // released by the time this runs.
      console.error("OpenTelemetry shutdown failed:", error);
    }
  });
}

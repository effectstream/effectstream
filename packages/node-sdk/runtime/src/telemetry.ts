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

  // Register ownership before any subsequent initialization can fail. The
  // ensure belongs to the caller's Effection scope and therefore runs on
  // natural return, failure, or halt.
  yield* ensure(function* () {
    yield* call(() => sdk.shutdown());
  });

  const tracer = opentelemetry.trace.getTracer("paima", version); // DenoConfig.version);
  yield* PaimaTelemetryContext.set(
    {
      tracer,
      span: undefined,
    },
  );

  sdk.start();
}

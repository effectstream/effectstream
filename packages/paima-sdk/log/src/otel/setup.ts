// careful: only include opentelemetry libs that work in the browser too
import type opentelemetry from "@opentelemetry/api";
import { createContext, type Operation } from "effection";
import { type IResource, Resource } from "@opentelemetry/resources";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
  BatchLogRecordProcessor,
  type LogRecordProcessor,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { MetricReader } from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { env } from "node:process";

/**
 * Note: this is based on `NodeSDKConfiguration`.
 *       We just don't want to include a nodejs dependency here
 */
type DefaultOtelSetup = {
  resource: IResource;
  logRecordProcessors: LogRecordProcessor[];
  metricReader: MetricReader;
  spanProcessors?: SpanProcessor[];
};
export function defaultOtelSetup(
  name: string,
  version: string,
): DefaultOtelSetup {
  const collectorOptions = {
    // override default on dev builds so no logs disappear
    concurrencyLimit: env.NODE_ENV === "development"
      ? Number.MAX_SAFE_INTEGER
      : undefined,
  } as const;

  const baseLog = new OTLPLogExporter(collectorOptions);
  const logProcessor = env.NODE_ENV === "development"
    ? new SimpleLogRecordProcessor(baseLog)
    : new BatchLogRecordProcessor(baseLog);

  const baseTrace = new OTLPTraceExporter(collectorOptions);
  const spanProcessor = env.NODE_ENV === "development"
    ? new SimpleSpanProcessor(baseTrace)
    : new BatchSpanProcessor(baseTrace);

  return {
    resource: Resource.default().merge(
      new Resource({
        [ATTR_SERVICE_NAME]: name,
        [ATTR_SERVICE_VERSION]: version,
      }),
    ),
    spanProcessors: [spanProcessor],
    logRecordProcessors: [logProcessor],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(collectorOptions),
    }),
  };
}

type TelemetryContext = {
  tracer: opentelemetry.Tracer;
  span: undefined | opentelemetry.Span;
};
export const PaimaTelemetryContext = createContext<TelemetryContext>(
  "paima:telemetry",
);

export function* useTelemetryContext(): Operation<TelemetryContext> {
  const otel = yield* PaimaTelemetryContext.get();
  if (!otel) {
    throw new Error("Paima telemetry is not initialized");
  }
  return otel;
}
export function* withSpan<T>(
  name: string,
  continuation: () => Operation<T>,
): Operation<T> {
  const otel = yield* useTelemetryContext();
  return yield* otel.tracer.startActiveSpan(
    name,
    function* (span: opentelemetry.Span) {
      yield* PaimaTelemetryContext.set(
        {
          tracer: otel.tracer,
          span,
        },
      );
      return yield* continuation();
    },
  );
}

import fastify from "fastify";
import {
  type IInstrumentationScope,
  type ILogRecord,
  TExportLogsServiceRequest,
  TExportMetricsServiceRequest,
  TExportTraceServiceRequest,
} from "./typebox.ts";
import { Value } from "@sinclair/typebox/value";
import { otelStringify, parseFixed64 } from "./parse.ts";
import {
  ComponentNames,
  log as logger,
  type Namespace,
  SeverityNumber,
} from "@paima/log";

// this file is based on https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

// TODO: maybe this should run on a different port and then forward to 4318
const PORT = 4318; // default port for OTLP HTTP traces

const server = fastify();

function printError(e: any, namespace: string, request: any) {
  let requestBody;
  try {
    requestBody = JSON.stringify(request.body, null, 2);
  } catch (e) {
    requestBody = "";
  }
  logger.local(
    ComponentNames.COLLECTOR,
    [namespace],
    SeverityNumber.ERROR,
    (log) => log(e, requestBody),
  );
}

// DANGER: these endpoints only support JSON and reject other OpenTelemetry data formats
//         in the future, we can support protobuf using `otlp-transformer` once it has a stable release

server.post("/v1/traces", async (request: any, reply: any) => {
  try {
    const parsed = Value.Parse(TExportTraceServiceRequest, request.body);
    // TODO: do we want to print traces?
    for (const log of parsed.resourceSpans ?? []) {
      for (const scopeSpans of log.scopeSpans) {
        const { scope } = scopeSpans;
        if (scope == null || scope.name == null) {
          continue;
        }
        for (const span of scopeSpans.spans ?? []) {
          const start = Temporal.Instant.fromEpochMilliseconds(
            Number(parseFixed64(span.startTimeUnixNano) / 1_000_000n),
          );
          const end = Temporal.Instant.fromEpochMilliseconds(
            Number(parseFixed64(span.endTimeUnixNano) / 1_000_000n),
          );
          const duration = start.until(end);
          const seconds = duration.total("seconds");
          logger.local(
            scope.name,
            [span.name],
            SeverityNumber.DEBUG,
            // toFixed(3) means we can display up to ms precision
            // adding more tends to lead to outputs like 0.30000000000000004
            (log) => log(`ended (${seconds.toFixed(3)}s)`),
          );
        }
      }
    }
  } catch (e) {
    printError(e, "/v1/traces", request);
    throw e;
  }
  // TODO: proper response
  reply.status(200).send("Traces received");
});

server.post("/v1/metrics", async (request: any, reply: any) => {
  try {
    // TODO: do we want to print metrics?
    const parsed = Value.Parse(TExportMetricsServiceRequest, request.body);
    for (const metric of parsed.resourceMetrics ?? []) {
      for (const scopeMetric of metric.scopeMetrics) {
        const scope = scopeMetric.scope;
        if (scope == null || scope.name == null) {
          continue;
        }
        for (const metric of scopeMetric.metrics) {
          // trying to figure out how to print all of these to console is non-trivial
          // especially since a lot of it is very metric-specific like parsing attributes
          logger.local(
            scope.name,
            [metric.name],
            SeverityNumber.TRACE,
            (log) => log("updated"),
          );
        }
      }
    }
  } catch (e) {
    printError(e, "/v1/metrics", request);
    throw e;
  }
  // TODO: proper response
  reply.status(200).send("Metrics received");
});

server.post("/v1/logs", async (request: any, reply: any) => {
  try {
    const parsed = Value.Parse(TExportLogsServiceRequest, request.body);
    for (const log of parsed.resourceLogs ?? []) {
      for (const scopeLog of log.scopeLogs) {
        const scope = scopeLog.scope;
        if (scope == null || scope.name == null) {
          continue;
        }
        for (const logRecord of scopeLog.logRecords ?? []) {
          if (scope.name.startsWith("dolos")) {
            const parts = handleDolos(scope, logRecord);
            if (parts == null) {
              continue;
            }
            logger.local(
              parts.component,
              parts.namespace,
              parts.level,
              (log) => log(...parts.message),
            );
            return;
          }
          // TODO: replace the `tslog` timestamp with timeUnixNano
          const namespace = (() => {
            const attrNamespace = logRecord.attributes.find((a) =>
              a.key === "namespace"
            )?.value;
            if (attrNamespace == null) {
              return [];
            }
            return JSON.parse(otelStringify(attrNamespace));
          })();
          logger.local(
            scope.name,
            namespace,
            (logRecord.severityNumber as unknown as SeverityNumber) ??
              SeverityNumber.UNSPECIFIED,
            (log) => {
              const target = JSON.parse(otelStringify(logRecord.body));
              // console.log(2,4) gets turned into an array [2,4] so we re-spread it)
              return Array.isArray(target) ? log(...target) : log(target);
            },
          );
        }
      }
    }
  } catch (e) {
    printError(e, "/v1/logs", request);
    throw e;
  }
  // TODO: proper response
  reply.status(200).send("Logs received");
});

function handleDolos(
  scope: IInstrumentationScope,
  record: ILogRecord,
): undefined | {
  component: string;
  namespace: Namespace;
  level: SeverityNumber;
  message: string[];
} {
  // overly noisy
  if (scope.name === "dolos::sync::roll") {
    return undefined;
  }
  const namespaceParts = scope.name.split("::");

  const attributes = record.attributes.map((attr) =>
    `${attr.key}: ${JSON.parse(otelStringify(attr.value))}`
  );
  return {
    component: namespaceParts[0],
    namespace: namespaceParts.slice(1),
    level: (record.severityNumber as unknown as SeverityNumber) ??
      SeverityNumber.UNSPECIFIED,
    message: [JSON.parse(otelStringify(record.body)), ...attributes],
  };
}

// Start the server
server.listen({ port: PORT, host: "0.0.0.0" }, (err: any, address: any) => {
  if (err) {
    logger.local(
      ComponentNames.COLLECTOR,
      [],
      SeverityNumber.FATAL,
      (log) => log(err),
    );
    Deno.exit(1);
  }
  logger.local(
    ComponentNames.COLLECTOR,
    [],
    SeverityNumber.INFO,
    (log) => log(`in-memory OpenTelemetry Collector running on ${address}`),
  );
});

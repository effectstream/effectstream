import { parse } from "jsonc-parser";
import fs from "node:fs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { type ComponentNames, defaultOtelSetup } from "@paima/log";
import { log, type Namespace, SeverityNumber } from "@paima/log";
import type { ValueOf } from "@paima/utils";

const DenoConfig = parse(fs.readFileSync("./deno.json", "utf8"));

type Source = "stdout" | "stderr";
export type LogHandler = (
  chunk: Uint8Array,
  source: Source,
  component: ValueOf<typeof ComponentNames>,
  namespace: Namespace,
) => void;
export function streamTo(
  handler: LogHandler,
  source: Source,
  component: ValueOf<typeof ComponentNames>,
  namespace: Namespace,
) {
  return new WritableStream({
    write(chunk) {
      handler(chunk, source, component, namespace);
    },
  });
}

export type CurrentOutput = "none" | "default" | "tui";
// Start with default to start with logs
let currentOutput = "tui";

export const setCurrentOutput = (value: CurrentOutput) => {
  currentOutput = value;
};
export const getCurrentOutput = () => {
  return currentOutput;
};

// TODO: instead of starting at false,
// we should check if there is a collector running on the otel port
// since that's the logic we'll need to decide if we run our own collector or not
let collectorStarted = false;

export function setCollectorStarted() {
  collectorStarted = true;
}

export const logHandler: LogHandler = (chunk, source, component, namespace) => {
  // if the log collector hasn't started yet, there is no point sending logs to it
  // so we just write to the console
  if (!collectorStarted) {
    return localLogHandler(chunk, source, component, namespace);
  }
  return remoteLogHandler(chunk, source, component, namespace);
};

const decoder = new TextDecoder();

/**
 * Print the string as-is directly to console
 * This is to avoid a formatting loop where @paima/collector wraps its own logs
 */
export const rawLogHandler: LogHandler = (
  chunk,
  source,
  component,
  namespace,
) => {
  if (currentOutput === "default") {
    Deno[source].write(chunk);
  }
};
export const localLogHandler: LogHandler = (
  chunk,
  source,
  component,
  namespace,
) => {
  if (currentOutput === "default") {
    log.local(
      component,
      namespace,
      source === "stdout" ? SeverityNumber.INFO : SeverityNumber.ERROR,
      (log) => log(decoder.decode(chunk)),
    );
  }
};
export const remoteLogHandler: LogHandler = (
  chunk,
  source,
  component,
  namespace,
) => {
  log.remote(
    component,
    namespace,
    source === "stdout" ? SeverityNumber.INFO : SeverityNumber.ERROR,
    (log) => log(decoder.decode(chunk)),
  );
};

export function initTelemetry(): void {
  const sdk = new NodeSDK({
    ...defaultOtelSetup("@paima/orchestrator", DenoConfig.version),
  });

  sdk.start();
}

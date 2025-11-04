import { parse } from "jsonc-parser";
import fs from "node:fs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ComponentNames, defaultOtelSetup } from "@effectstream/log";
import { log, type Namespace, SeverityNumber } from "@effectstream/log";
import type { ValueOf } from "@effectstream/utils";

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

export type LogSystemOutputs = "otel" | "stdout" | "stderr";
// By default we pass the logs to the OTel collector.
let currentOutputs: LogSystemOutputs[] = ["otel"];

export const setCurrentOutput = (value: LogSystemOutputs[]) => {
  currentOutputs = value;
};
export const getCurrentOutput = (): LogSystemOutputs[] => {
  return currentOutputs;
};

// TODO: instead of starting at false,
// we should check if there is a collector running on the otel port
// since that's the logic we'll need to decide if we run our own collector or not
let collectorStarted = false;

export function setCollectorStarted() {
  collectorStarted = true;
}

export const systemLog = (string: string) => {
  logHandler(
    new TextEncoder().encode(string),
    "stdout",
    ComponentNames.ORCHESTRATOR,
    "",
  );
};

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
 * This is to avoid a formatting loop where @effectstream/collector wraps its own logs
 */
export const rawLogHandler: LogHandler = (
  chunk,
  source,
  component,
  namespace,
) => {
  if (source === "stderr" && currentOutputs.includes("stderr")) {
    Deno[source].write(chunk);
  }
  if (currentOutputs.includes("stdout")) {
    Deno[source].write(chunk);
  }
  if (currentOutputs.includes("otel")) {
    // This passes non-otel format logs to the collector.
    // We try to avoid this as much as possible.
    log.remote(
      component,
      namespace,
      source === "stdout" ? SeverityNumber.INFO : SeverityNumber.ERROR,
      (log) => {
        log(decoder.decode(chunk).replace(/\x1B[[(?);]{0,2}(;?\d)*./g, ""));
      },
    );
  }
};
export const localLogHandler: LogHandler = (
  chunk,
  source,
  component,
  namespace,
) => {
  if (source === "stderr" && currentOutputs.includes("stderr")) {
    Deno[source].write(chunk);
  }
  if (currentOutputs.includes("stdout")) {
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
  if (source === "stderr" && currentOutputs.includes("stderr")) {
    Deno[source].write(chunk);
  }
  if (currentOutputs.includes("otel")) {
    log.remote(
      component,
      namespace,
      source === "stdout" ? SeverityNumber.INFO : SeverityNumber.ERROR,
      (log) => log(decoder.decode(chunk)),
    );
  }
  if (currentOutputs.includes("stdout")) {
    localLogHandler(chunk, source, component, namespace);
  }
};

export function initTelemetry(): void {
  const sdk = new NodeSDK({
    ...defaultOtelSetup("@effectstream/orchestrator", DenoConfig.version),
  });

  sdk.start();
}

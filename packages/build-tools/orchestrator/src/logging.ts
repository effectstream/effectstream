import { parse } from "jsonc-parser";
import fs from "node:fs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ComponentNames, defaultOtelSetup } from "@effectstream/log";
import { log, type Namespace, SeverityNumber } from "@effectstream/log";
import type { ValueOf } from "@effectstream/utils";
import { ENV } from "@effectstream/utils/node-env";
import { processes } from "./process.ts";

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

// LOG Global Options
// 1. Send logs to collector
export const logsConfig: {
  collectorStarted: boolean;
  collectorPort: number | undefined;
  tuiStarted: boolean;
  tuiPort: number | undefined;
  stdoutOutput: boolean;
  stderrOutput: boolean;
} = {
  collectorStarted: false,
  collectorPort: undefined,
  tuiStarted: false,
  tuiPort: undefined,
  stdoutOutput: false,
  stderrOutput: false,
}

export function setCollectorStarted(port: number) {
  logsConfig.collectorStarted = true;
  logsConfig.collectorPort = port;
}

export function setTUIStarted(port: number) {
  logsConfig.tuiStarted = true;
  logsConfig.tuiPort = port;
}

export function setStdoutOutput() {
  logsConfig.stdoutOutput = true;
}

export function setStderrOutput() {
  logsConfig.stderrOutput = true;
}

const decoder = new TextDecoder();

export type AdapterFunction = (
  target: 'local' | 'remote' | 'format-message',
  chunk: Uint8Array,
  source: Source,
  component: ValueOf<typeof ComponentNames>,
  namespace: Namespace,
  severity: SeverityNumber,
) => boolean | { 
  component: string; 
  namespace: string[]; 
  level: SeverityNumber; 
  message: string[]; 
}[];

// If target === local or remote; return true if executed, false otherwise.
// If target === format-message; return the formatted message or false if not executed.
//
// TODO Log stream might come combined, formatted or not, now we expect all or none to be formatted.
export const tsLogOrchestratorAdapter: AdapterFunction = (
  target: 'local' | 'remote' | 'format-message',
  chunk,
  source,
  component,
  namespace,
  severity,
) => {
  const logMethod = target === 'local' ?  log.localForce : 
                    target === 'remote' ? log.remoteForce :
                                          undefined;
  // Messages from Effectstream processes can be either in
  // tsLogOrchestrator format or raw-string.
  // Also multiple message might get combined into a single chunk, so we need to parse it.
  try {
    const chunkString = decoder.decode(chunk);
    const parts = chunkString.split("\n").filter(Boolean);
    const parsed = parts.map(part => JSON.parse(part));
    if (!parsed.every(p => p.__ORCHESTRATOR__)) throw new Error();
    
    const maybeMessageParts = [];
    for (const part of parsed) {
      // Here we use the encoded data to log the message.
      let component: string;
      let namespace: string[];
      if (part.namespaces[0] === "effectstream") {
        const [, _component, ..._namespace] = part.namespaces;
        component = _component;
        namespace = _namespace;
      } else {
        const [_component, ..._namespace] = part.namespaces;
        component = _component;
        namespace = _namespace;
      }

      const payload = {
        component,
        namespace,
        level: part.level,
        message: Array.isArray(part.data) ? part.data : [part.data],
      };

      if (logMethod) {
        logMethod(
          component,
          namespace,
          part.level,
          (log) => log(...payload.message),
        );
      } else {
        maybeMessageParts.push(payload);
      }
    }
    return logMethod ? true : maybeMessageParts;
  } catch {
    return false;
  }
}

export const logHandler = (options: {
  disableCollector?: boolean;
  disableTUI?: boolean;
  disableStdOut?: boolean;
  disableStderr?: boolean;
} | undefined = {},
  logAdapter?: AdapterFunction
): LogHandler => {
   
  // Let's calculate the enabled flags for this specific log handler:
  const enableStdErr = logsConfig.stderrOutput && !options.disableStderr;
  const enableStdOut = logsConfig.stdoutOutput && !options.disableStdOut;
  const enableCollector = logsConfig.collectorStarted && !options.disableCollector;
  const enableTUI = logsConfig.tuiStarted && !options.disableTUI;

  return (
    chunk,
    source,
    component,
    namespace,
  ) => {
    if (enableStdErr && source === "stderr") {
      if (!(logAdapter &&  
          logAdapter('local', chunk, source, component, namespace, SeverityNumber.ERROR))) {
        // The adapter didn't handle the message.
        log.localForce(
          component,
          namespace,
          SeverityNumber.ERROR,
          (log) => log(decoder.decode(chunk)),
        );
      }
    }
    
    if (enableStdOut && source === "stdout") {
      if (!(logAdapter &&  
          logAdapter('local', chunk, source, component, namespace, SeverityNumber.INFO))) {
        // The adapter didn't handle the message.
        log.localForce(
          component,
          namespace,
          SeverityNumber.INFO,
          (log) => log(decoder.decode(chunk)),
        );
      }
    }

    if (enableTUI) {
      const formattedMessages = logAdapter && logAdapter('format-message', chunk, source, component, namespace, SeverityNumber.INFO);
      if (Array.isArray(formattedMessages)) {
        messageQueue.push(...formattedMessages);
      } else {
        messageQueue.push({
          component: component || 'unknown',
          namespace: Array.isArray(namespace) ? namespace : [namespace],
          level: source === "stdout" ? SeverityNumber.INFO : SeverityNumber.ERROR,
          message: [decoder.decode(chunk)],
        });
      }
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          sendToTUI();
        }, 100);
      }
    }

    if (enableCollector) {
      if (!(logAdapter &&  
        logAdapter('remote', chunk, source, component, namespace, SeverityNumber.INFO))) {
        // The adapter didn't handle the message.
        log.remoteForce(
          component,
          namespace,
          SeverityNumber.INFO,
          (log) => log(decoder.decode(chunk)),
        );
      } 
    }
  }
};

let timeout: number | null = null;
// TODO This should use the logsConfig.tuiPort instead of the ENV.TUI_LOG_PORT
const tuiUrl = ENV.TUI_LOG_URL + ":" + ENV.TUI_LOG_PORT /* logsConfig.tuiPort */;

const messageQueue: {
  component: string;
  namespace: string[];
  level: SeverityNumber;
  message: string[];
}[] = [];

function sendToTUI() {
  if (messageQueue.length === 0) return;
  const data = JSON.stringify(messageQueue);
  messageQueue.length = 0;

  fetch(tuiUrl + "/v1/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: data,
  }).catch(() => {});
}

export function initTelemetry(): void {
  const sdk = new NodeSDK({
    ...defaultOtelSetup("@effectstream/orchestrator", DenoConfig.version),
  });

  sdk.start();
}

// Used by the orchestrator to log system messages.
export const systemLog = (message: string): void => {
  const isTMUXRunning = processes.find(p => p.component === ComponentNames.TMUX)?.alive;
  if (isTMUXRunning) {
    messageQueue.push({
      component: "SYSTEM-LOG",
      namespace: [],
      level: SeverityNumber.INFO,
      message: [message],
    });
    sendToTUI();
  } else {
    log.localForce(
      "SYSTEM-LOG",
      [],
      SeverityNumber.INFO,
      (log) => log(message),
    );
  }
  
  if (logsConfig.collectorStarted) {
    log.remoteForce(
      "SYSTEM-LOG",
      [],
      SeverityNumber.INFO,
      (log) => log(message),
    );
  }
}

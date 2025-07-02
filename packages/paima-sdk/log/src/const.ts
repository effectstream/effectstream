import { SeverityNumber } from "@opentelemetry/api-logs";

/**
 * Components that should get an automatic "paima" prefix
 */
export const PaimaComponents = {
  PAIMA_SYNC: "sync",
  PAIMA_RUNTIME: "runtime",
  PAIMA_DB: "db",
  ORCHESTRATOR: "orchestrator",
  COLLECTOR: "collector",
};
const ExternalComponents = {
  HARDHAT: "hardhat",
  YACI_DEVKIT: "yaci-devkit",
  DOLOS: "dolos",
  PAIMA_BATCHER: "batcher",
  DOCS: "docs",
};
const ToolsComponents = {
  CHECKER: "checker",
  TUI: "tui",
  DOLOS_WAIT: "dolos-wait",
  YACI_DEVKIT_WAIT: "yaci-devkit-wait",
  HARDHA_WAIT: "hardhat-wait",
  COLLECTOR_WAIT: "collector-wait",
  PAIMA_DB_WAIT: "db-wait",
  TMUX: "tmux",
};
export const ComponentNames = {
  ...PaimaComponents,
  ...ExternalComponents,
  ...ToolsComponents,
};

// TODO: this try some ENV var before defaulting to INFO
export const defaultSeverity = SeverityNumber.INFO;

/**
 * extra step in the logger to avoid performance degradation.
 * otherwise, the following can slow down the program:
 * `log.local(LogLevels.DEBUG, JSON.stringify(largeObj))`
 * since it runs `JSON.stringify` even if the default `LogLevel` excludes it
 */
export type DeferredLog = (logger: typeof console.log) => void;

// TODO: should re-export a type built-into material-chalk instead of defining it here
//       notably, https://github.com/SebastienGllmt/material-chalk/blob/master/src/core.ts#L175
export type Namespace = string | string[];

export type LogFunc = (
  component: string,
  namespace: Namespace,
  level: SeverityNumber,
  doLog: DeferredLog,
) => void;

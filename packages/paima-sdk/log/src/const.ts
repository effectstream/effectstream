import { SeverityNumber } from "@opentelemetry/api-logs";

/**
 * Main components
 * These components get a "paima" prefix in the log.
 */
export const PaimaComponents = {
  PAIMA_SYNC: "sync",
  PAIMA_RUNTIME: "runtime",
  PAIMA_DB: "db",
};
/**
 * External components
 */
export const ExternalComponents = {
  HARDHAT: "hardhat",
  YACI_DEVKIT: "yaci-devkit",
  DOLOS: "dolos",
};

/**
 * Paima Tools, helper and services to support the main components.
 * These components get a "paima" prefix in the log.
 */
export const PaimaToolsComponents = {
  CHECKER: "checker",
  TUI: "tui",
  TMUX: "tmux",
  COLLECTOR: "collector",
  EXPLORER: "explorer",
  DOCS: "docs",
  PAIMA_BATCHER: "batcher",
  DEPLOY_EVM_CONTRACTS: "deploy-evm-contracts",
};
/**
 * Secondary components
 * These components are launched automatically.
 */
export const SecondaryComponents = {
  // This is the entry point, so it gets launched by default.
  ORCHESTRATOR: "orchestrator",
  // Thses processes are launched by their counterpart.
  DOLOS_WAIT: "dolos-wait",
  YACI_DEVKIT_WAIT: "yaci-devkit-wait",
  HARDHAT_WAIT: "hardhat-wait",
  COLLECTOR_WAIT: "collector-wait",
  PAIMA_DB_WAIT: "db-wait",
};

/** All the components that can be launched by the orchestrator */
export const LaunchableComponents = {
  ...PaimaComponents,
  ...PaimaToolsComponents,
  ...ExternalComponents,
};
/** All the components */
export const ComponentNames = {
  ...LaunchableComponents,
  ...SecondaryComponents,
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

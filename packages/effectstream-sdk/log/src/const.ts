import { SeverityNumber } from "@opentelemetry/api-logs";
import { getEnv } from "@effectstream/utils/runtime";

/**
 * Main components
 * These components get a "paima" prefix in the log.
 */
export const PaimaComponents = {
  EFFECTSTREAM_SYNC: "sync",
  EFFECTSTREAM_RUNTIME: "runtime",
  EFFECTSTREAM_PGLITE: "pglite",
  APPLY_MIGRATIONS: "apply-migrations",
};
/**
 * External components
 */
export const ExternalComponents = {
  HARDHAT: "hardhat",
  YACI_DEVKIT: "yaci-devkit",
  DOLOS: "dolos",
  MIDNIGHT_NODE: "midnight-node",
  MIDNIGHT_INDEXER: "midnight-indexer",
  MIDNIGHT_PROOF_SERVER: "midnight-proof-server",
  AVAIL_NODE: "avail-node",
  AVAIL_CLIENT: "avail-light-client",
  BITCOIN_CORE: "bitcoin-core",
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
  DEPLOY_EVM_CONTRACTS: "deploy-evm-contracts",
  MIDNIGHT_CONTRACT: "midnight-contract",
};
/**
 * Secondary components
 * These components are launched automatically.
 */
export const SecondaryComponents = {
  // This is the entry point, so it gets launched by default.
  ORCHESTRATOR: "orchestrator",
  // Thses processes are launched by their counterpart.
  DOLOS_FILL_TEMPLATE: "dolos-fill-template",
  DOLOS_WAIT: "dolos-wait",
  YACI_DEVKIT_WAIT: "yaci-devkit-wait",
  MIDNIGHT_NODE_WAIT: "midnight-node-wait",
  MIDNIGHT_INDEXER_WAIT: "midnight-indexer-wait",
  MIDNIGHT_PROOF_SERVER_WAIT: "midnight-proof-server-wait",
  BITCOIN_CORE_WAIT: "bitcoin-core-wait",
  BITCOIN_GENERATE_BLOCKS: "bitcoin-mine-blocks",
  BITCOIN_WAIT_FOR_BLOCK: "bitcoin-wait-for-block",
  AVAIL_NODE_WAIT: "avail-node-wait",
  AVAIL_CLIENT_WAIT: "avail-light-client-wait",
  HARDHAT_WAIT: "hardhat-wait",
  COLLECTOR_WAIT: "collector-wait",
  EFFECTSTREAM_DB_WAIT: "db-wait",
  LOKI: "loki",
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

const parseSeverity = (): SeverityNumber => {
  const level = getEnv("EFFECTSTREAM_LOG_LEVEL")?.toUpperCase();
  if (level && level in SeverityNumber) {
    return SeverityNumber[level as keyof typeof SeverityNumber];
  }
  return SeverityNumber.INFO;
};

export const defaultSeverity = parseSeverity();

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

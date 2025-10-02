/**
 * Paima Batcher - Main Module Exports
 *
 * This module provides a clean interface to the Paima batcher system,
 * including the core batcher class, configuration types, storage interfaces,
 * and chain connectors.
 */

// Core batcher functionality
export { PaimaBatcher } from "./core/batcher.ts";

// Configuration types and validation
export type {
  BatchingCriteriaConfig,
  PaimaBatcherConfig,
  ValidConnectorKey,
} from "./core/config.ts";
export {
  applyBatcherConfigDefaults,
  BatchingCriteriaConfigSchema,
  DEFAULT_CONFIG_VALUES,
  PaimaBatcherConfigSchema,
  PerConnectorBatchingCriteriaSchema,
  validateBatcherConfig,
  validateBatchingCriteria,
} from "./core/config.ts";

// Storage interfaces and implementations
export type { BatcherStorage } from "./core/storage.ts";
export { DatabaseStorage, FileStorage } from "./core/storage.ts";

// Chain connector interfaces and implementations
export type { IChainConnector } from "./connectors/connector.ts";
export { EvmChainConnector } from "./connectors/evm-connector.ts";

// HTTP server
export { startBatcherHttpServer } from "./server/batcher-server.ts";

// Utility types
export type { DefaultBatcherInput } from "./core/types.ts";

// Event/listener helpers
export type { BatcherGrammar, BatcherListener } from "./core/batcher-events.ts";
export { attachDefaultConsoleListeners } from "./core/batcher-events.ts";

/**
 * Paima Batcher - Main Module Exports
 *
 * This module provides a clean interface to the Paima batcher system,
 * including the core batcher class, configuration types, storage interfaces,
 * and chain connectors.
 */

// Core batcher functionality
export { PaimaBatcher } from "./batcher.ts";

// Configuration types and validation
export type {
  BatchingCriteriaConfig,
  PaimaBatcherConfig,
  ValidConnectorKey,
} from "./batcher-config.ts";
export {
  validateBatcherConfig,
  validateBatchingCriteria,
} from "./batcher-config.ts";

// Storage interfaces and implementations
export type { BatcherStorage } from "./storage.ts";
export { DatabaseStorage, FileStorage } from "./storage.ts";

// Chain connector interfaces and implementations
export type { IChainConnector } from "./chain-connectors/connector.ts";
export { EvmChainConnector } from "./chain-connectors/evm-connector.ts";

// HTTP server
export { startBatcherHttpServer } from "./batcher-server.ts";

// Utility types
export type { DefaultBatcherInput } from "./types.ts";

/**
 * Batcher - Main Module Exports
 *
 * This module provides a clean interface to the batcher system,
 * including the core batcher class, configuration types, storage interfaces,
 * and chain adapters.
 */

// Core batcher functionality
export { Batcher, createNewBatcher } from "./core/batcher.ts";

// Configuration types and validation
export type {
  BatchingCriteriaConfig,
  BatcherConfig,
  ValidAdapterKey,
} from "./core/config.ts";
export {
  applyBatcherConfigDefaults,
  BatchingCriteriaConfigSchema,
  DEFAULT_CONFIG_VALUES,
  BatcherConfigSchema,
  PerAdapterBatchingCriteriaSchema,
  validateBatcherConfig,
  validateBatchingCriteria,
} from "./core/config.ts";

// Storage interfaces and implementations
export type { BatcherStorage } from "./core/storage.ts";
export { DatabaseStorage, FileStorage } from "./core/storage.ts";

// Chain adapter interface and implementations
export type { BlockchainAdapter, BatchBuildingOptions, BatchBuildingResult } from "./adapters/adapter.ts";
export { PaimaL2DefaultAdapter } from "./adapters/paimal2-adapter.ts";
export { MidnightAdapter } from "./adapters/midnight-adapter.ts";
export { BitcoinAdapter, buildBitcoinSignatureMessage } from "./adapters/bitcoin-adapter.ts";
export {
  EvmContractAdapter,
  type EvmContractAdapterConfig,
  type HardhatArtifact,
} from "./adapters/evm-contract-adapter.ts";

export type { BitcoinAdapterConfig } from "./adapters/bitcoin-adapter.ts";
export type { MidnightAdapterConfig } from "./adapters/midnight-adapter.ts";

// HTTP server
export { startBatcherHttpServer } from "./server/batcher-server.ts";

// Utility types
export type { DefaultBatcherInput } from "./core/types.ts";

// Event/listener helpers
export type { BatcherGrammar, BatcherListener } from "./core/batcher-events.ts";
export { attachDefaultConsoleListeners } from "./core/batcher-events.ts";

export { DefaultBatchBuilderLogic } from "./batch-data-builder/default-builder-logic.ts";
export {
  EvmBatchBuilderLogic,
  type EvmBatchPayload,
} from "./batch-data-builder/evm-builder-logic.ts";
export {
  MidnightBatchBuilderLogic,
  type MidnightBatchPayload,
} from "./batch-data-builder/midnight-builder-logic.ts";
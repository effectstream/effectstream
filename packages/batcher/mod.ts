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
  RateLimitConfig,
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
export { EffectstreamL2DefaultAdapter } from "./adapters/effectstream-l2-adapter.ts";
export { MidnightAdapter } from "./adapters/midnight-adapter.ts";
export { MidnightBalancingAdapter } from "./adapters/midnight-balancing-adapter.ts";
export { BitcoinAdapter, buildBitcoinSignatureMessage } from "./adapters/bitcoin-adapter.ts";
export { SolanaAdapter } from "./adapters/solana-adapter.ts";
export type { SolanaAdapterConfig, SolanaBatchPayload } from "./adapters/solana-adapter.ts";
export { parseCircuitArgs } from "./adapters/mod.ts";
export {
  EvmContractAdapter,
  type EvmContractAdapterConfig,
  type HardhatArtifact,
} from "./adapters/evm-contract-adapter.ts";

export type { BitcoinAdapterConfig } from "./adapters/bitcoin-adapter.ts";
export type { MidnightAdapterConfig } from "./adapters/midnight-adapter.ts";
export type { MidnightBalancingAdapterConfig } from "./adapters/midnight-balancing-adapter.ts";

export { CelestiaAdapter } from "./adapters/celestia-adapter.ts";
export type {
  CelestiaAdapterConfig,
  CelestiaBatchPayload,
  CelestiaBlob,
  CelestiaNetwork,
} from "./adapters/celestia-adapter.ts";

// Rate limiting
export type {
  RateLimitStore,
  RateLimitKeyStrategy,
  RateLimitCheckResult,
} from "./core/rate-limiter.ts";
export { RateLimiter, InMemoryRateLimitStore } from "./core/rate-limiter.ts";

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
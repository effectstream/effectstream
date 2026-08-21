/**
 * Batcher - Main Module Exports
 *
 * This module provides a clean interface to the batcher system,
 * including the core batcher class, configuration types, storage interfaces,
 * and chain adapters.
 */

// Core batcher functionality
export {
  Batcher,
  createNewBatcher,
  InputTerminalError,
  InputValidationError,
} from "./core/batcher.ts";

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
export type {
  AcceptanceOutcome,
  BatcherStorage,
  ReconciliationReport,
  RequestState,
  RequestStatusRecord,
  RequestTransitionDetail,
  TrackingStorage,
  TransitionOutcome,
  TransitionRefusal,
} from "./core/storage.ts";
export {
  DatabaseStorage,
  FileStorage,
  isTrackingStorage,
} from "./core/storage.ts";

// Request identity: the id a caller polls with, and the serialization it and
// every storage row are derived from.
export {
  buildRequestKey,
  computeRequestId,
  requestIdFromKey,
} from "./core/request-id.ts";

// Replay identity: the SEPARATE question of whether this spend was already
// paid for. Exported so an adapter author writing `getReplayKey` can see what
// the default does and why it is not the request id.
export { defaultReplayKey, resolveReplayKey } from "./core/replay-key.ts";

// Chain adapter interface and implementations
export type { BlockchainAdapter, BatchBuildingOptions, BatchBuildingResult } from "./adapters/adapter.ts";
export { EffectstreamL2DefaultAdapter } from "./adapters/effectstream-l2-adapter.ts";
export { MidnightAdapter } from "./adapters/midnight-adapter.ts";
// releaseWalletSeeds / resetWalletSeedRegistry are deliberately NOT exported.
// They can drop a live adapter's wallet claim, which is the protection against
// two adapters double-spending one wallet's dust. Releasing is the adapter's
// own business (close()); resetting exists only for tests, which import the
// module directly.
export { MidnightBalancingAdapter } from "./adapters/midnight-balancing-adapter.ts";
export type { WalletSeedClaim } from "./adapters/midnight-balancing-adapter.ts";
// Transaction policy: shared introspection helpers + declarative rules.
// Custom filters (policy.allowCustomFinalFilter) should be written with these.
export * from "./adapters/midnight-policy.ts";
export { BitcoinAdapter, buildBitcoinSignatureMessage } from "./adapters/bitcoin-adapter.ts";
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

export { SolanaAdapter, CapacityExchangeClient } from "./adapters/solana-adapter.ts";
export type {
  SolanaAdapterConfig,
  SolanaBatchPayload,
} from "./adapters/solana-adapter.ts";

export { NearAdapter } from "./adapters/near-adapter.ts";
export type {
  NearAdapterConfig,
  NearBatchPayload,
} from "./adapters/near-adapter.ts";

export { NearIntentAdapter } from "./adapters/near-intent-adapter.ts";
export type {
  NearIntentAdapterConfig,
  NearIntentBatch,
} from "./adapters/near-intent-adapter.ts";


// Rate limiting
export type {
  RateLimitStore,
  RateLimitKeyStrategy,
  RateLimitCheckResult,
  RateLimitBucket,
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

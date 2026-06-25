/**
 * Blockchain Adapters Module
 *
 * Clean exports for all blockchain adapters and their interfaces.
 * This module centralizes adapter-related imports for the batcher system.
 */

// Base blockchain adapter interface and types
export type {
  BlockchainAdapter,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "./adapter.ts";

// Shared adapter logger
export { AdapterLogger } from "./adapter-logger.ts";

// EffectstreamL2 adapter implementation
export { EffectstreamL2DefaultAdapter } from "./effectstream-l2-adapter.ts";

// Midnight adapter implementation
export { MidnightAdapter } from "./midnight-adapter.ts";
export type { MidnightAdapterConfig } from "./midnight-adapter.ts";
export { MidnightBalancingAdapter } from "./midnight-balancing-adapter.ts";
export type { MidnightBalancingAdapterConfig } from "./midnight-balancing-adapter.ts";

// Midnight helper utilities
export { parseCircuitArgs } from "./midnight-arg-parser.ts";

// Worker pool for Midnight adapters
export { WorkerPool } from "./worker-pool.ts";

// Generic EVM adapter implementation
export {
  EvmContractAdapter,
  type EvmContractAdapterConfig,
  type HardhatArtifact,
} from "./evm-contract-adapter.ts";

// Bitcoin adapter implementation
export { BitcoinAdapter, buildBitcoinSignatureMessage } from "./bitcoin-adapter.ts";
export type { BitcoinAdapterConfig } from "./bitcoin-adapter.ts";

// NEAR adapter implementations
export { NearAdapter } from "./near-adapter.ts";
export type { NearAdapterConfig, NearBatchPayload } from "./near-adapter.ts";
export { NearIntentAdapter } from "./near-intent-adapter.ts";
export type { NearIntentAdapterConfig, NearIntentBatch } from "./near-intent-adapter.ts";

// Celestia adapter implementation
export { CelestiaAdapter } from "./celestia-adapter.ts";
export type {
  CelestiaAdapterConfig,
  CelestiaBatchPayload,
  CelestiaBlob,
  CelestiaNetwork,
} from "./celestia-adapter.ts";

// Solana adapter implementation
export { SolanaAdapter, CapacityExchangeClient } from "./solana-adapter.ts";
export type { SolanaAdapterConfig, SolanaBatchPayload } from "./solana-adapter.ts";


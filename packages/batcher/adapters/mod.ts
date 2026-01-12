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

// PaimaL2 adapter implementation
export { PaimaL2DefaultAdapter } from "./paimal2-adapter.ts";

// Midnight adapter implementation
export { MidnightAdapter } from "./midnight-adapter.ts";
export type { MidnightAdapterConfig } from "./midnight-adapter.ts";

// Midnight helper utilities
export { parseCircuitArgs } from "./midnight-arg-parser.ts";

// Generic EVM adapter implementation
export {
  EvmContractAdapter,
  type EvmContractAdapterConfig,
  type HardhatArtifact,
} from "./evm-contract-adapter.ts";

// Bitcoin adapter implementation
export { BitcoinAdapter, buildBitcoinSignatureMessage } from "./bitcoin-adapter.ts";
export type { BitcoinAdapterConfig } from "./bitcoin-adapter.ts";


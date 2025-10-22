/**
 * Blockchain Adapters Module
 *
 * Clean exports for all blockchain adapters and their interfaces.
 * This module centralizes adapter-related imports for the batcher system.
 */

// Base blockchain adapter interface
export type { BlockchainAdapter } from "./adapter.ts";

// PaimaL2 adapter implementation
export { PaimaL2DefaultAdapter } from "./paimal2-adapter.ts";

// Midnight adapter implementation
export { MidnightAdapter } from "./midnight-adapter.ts";
export type { MidnightAdapterConfig } from "./midnight-adapter.ts";

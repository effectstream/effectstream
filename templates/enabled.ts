/**
 * Templates included in release validation and in the template runtime image.
 *
 * Keep this module side-effect free: it is imported by CI classification,
 * release tooling, the artifact audit, and the test runner.
 */
export const ENABLED_TEMPLATES = [
  "cardano-delegation",
  "evm-cardano",
  "evm-midnight-v2",
  "preorder",
  "projected-nft-preorder",
  "shinkai-v2",
  "zk-cardano",
  "batcher-validations",
  "night-bitcoin-v2",
  "hex-battle",
  "solana-starter",
  "chess-v2",
  "minimal",
  "world-map-2d",
] as const;

export type EnabledTemplate = (typeof ENABLED_TEMPLATES)[number];

// Compatibility alias for existing importers.
export const ENABLED = ENABLED_TEMPLATES;

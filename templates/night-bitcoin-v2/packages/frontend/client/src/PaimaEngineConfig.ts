import { EffectstreamConfig } from "@effectstream/wallets";

// appName MUST match BatcherConfig.namespace ("night-bitcoin")
// This template is Midnight + Bitcoin (no EVM L2 contract), so the chain
// configuration is provided as undefined for the EVM-specific fields.
export const paimaEngineConfig = new EffectstreamConfig(
  "night-bitcoin",
  "midnightMain",
  "0x0000000000000000000000000000000000000000",
  undefined as any,
  undefined,
  import.meta.env.VITE_BATCHER_URL || "http://localhost:3334",
  true,
);

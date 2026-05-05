import path from "node:path";
import { fileURLToPath } from "node:url";

import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { ENV } from "@effectstream/utils/node-env";
import type { BatcherConfig } from "@effectstream/batcher-sdk";

const DEFAULT_STORAGE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../batcher-data",
);

// Dedicated seed pair for the night-bitcoin balancing batcher wallet.
// Distinct from any wallet the rest of the stack uses — running two wallets on
// the same seed against a single Midnight node forces one to disconnect.
const BATCHER_SEED = [
  "0000000000000000000000000000000000000000000000000000000000000003",
  "0000000000000000000000000000000000000000000000000000000000000004",
];

export const walletSeed = ENV.getString("BATCHER_WALLET_SEED") || BATCHER_SEED;

export const batcherConfig = {
  port: ENV.getNumber("BATCHER_PORT", 3334),
  pollingIntervalMs: ENV.getNumber("BATCHER_POLLING_INTERVAL_MS", 250),
  storageDir: ENV.getString("BATCHER_STORAGE_DIR", DEFAULT_STORAGE_DIR),
  midnight: {
    id: midnightNetworkConfig.id,
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  },
} as const satisfies Pick<BatcherConfig, never> & Record<string, unknown>;

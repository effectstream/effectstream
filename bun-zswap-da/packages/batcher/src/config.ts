import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { ENV } from "@effectstream/utils/node-env";
import { BatcherConfig } from "@effectstream/batcher-sdk";

// Dedicated seed for the zswap-da batcher wallet. NOT the genesis seed
// (which is already in use by alice in the sync node — running two wallets
// on the same seed against a single Midnight node forces one to disconnect).
const BATCHER_SEED = [
  "0000000000000000000000000000000000000000000000000000000000000003",
  "0000000000000000000000000000000000000000000000000000000000000004",
]

export const walletSeed = ENV.getString("BATCHER_WALLET_SEED") || BATCHER_SEED;

export const batcherConfig: BatcherConfig = {
  port: ENV.getNumber("BATCHER_PORT", 3334),
  pollingIntervalMs: ENV.getNumber("BATCHER_POLLING_INTERVAL_MS", 250),
  storageDir: ENV.getString("BATCHER_STORAGE_DIR", "./zswap-da-batcher-data"),
  midnight: {
    id: midnightNetworkConfig.id,
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  },
};

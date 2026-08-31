import path from "node:path";
import { fileURLToPath } from "node:url";

import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { ENV } from "@effectstream/utils/node-env";

const DEFAULT_STORAGE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../batcher-data",
);

/** Same default the funding script uses — a plain dev seed, NOT genesis. */
export const DEFAULT_BATCHER_SEED =
  "0000000000000000000000000000000000000000000000000000000000000042";

export const walletSeed =
  ENV.getString("BATCHER_WALLET_SEED") || DEFAULT_BATCHER_SEED;

export const batcherConfig = {
  port: ENV.getNumber("BATCHER_PORT", 3334),
  pollingIntervalMs: ENV.getNumber("BATCHER_POLLING_INTERVAL_MS", 500),
  storageDir: ENV.getString("BATCHER_STORAGE_DIR", DEFAULT_STORAGE_DIR),
  maxSlotsPerWallet: ENV.getNumber("BATCHER_MAX_SLOTS_PER_WALLET", 10),
  // NOTE: for "size" criteria this is the TRIGGER threshold (process when
  // >= N inputs are queued), not a batch cap — the adapter still fans out to
  // all free workers. 1 = process immediately.
  maxBatchSize: ENV.getNumber("BATCHER_MAX_BATCH_SIZE", 1),
  midnight: {
    id: midnightNetworkConfig.id,
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  },
} as const;

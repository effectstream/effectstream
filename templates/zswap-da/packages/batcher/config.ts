import path from "node:path";
import { fileURLToPath } from "node:url";

import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { ENV } from "@effectstream/utils/node-env";

export interface BatcherConfig {
  port: number;
  pollingIntervalMs: number;
  storageDir: string;
  walletSeed: string | string[];
  midnight: {
    id: string;
    indexer: string;
    indexerWS: string;
    node: string;
    proofServer: string;
  };
  celestia: {
    rpcUrl: string;
    namespace: string;
    authToken: string | undefined;
    network: "devnet" | "mainnet";
    fee: number;
    gasLimit: number;
    gasPrice: number | undefined;
    gas: number | undefined;
    maxGasPrice: number | undefined;
    txPriority: number | undefined;
  };
}

const DEFAULT_STORAGE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "batcher-data",
);

// Dedicated seed for the zswap-da batcher wallet. Distinct from any wallet
// the rest of the stack uses — running two wallets on the same seed against
// a single Midnight node forces one to disconnect.
const BATCHER_SEED = [
  "0000000000000000000000000000000000000000000000000000000000000003",
  "0000000000000000000000000000000000000000000000000000000000000004",
];

const optionalNumber = (key: string): number | undefined => {
  const raw = ENV.getString(key, "");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function loadBatcherConfig(): BatcherConfig {
  const network = ENV.getString("CELESTIA_NETWORK", "devnet") as
    | "devnet"
    | "mainnet";

  return {
    port: ENV.getNumber("BATCHER_PORT", 3334),
    pollingIntervalMs: ENV.getNumber("BATCHER_POLLING_INTERVAL_MS", 250),
    storageDir: ENV.getString("BATCHER_STORAGE_DIR", DEFAULT_STORAGE_DIR),
    walletSeed: ENV.getString("BATCHER_WALLET_SEED") || BATCHER_SEED,
    midnight: {
      id: midnightNetworkConfig.id,
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
    },
    celestia: {
      rpcUrl: ENV.getString("CELESTIA_RPC_URL", "http://127.0.0.1:26658"),
      namespace: ENV.getString("CELESTIA_NAMESPACE", "000000000000deadbeef"),
      authToken: ENV.getString("CELESTIA_AUTH_TOKEN", "") || undefined,
      network,
      fee: ENV.getNumber("CELESTIA_FEE", 2000),
      gasLimit: ENV.getNumber("CELESTIA_GAS_LIMIT", 100000),
      gasPrice: optionalNumber("CELESTIA_GAS_PRICE"),
      gas: optionalNumber("CELESTIA_GAS"),
      maxGasPrice: optionalNumber("CELESTIA_MAX_GAS_PRICE"),
      txPriority: optionalNumber("CELESTIA_TX_PRIORITY"),
    },
  };
}

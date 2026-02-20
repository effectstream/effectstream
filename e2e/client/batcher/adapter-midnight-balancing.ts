import { MidnightBalancingAdapter } from "@effectstream/batcher";
import { dirname, resolve } from "node:path";
import { ENV } from "@effectstream/utils/node-env";

const currentDir = dirname(new URL(import.meta.url).pathname);

const midnightContractsDir = resolve(currentDir, "..", "..", "shared", "contracts", "midnight");

import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";

import { sharedWalletResult } from "./adapter-midnight.ts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;

const midnight_enabled = !ENV.getBoolean("DISABLE_MIDNIGHT");

const midnightNetworkUrls = {
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  };

const { zkConfigPath: counterZkConfigPath } = midnight_enabled ? readMidnightContract(
    "contract-counter",
    {
      baseDir: midnightContractsDir,
      networkId: midnightNetworkConfig.id,
    },
  ) : { zkConfigPath: undefined };

// Midnight Balancing Adapter (Party B)
const balancingAdapterConfig = midnight_enabled ? {
  ...midnightNetworkUrls,
  walletNetworkId: midnightNetworkConfig.id,
  walletResult: sharedWalletResult,
  zkConfigPath: counterZkConfigPath,
  syncProtocolName: "parallelMidnight",
} : undefined;

export const midnightBalancingAdapter: MidnightBalancingAdapter = midnight_enabled ? new MidnightBalancingAdapter(
  DEFAULT_WALLET_SEED,
  balancingAdapterConfig!
) : (undefined as any);

import { MidnightBalancingAdapter } from "@effectstream/batcher";
import { dirname, resolve } from "@std/path";
import { ENV } from "@effectstream/utils/node-env";

const currentDir = dirname(new URL(import.meta.url).pathname);

const midnightContractsDir = resolve(currentDir, "..", "..", "shared", "contracts", "midnight");

import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";

import { sharedWalletResult } from "./adapter-midnight.ts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;

// TODO We should disable this adapter if midnight is disabled.
const midnight_enabled = !ENV.getBoolean("DISABLE_MIDNIGHT");



const midnightNetworkUrls = {
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  };

const { zkConfigPath: counterZkConfigPath } = readMidnightContract(
    "contract-counter",
    {
      baseDir: midnightContractsDir,
      networkId: midnightNetworkConfig.id,
    },
  );

// Midnight Balancing Adapter (Party B)
const balancingAdapterConfig = {
  ...midnightNetworkUrls,
  walletNetworkId: midnightNetworkConfig.id,
  walletResult: sharedWalletResult,
  zkConfigPath: counterZkConfigPath,
  syncProtocolName: "parallelMidnight",
};

export const midnightBalancingAdapter = new MidnightBalancingAdapter(
  DEFAULT_WALLET_SEED,
  balancingAdapterConfig
);

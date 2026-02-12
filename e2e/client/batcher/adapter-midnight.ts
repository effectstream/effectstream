import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { SimpleToken, witnesses } from "@e2e/midnight-contracts/eip-20";
import { MidnightAdapter } from "@effectstream/batcher";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { buildWalletFacade } from "@effectstream/midnight-contracts/wallet-info";
import { dirname, resolve } from "node:path";
import { ENV } from "@effectstream/utils/node-env";

// Resolve the base directory for midnight contracts
const currentDir = dirname(new URL(import.meta.url).pathname);
const midnightContractsDir = resolve(currentDir, "..", "..", "shared", "contracts", "midnight");

// TODO if midnight disabled we should skip the adapter construction, as it will fail.
const midnight_enabled = !ENV.getBoolean("DISABLE_MIDNIGHT");

const { contractInfo, contractAddress, zkConfigPath } = readMidnightContract(
  "contract-eip-20",
  {
    baseDir: midnightContractsDir,
    networkId: midnightNetworkConfig.id,
  }
);

const midnightNetworkUrls = {
  indexer: midnightNetworkConfig.indexer,
  indexerWS: midnightNetworkConfig.indexerWS,
  node: midnightNetworkConfig.node,
  proofServer: midnightNetworkConfig.proofServer,
};
const midnightAdapterConfig = {
  ...midnightNetworkUrls,
  zkConfigPath,
  privateStateStoreName: "simpletoken-private-state", // Local LevelDB store
  // Keep in sync with deploy + interact scripts
  privateStateId: "simpleTokenPrivateState", // On-chain contract ID (must match deploy.ts)
  walletNetworkId: midnightNetworkConfig.id, // lowercase is the standard format
};
const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;
export const sharedWalletResult = buildWalletFacade(
  midnightNetworkUrls,
  DEFAULT_WALLET_SEED,
  midnightNetworkConfig.id
);

export const midnightAdapter = new MidnightAdapter(
  contractAddress,
  DEFAULT_WALLET_SEED,
  {
    ...midnightAdapterConfig,
    walletResult: sharedWalletResult,
  },
  SimpleToken.Contract,
  witnesses,
  contractInfo,
  "parallelMidnight"
);

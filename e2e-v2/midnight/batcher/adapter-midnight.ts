import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { SimpleToken, witnesses } from "@e2e-v2/midnight-contracts/eip-20";
import { MidnightAdapter } from "@effectstream/batcher-sdk";
// SimpleToken.Contract is used below as a runtime value (passed to MidnightAdapter).
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { buildWalletFacade } from "@effectstream/midnight-contracts/wallet-info";
import { dirname, resolve } from "node:path";

// Resolve shared midnight-contracts directory (where deploy writes *.undeployed.json).
const currentDir = dirname(new URL(import.meta.url).pathname);
const midnightContractsDir = resolve(currentDir, "..", "..", "shared", "contracts", "midnight");

const { contractInfo, contractAddress, zkConfigPath } = readMidnightContract(
  "contract-eip-20",
  {
    baseDir: midnightContractsDir,
    networkId: midnightNetworkConfig.id,
  },
);

const midnightNetworkUrls = {
  indexer: midnightNetworkConfig.indexer,
  indexerWS: midnightNetworkConfig.indexerWS,
  node: midnightNetworkConfig.node,
  proofServer: midnightNetworkConfig.proofServer,
  id: midnightNetworkConfig.id,
};

const midnightAdapterConfig = {
  ...midnightNetworkUrls,
  zkConfigPath,
  contractName: "contract-eip-20",
  privateStateStoreName: "simpletoken-private-state",
  privateStateId: "simpleTokenPrivateState",
  walletNetworkId: midnightNetworkConfig.id,
};

const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;

export const sharedWalletResult = await buildWalletFacade(
  midnightNetworkUrls,
  DEFAULT_WALLET_SEED,
  midnightNetworkConfig.id,
);

export const midnightAdapter = new MidnightAdapter(
  contractAddress,
  DEFAULT_WALLET_SEED,
  { ...midnightAdapterConfig, walletResult: sharedWalletResult },
  SimpleToken.Contract,
  witnesses,
  contractInfo,
  "parallelMidnight",
);

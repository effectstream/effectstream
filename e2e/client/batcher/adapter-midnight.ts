import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { SimpleToken, witnesses } from "@e2e/midnight-contracts/eip-20";
import { MidnightAdapter } from "@effectstream/batcher";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { buildWalletFacade } from "@effectstream/midnight-contracts/wallet-info";
import { dirname, resolve } from "@std/path";
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
  id: midnightNetworkConfig.id,
};
const midnightAdapterConfig = midnight_enabled ? {
  ...midnightNetworkUrls,
  zkConfigPath,
  contractName: "contract-eip-20", // Must match readMidnightContract name above
  privateStateStoreName: "simpletoken-private-state", // Local LevelDB store
  // Keep in sync with deploy + interact scripts
  privateStateId: "simpleTokenPrivateState", // On-chain contract ID (must match deploy.ts)
  walletNetworkId: midnightNetworkConfig.id, // lowercase is the standard format
} : undefined;

const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;
export const sharedWalletResult = midnight_enabled ? await buildWalletFacade(
  midnightNetworkUrls,
  DEFAULT_WALLET_SEED,
  midnightNetworkConfig.id
) : undefined;

export const midnightAdapter: MidnightAdapter<SimpleToken.Contract> | undefined = midnight_enabled ? new MidnightAdapter(
  contractAddress,
  DEFAULT_WALLET_SEED,
  {
    ...midnightAdapterConfig!,
    walletResult: sharedWalletResult!,
  },
  SimpleToken.Contract,
  witnesses,
  contractInfo,
  "parallelMidnight"
) : (undefined as any);

import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { SimpleToken, witnesses } from "@e2e/midnight-contracts/eip-20";
import { MidnightAdapter } from "@effectstream/batcher";
import {
  midnightNetworkConfig,
} from "../../shared/midnight-env.ts";

const isEnvTrue = (key: string) => ["true", "1", "yes", "y"].includes((Deno.env.get(key) || "").toLowerCase());
const midnight_enabled = !isEnvTrue("DISABLE_MIDNIGHT");

const midnightContractData = midnight_enabled
  ? readMidnightContract(
    "contract-eip-20",
    "contract.json", // use common contract.json
    { networkId: midnightNetworkConfig.id },
  )
  : null;

export const midnightAdapter = midnightContractData
  ? new MidnightAdapter(
    midnightContractData.contractAddress,
    midnightNetworkConfig.walletSeed!,
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
      zkConfigPath: midnightContractData.zkConfigPath,
      privateStateStoreName: "simpletoken-private-state", // Local LevelDB store
      // Keep in sync with the contract deploy config / interact scripts
      privateStateId: "simpleTokenPrivateState", // On-chain contract ID (must match deploy.ts)
      walletNetworkId: midnightNetworkConfig.id,
      contractJoinTimeoutSeconds: 300, // Increase timeout to 5 minutes for private state sync
      walletFundingTimeoutSeconds: 300, // Increase wallet funding timeout to 5 minutes
    },
    new SimpleToken.Contract(witnesses),
    witnesses,
    midnightContractData.contractInfo,
    "parallelMidnight",
  )
  : undefined;

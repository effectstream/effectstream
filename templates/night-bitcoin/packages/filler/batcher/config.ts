import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
import {
  FileStorage,
  type BatcherConfig,
  MidnightAdapter,
} from "@paimaexample/batcher";
import { Contract, witnesses } from "@night-bitcoin/midnight-contract-unshielded-erc20/src/managed/unshielded-erc20/contract/index.ts";
import { midnightNetworkConfig } from "@paimaexample/midnight-contracts/midnight-env";

const isEnvTrue = (key: string) => ["true", "1", "yes", "y"].includes((Deno.env.get(key) || "").toLowerCase());
const midnight_enabled = !isEnvTrue("DISABLE_MIDNIGHT");

const batchIntervalMs = 1000;

const midnightContractData = midnight_enabled
  ? readMidnightContract(
    "unshielded-erc20",
    {
      networkId: midnightNetworkConfig.id,
    },
  )
  : null;

const midnightAdapter = midnightContractData
  ? new MidnightAdapter(
    midnightContractData.contractAddress,
    midnightNetworkConfig.walletSeed!,
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
      zkConfigPath: midnightContractData.zkConfigPath,
      privateStateStoreName: "unshielded-erc20-private-state",
      privateStateId: "unshielded_erc20State",
      contractJoinTimeoutSeconds: 300,
      walletFundingTimeoutSeconds: 300,
      walletNetworkId: midnightNetworkConfig.id,
    },
    new Contract(witnesses),
    witnesses,
    midnightContractData.contractInfo,
    "parallelMidnight",
  )
  : undefined;

export const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: {
    midnight: midnightAdapter,
  },
  defaultTarget: "bitcoin",
  namespace: "",
  batchingCriteria: {
    midnight: { criteriaType: "time", timeWindowMs: batchIntervalMs },
    bitcoin: { criteriaType: "hybrid", timeWindowMs: batchIntervalMs, maxBatchSize: 5 },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port: Number(Deno.env.get("BATCHER_PORT") ?? "3334"),
};

export const storage = new FileStorage("./batcher-data");

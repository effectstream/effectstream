import { contractAddressesEvmMain } from "@example-evm-midnight/evm-contracts";
import {
  FileStorage,
  type BatcherConfig,
  PaimaL2DefaultAdapter,
  MidnightAdapter,
} from "@paimaexample/batcher";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
import { Counter, witnesses } from "@example-evm-midnight/my-midnight-contract";
import { midnightNetworkConfig } from "@paimaexample/midnight-contracts/midnight-env";

const isEnvTrue = (key: string) => ["true", "1", "yes", "y"].includes((process.env[key] || "").toLowerCase());
const midnight_enabled = !isEnvTrue("DISABLE_MIDNIGHT");

const batchIntervalMs = 1000;

const paimaL2Address = (contractAddressesEvmMain() as any)["chain31337"]?.[
  "PaimaL2ContractModule#MyPaimaL2Contract"
] || (contractAddressesEvmMain() as any)["chain421614"]?.["PaimaL2ContractModule#MyPaimaL2Contract"] as `0x${string}`;

const paimaSyncProtocolName = "mainEvmRPC";
const batcherPrivateKey = process.env.EVM_PRIVATE_KEY ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

// Defaults consistent with local template usage
const paimaL2Fee = 0n; // Old batcher defaulted to 0 for local dev
const port = Number(process.env.BATCHER_PORT ?? "3334");

// EVM PaimaL2 adapter mirroring batcher-start.ts configuration
const paimaL2 = new PaimaL2DefaultAdapter(
  paimaL2Address,
  batcherPrivateKey,
  paimaL2Fee,
  paimaSyncProtocolName,
);

// Midnight adapter configuration
const midnightContractData = midnight_enabled
  ? readMidnightContract(
    "contract-round-value",
    { networkId: midnightNetworkConfig.id },
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
      privateStateStoreName: "counter-private-state",
      privateStateId: "counterPrivateState",
      contractJoinTimeoutSeconds: 300,
      walletFundingTimeoutSeconds: 300,
      walletNetworkId: midnightNetworkConfig.id,
    },
    new Counter.Contract(witnesses),
    witnesses,
    midnightContractData.contractInfo,
    "parallelMidnight",
  )
  : undefined;

export const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: {
    paimaL2,
    ...(midnightAdapter ? { midnight: midnightAdapter } : {}),
  },
  defaultTarget: "paimaL2",
  namespace: "",
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
    ...(midnightAdapter ? { midnight: { criteriaType: "time", timeWindowMs: batchIntervalMs } } : {}),
  },
  // TODO: rename to wait-effectstream-processed
  confirmationLevel: "wait-effectstream-processed", // Connector expectation
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

export const storage = new FileStorage("./batcher-data");

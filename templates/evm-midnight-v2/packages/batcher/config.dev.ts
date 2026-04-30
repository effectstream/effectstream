import { contractAddressesEvmMain } from "@evm-midnight/contracts-evm";
import {
  FileStorage,
  type BatcherConfig,
  EffectstreamL2DefaultAdapter,
  MidnightAdapter,
} from "@effectstream/batcher-sdk";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { Counter, witnesses } from "@evm-midnight/midnight-contract";

const batchIntervalMs = 1000;

const paimaL2Address = (contractAddressesEvmMain() as any)["chain31337"]?.[
  "PaimaL2ContractModule#MyPaimaL2Contract"
] as `0x${string}`;

const paimaSyncProtocolName = "mainEvmRPC";
const batcherPrivateKey = process.env.EVM_PRIVATE_KEY ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const paimaL2Fee = 0n;
const port = Number(process.env.BATCHER_PORT ?? "3334");

const paimaL2 = new EffectstreamL2DefaultAdapter(
  paimaL2Address,
  batcherPrivateKey,
  paimaL2Fee,
  paimaSyncProtocolName,
);

const midnightContractData = readMidnightContract(
  "contract-round-value",
  { networkId: midnightNetworkConfig.id },
);

const midnightAdapter = new MidnightAdapter(
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
);

export const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: {
    paimaL2,
    midnight: midnightAdapter,
  },
  defaultTarget: "paimaL2",
  namespace: "",
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
    midnight: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

export const storage = new FileStorage("./batcher-data");

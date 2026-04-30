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

const batcherPrivateKey = process.env.EVM_PRIVATE_KEY;
if (!batcherPrivateKey) {
  throw new Error("EVM_PRIVATE_KEY is required for mainnet batcher");
}

type ContractAddressBook = Record<string, Record<string, `0x${string}`>>;
const contractAddressBook = contractAddressesEvmMain() as ContractAddressBook;
const paimaL2Address = contractAddressBook["chain42161"]?.[
  "PaimaL2ContractModule#MyPaimaL2Contract"
];
if (!paimaL2Address) {
  throw new Error("PaimaL2 contract address not found for chain42161");
}

const paimaSyncProtocolName = "mainEvmRPC";
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
  { networkId: "mainnet" },
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

import {
  FileStorage,
  MidnightAdapter,
  MidnightBatchDataBuilder,
  type PaimaBatcherConfig,
  DefaultBatchDataBuilder,
} from "@paimaexample/batcher";
import { readMidnightContract } from "@multi-chain-transfer/midnight-contracts";
import { SimpleToken, witnesses } from "@multi-chain-transfer/midnight-contracts/simpletoken";
import { NetworkId } from "@midnight-ntwrk/compact-runtime";
import * as path from "@std/path";
import { hardhat } from "viem/chains";
import type { EvmAddress, EvmPrivateKey } from "@paimaexample/utils";
import { ERC1155Adapter } from "./erc1155-adapter.ts";
import { contractAddressesEvmMain } from "@multi-chain-transfer/evm-contracts";

const batchIntervalMs = 1000;
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const { contractInfo, contractAddress } = readMidnightContract();
const zkConfigPath = path.resolve(
  "../../shared",
  "contracts",
  "midnight",
  "contract-eip-20",
  "src",
  "managed",
  "simpletoken",
);

const midnightAdapterConfig = {
  indexer: "http://localhost:8088/api/v1/graphql",
  indexerWS: "ws://localhost:8088/api/v1/graphql/ws",
  node: "http://localhost:9944",
  proofServer: "http://localhost:6300",
  zkConfigPath,
  privateStateStoreName: "simpletoken-private-state", // Local LevelDB store
  privateStateId: "simpleTokenPrivateState", // On-chain contract ID (must match deploy.ts)
}

const midnightAdapter = new MidnightAdapter(
  contractAddress,
  GENESIS_MINT_WALLET_SEED,
  midnightAdapterConfig,
  new SimpleToken.Contract(witnesses),
  witnesses,
  contractInfo,
  NetworkId.Undeployed,
  "midnight",
);

const midnightBatchBuilder = new MidnightBatchDataBuilder();

// ERC1155 adapter configuration
const erc1155Address = contractAddressesEvmMain()["chain31337"]["Erc1155DevModule#MCT_ERC1155"] as EvmAddress;
const batcherPrivateKey = Deno.env.get("BATCHER_PRIVATE_KEY") as EvmPrivateKey;

const erc1155Adapter = new ERC1155Adapter(
  erc1155Address,
  batcherPrivateKey,
  hardhat,
  "evm",
  10000,
);

const defaultBatchBuilder = new DefaultBatchDataBuilder();

export const config: PaimaBatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { 
    midnight: midnightAdapter,
    evm: erc1155Adapter,
  },
  defaultTarget: "midnight",
  namespace: "",
  batchingCriteria: {
    midnight: { criteriaType: "size", maxBatchSize: 1 },
    evm: { criteriaType: "size", maxBatchSize: 1 },
  },
  confirmationLevel: "wait-paima-processed", // Connector expectation
  batchBuilding: {
    maxSize: 10000, // Connector expectation
    targetBuilders: {
      midnight: midnightBatchBuilder,
      evm: defaultBatchBuilder,
    },
  },
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

export const storage = new FileStorage("./batcher-data");

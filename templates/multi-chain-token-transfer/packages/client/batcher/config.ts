import {
  FileStorage,
  MidnightAdapter,
  MidnightBatchBuilderLogic,
  type PaimaBatcherConfig,
  DefaultBatchBuilderLogic,
} from "@effectstream/batcher";
import { readMidnightContract } from "@multi-chain-transfer/midnight-contracts";
import { MultiChainMultiToken, witnesses } from "@multi-chain-transfer/midnight-contracts/multichain_multitoken";
import { NetworkId } from "@midnight-ntwrk/compact-runtime";
import { hardhat } from "viem/chains";
import type { EvmAddress, EvmPrivateKey } from "@effectstream/utils";
import { ERC1155CustomAdapter } from "./erc1155-adapter.ts";
import { contractAddressesEvmMain } from "@multi-chain-transfer/evm-contracts";

const batchIntervalMs = 1000;
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const { contractInfo, contractAddress, zkConfigPath } = readMidnightContract();

const midnightAdapterConfig = {
  indexer: "http://localhost:8088/api/v1/graphql",
  indexerWS: "ws://localhost:8088/api/v1/graphql/ws",
  node: "http://localhost:9944",
  proofServer: "http://localhost:6300",
  zkConfigPath,
  privateStateStoreName: "multichain_multitoken-private-state", // Local LevelDB store
  privateStateId: "multiChainMultiTokenPrivateState", // On-chain contract ID (must match deploy.ts)
}

const midnightAdapter = new MidnightAdapter(
  contractAddress,
  GENESIS_MINT_WALLET_SEED,
  midnightAdapterConfig,
  new MultiChainMultiToken.Contract(witnesses),
  witnesses,
  contractInfo,
  NetworkId.Undeployed,
  "parallelMidnight",
);

// ERC1155 adapter configuration
const erc1155Address = contractAddressesEvmMain()["chain31337"]["Erc1155DevModule#MCT_ERC1155"] as EvmAddress;
const batcherPrivateKey = (Deno.env.get("BATCHER_PRIVATE_KEY") ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;

const erc1155Adapter = new ERC1155CustomAdapter(
  erc1155Address,
  batcherPrivateKey,
  hardhat,
  "mainEvmRPC",
  10000,
);

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
  confirmationLevel: "wait-effectstream-processed", // Connector expectation
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

export const storage = new FileStorage("./batcher-data");

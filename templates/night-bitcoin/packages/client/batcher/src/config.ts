import {
  FileStorage,
  MidnightAdapter,
  type BatcherConfig,
} from "@paimaexample/batcher";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
import { SimpleToken, witnesses } from "@night-bitcoin/midnight-contract-unshielded-erc20";
import { NetworkId } from "@midnight-ntwrk/compact-runtime";

const batchIntervalMs = 1000;
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const { contractInfo, contractAddress, zkConfigPath } = readMidnightContract("unshielded-erc20", "contract-unshielded-erc20.json");

const midnightAdapterConfig = {
  indexer: "http://localhost:8088/api/v1/graphql",
  indexerWS: "ws://localhost:8088/api/v1/graphql/ws",
  node: "http://localhost:9944",
  proofServer: "http://localhost:6300",
  zkConfigPath,
  privateStateStoreName: "multichain_multitoken-private-state", // Local LevelDB store
  privateStateId: "multiChainMultiTokenPrivateState", // On-chain contract ID (must match deploy.ts)
}

export const midnightAdapter = new MidnightAdapter(
  contractAddress,
  GENESIS_MINT_WALLET_SEED,
  midnightAdapterConfig,
  new SimpleToken.Contract(witnesses),
  witnesses,
  contractInfo,
  NetworkId.Undeployed,
  "parallelMidnight",
);

export const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  namespace: "",
  confirmationLevel: "wait-effectstream-processed", // Connector expectation
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

export const storage = new FileStorage("./batcher-data");

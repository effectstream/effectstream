import {
  FileStorage,
  MidnightAdapter,
  type PaimaBatcherConfig,
} from "@paimaexample/batcher";
import { readMidnightContract } from "@multi-chain-transfer/midnight-contracts";
import { SimpleToken, witnesses } from "@multi-chain-transfer/midnight-contracts/simpletoken";
import { NetworkId } from "@midnight-ntwrk/compact-runtime";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const batchIntervalMs = 1000;
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const { contractInfo, contractAddress } = readMidnightContract();
const zkConfigPath = path.resolve(
  import.meta.url,
  "../../shared",
  "contracts",
  "midnight",
  "contract-round-value",
  "src",
  "managed",
  "simpletoken",
);

const midnightAdapterConfig = {
  indexer: "http://localhost:8088",
  indexerWS: "ws://localhost:8088",
  node: "ws://localhost:9944",
  proofServer: "http://localhost:6300",
  zkConfigPath,
  privateStateStoreName: "simpletoken-private-state",
}

const midnightAdapter = new MidnightAdapter(
  contractAddress,
  GENESIS_MINT_WALLET_SEED,
  midnightAdapterConfig,
  SimpleToken.Contract,
  witnesses,
  contractInfo,
  NetworkId.Undeployed,
  "midnight-graphql-parallel",
);

export const config: PaimaBatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { midnight: midnightAdapter },
  defaultTarget: "midnight",
  namespace: "",
  batchingCriteria: {
    midnight: { criteriaType: "size", maxBatchSize: 1 },
  },
  confirmationLevel: "wait-paima-processed", // Connector expectation
  batchBuilding: { maxSize: 10000 }, // Connector expectation
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

export const storage = new FileStorage("./batcher-data");

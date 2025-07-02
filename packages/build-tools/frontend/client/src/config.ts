import type { ChainConfig, PaimaChains } from "./types/index.ts";

// TODO: This should passed through the config
// Initial configuration for each chain
export const initialChainConfigs: PaimaChains = {
  Paima: {
    type: "EVM",
    name: "Paima Engine",
    blockTime: 300,
    color: "#667eea",
    blocks: [],
    currentBlock: 1000000,
    rpcEndpoint: "http://127.0.0.1:9999/rpc/evm",
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
  },
  evmMain: {
    type: "EVM",
    name: "Arbitrum",
    blockTime: 300,
    color: "#4caf50",
    blocks: [],
    currentBlock: 500000,
    rpcEndpoint: "http://127.0.0.1:8545/rpc/evm",
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
  },
  evmParallel: {
    type: "EVM",
    name: "Ethereum L1",
    blockTime: 12000,
    color: "#ff9800",
    blocks: [],
    currentBlock: 750000,
    rpcEndpoint: "http://127.0.0.1:8546/rpc/evm",
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
  },
  cardano: {
    type: "Cardano",
    name: "Cardano",
    blockTime: 20000,
    color: "#2196f3",
    blocks: [],
    currentBlock: 300000,
  },
  midnight: {
    type: "Midnight",
    name: "Midnight",
    blockTime: 6000,
    color: "#9c27b0",
    blocks: [],
    currentBlock: 150000,
  },
};

// TODO These must be parametrised
export const CONFIG_ENDPOINT = "http://127.0.0.1:9999/config";
export const PRIMITIVES_ENDPOINT = "http://127.0.0.1:9999/primitives";
export const TABLES_ENDPOINT = "http://127.0.0.1:9999/tables";
export const PRIMITIVES_SCHEMA_ENDPOINT =
  "http://127.0.0.1:9999/primitives-schema";
export const TABLE_SCHEMA_ENDPOINT = "http://127.0.0.1:9999/table-schema";
export const BATCHER_ENDPOINT = "http://localhost:3334/send-input";
export const BATCHER_OPENAPI_URL = "http://localhost:3334/documentation";
export const ENGINE_OPENAPI_URL = "http://localhost:9999/documentation";
export const DOCUMENTATION_URL = "http://127.0.0.1:10600/";

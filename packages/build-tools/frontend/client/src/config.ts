import type { ChainConfig, PaimaChains } from "./types/index.ts";
import { ENV } from "@paima/utils";

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
    rpcEndpoint: `http://127.0.0.1:${ENV.PAIMA_API_PORT}/rpc/evm`,
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

export const CONFIG_ENDPOINT = `http://127.0.0.1:${ENV.PAIMA_API_PORT}/config`;
export const PRIMITIVES_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/primitives`;
export const TABLES_ENDPOINT = `http://127.0.0.1:${ENV.PAIMA_API_PORT}/tables`;
export const GRAMMAR_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/grammar`;
export const SCHEDULED_DATA_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/scheduled-data`;
export const PRIMITIVES_SCHEMA_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/primitives-schema`;
export const TABLE_SCHEMA_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/table-schema`;
export const BATCHER_ENDPOINT =
  `http://localhost:${ENV.BATCHER_PORT}/send-input`;
export const BATCHER_OPENAPI_URL =
  `http://localhost:${ENV.BATCHER_PORT}/documentation`;
export const ENGINE_OPENAPI_URL =
  `http://localhost:${ENV.PAIMA_API_PORT}/documentation`;
export const DOCUMENTATION_URL = `http://127.0.0.1:${ENV.DOCS_PORT}/`;

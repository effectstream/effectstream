const BASE_URL_API = import.meta.env.VITE_API_URL || "http://127.0.0.1:9999";
const BASE_URL_BATCHER = import.meta.env.VITE_BATCHER_URL || "http://localhost:3334";
const BASE_URL_DOCS = "http://127.0.0.1:10600";

// These can be overridden by env vars if needed
export const BASE_URL_MIDNIGHT_INDEXER = import.meta.env.VITE_MIDNIGHT_INDEXER_HTTP || `http://127.0.0.1:8088`;
export const BASE_WS_MIDNIGHT_INDEXER = import.meta.env.VITE_MIDNIGHT_INDEXER_WS || `ws://127.0.0.1:8088`;
export const BASE_URL_MIDNIGHT_NODE = import.meta.env.VITE_MIDNIGHT_NODE_HTTP || `http://127.0.0.1:9944`;
export const BASE_URL_PROOF_SERVER = import.meta.env.VITE_MIDNIGHT_PROOF_SERVER_URL || `http://127.0.0.1:6300`;
export const MIDNIGHT_NETWORK_ID = import.meta.env.VITE_MIDNIGHT_NETWORK_ID || "undeployed";

export const getMidnightNodeUrl = async (): Promise<string> => {
  return BASE_URL_MIDNIGHT_NODE;
};

export const BASE_URL_MIDNIGHT_INDEXER_API =
  `${BASE_URL_MIDNIGHT_INDEXER}/api/v3/graphql`;
export const BASE_URL_MIDNIGHT_INDEXER_WS =
  `${BASE_WS_MIDNIGHT_INDEXER}/api/v3/graphql/ws`;

export const CONFIG_ENDPOINT = `${BASE_URL_API}/config`;
export const PRIMITIVES_ENDPOINT = `${BASE_URL_API}/primitives`;
export const TABLES_ENDPOINT = `${BASE_URL_API}/tables`;
export const GRAMMAR_ENDPOINT = `${BASE_URL_API}/grammar`;
export const SCHEDULED_DATA_ENDPOINT = `${BASE_URL_API}/scheduled-data`;
export const PRIMITIVES_SCHEMA_ENDPOINT = `${BASE_URL_API}/primitives-schema`;
export const TABLE_SCHEMA_ENDPOINT = `${BASE_URL_API}/table-schema`;
export const BLOCK_HEIGHTS_ENDPOINT = `${BASE_URL_API}/block-heights`;
export const ENGINE_OPENAPI_URL = `${BASE_URL_API}/documentation`;
export const ADDRESSES_ENDPOINT = `${BASE_URL_API}/addresses`;
export const BATCHER_ENDPOINT = import.meta.env.VITE_BATCHER_URL ||
  "http://localhost:3000/api";
export const BATCHER_OPENAPI_URL = `${BASE_URL_BATCHER}/documentation`;
// TODO Temporal documentation url
export const DOCUMENTATION_URL =
  `https://effectstream.github.io/docs/`;

const RPC_EFFECTSTREAM = `${BASE_URL_API}/rpc/evm`;
const RPC_ARBITRUM = "http://127.0.0.1:8545/rpc/evm";
// TODO: This should passed through the config
// Initial configuration for each chain
export const initialChainConfigs = {
  Effectstream: {
    type: "EVM",
    name: "Effectstream",
    blockTime: 300,
    color: "#667eea",
    blocks: [],
    currentBlock: 1000000,
    rpcEndpoint: RPC_EFFECTSTREAM,
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
    rpcEndpoint: RPC_ARBITRUM,
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
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

export { paimaEngineConfig } from "./PaimaEngineConfig.ts";

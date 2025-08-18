const ENV = {
  PAIMA_API_PORT: 9999,
  BATCHER_PORT: 3334,
  DOCS_PORT: 10600,
  PAIMA_EXPLORER_PORT: 10599,
};

const BASE_URL_API = `http://127.0.0.1:${ENV.PAIMA_API_PORT}`;
const BASE_URL_BATCHER = `http://localhost:${ENV.BATCHER_PORT}`;
const BASE_URL_DOCS = `http://127.0.0.1:${ENV.DOCS_PORT}`;
const BASE_URL_MIDNIGHT_INDEXER = `http://127.0.0.1:8088`;
const BASE_WS_MIDNIGHT_INDEXER = `ws://127.0.0.1:8088`;

export const BASE_URL_MIDNIGHT_NODE = `http://127.0.0.1:9944`;
export const BASE_URL_PROOF_SERVER = `http://127.0.0.1:6300`;
export const BASE_URL_MIDNIGHT_INDEXER_API =
  `${BASE_URL_MIDNIGHT_INDEXER}/api/v1/graphql`;
export const BASE_URL_MIDNIGHT_INDEXER_WS =
  `${BASE_WS_MIDNIGHT_INDEXER}/api/v1/graphql/ws`;

export const CONFIG_ENDPOINT = `${BASE_URL_API}/config`;
export const PRIMITIVES_ENDPOINT = `${BASE_URL_API}/primitives`;
export const TABLES_ENDPOINT = `${BASE_URL_API}/tables`;
export const GRAMMAR_ENDPOINT = `${BASE_URL_API}/grammar`;
export const SCHEDULED_DATA_ENDPOINT = `${BASE_URL_API}/scheduled-data`;
export const PRIMITIVES_SCHEMA_ENDPOINT = `${BASE_URL_API}/primitives-schema`;
export const TABLE_SCHEMA_ENDPOINT = `${BASE_URL_API}/table-schema`;
export const ENGINE_OPENAPI_URL = `${BASE_URL_API}/documentation`;
export const ADDRESSES_ENDPOINT = `${BASE_URL_API}/addresses`;
export const BATCHER_ENDPOINT = `${BASE_URL_BATCHER}/send-input`;
export const BATCHER_OPENAPI_URL = `${BASE_URL_BATCHER}/documentation`;
export const DOCUMENTATION_URL = `${BASE_URL_DOCS}/`;

const RPC_PAIMA = `http://127.0.0.1:${ENV.PAIMA_API_PORT}/rpc/evm`;
const RPC_ARBITRUM = "http://127.0.0.1:8545/rpc/evm";
// TODO: This should passed through the config
// Initial configuration for each chain
export const initialChainConfigs = {
  Paima: {
    type: "EVM",
    name: "Paima Engine",
    blockTime: 300,
    color: "#667eea",
    blocks: [],
    currentBlock: 1000000,
    rpcEndpoint: RPC_PAIMA,
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
  // evmParallel: {
  //   type: "EVM",
  //   name: "Ethereum L1",
  //   blockTime: 12000,
  //   color: "#ff9800",
  //   blocks: [],
  //   currentBlock: 750000,
  //   rpcEndpoint: "http://127.0.0.1:8546/rpc/evm",
  //   latestBlockNumber: 0,
  //   previousLatestBlockNumber: 0,
  //   isConnected: false,
  // },
  // cardano: {
  //   type: "Cardano",
  //   name: "Cardano",
  //   blockTime: 20000,
  //   color: "#2196f3",
  //   blocks: [],
  //   currentBlock: 300000,
  // },
  midnight: {
    type: "Midnight",
    name: "Midnight",
    blockTime: 6000,
    color: "#9c27b0",
    blocks: [],
    currentBlock: 150000,
  },
};

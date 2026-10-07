const BASE_URL_API = import.meta.env.VITE_API_URL || "http://127.0.0.1:9999";
const BASE_URL_BATCHER = import.meta.env.VITE_BATCHER_URL || "http://localhost:3334";
const BASE_URL_DOCS = "http://127.0.0.1:10600";

export const MIDNIGHT_NETWORK_ID = import.meta.env.VITE_MIDNIGHT_NETWORK_ID || "undeployed";

export type MidnightFrontendNetworkUrls = {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
};

export function resolveMidnightLocalNetworkUrls(): MidnightFrontendNetworkUrls {
  // Resolve these lazily. `connectMidnightLocalWallet` calls this only after
  // rejecting every public network ID, so public selections never read or
  // construct endpoints for the deterministic local wallet.
  const indexer = import.meta.env.VITE_MIDNIGHT_INDEXER_HTTP ||
    "http://127.0.0.1:8088";
  const indexerWS = import.meta.env.VITE_MIDNIGHT_INDEXER_WS ||
    "ws://127.0.0.1:8088";

  return {
    indexer: `${indexer}/api/v3/graphql`,
    indexerWS: `${indexerWS}/api/v3/graphql/ws`,
    node: import.meta.env.VITE_MIDNIGHT_NODE_HTTP || "http://127.0.0.1:9944",
    proofServer: import.meta.env.VITE_MIDNIGHT_PROOF_SERVER_URL ||
      "http://127.0.0.1:6300",
  };
}

const UNDEPLOYED_GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

export function assertMidnightLocalUndeployed(
  networkId: string,
): asserts networkId is "undeployed" {
  if (networkId !== "undeployed") {
    throw new Error(
      `MidnightLocal supports only the undeployed local network. Selected "${networkId}" requires a supported external signer/profile; no public-network signer is configured.`,
    );
  }
}

export function resolveUndeployedGenesisSeed(networkId: string): string {
  assertMidnightLocalUndeployed(networkId);
  return UNDEPLOYED_GENESIS_MINT_WALLET_SEED;
}

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

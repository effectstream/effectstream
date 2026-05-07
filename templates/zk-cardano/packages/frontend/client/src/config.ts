export const BASE_URL_API = import.meta.env.VITE_API_URL || "http://127.0.0.1:9999";
export const BASE_URL_BATCHER = import.meta.env.VITE_BATCHER_URL || "http://localhost:3334";

export const BASE_URL_MIDNIGHT_INDEXER = import.meta.env.VITE_MIDNIGHT_INDEXER_HTTP || "http://127.0.0.1:8088";
export const BASE_WS_MIDNIGHT_INDEXER = import.meta.env.VITE_MIDNIGHT_INDEXER_WS || "ws://127.0.0.1:8088";
export const BASE_URL_MIDNIGHT_NODE = import.meta.env.VITE_MIDNIGHT_NODE_HTTP || "http://127.0.0.1:9944";
export const BASE_URL_PROOF_SERVER = import.meta.env.VITE_MIDNIGHT_PROOF_SERVER_URL || "http://127.0.0.1:6300";
export const MIDNIGHT_NETWORK_ID = import.meta.env.VITE_MIDNIGHT_NETWORK_ID || "undeployed";

export const getMidnightNodeUrl = async (): Promise<string> => {
  return BASE_URL_MIDNIGHT_NODE;
};

export const BASE_URL_MIDNIGHT_INDEXER_API =
  `${BASE_URL_MIDNIGHT_INDEXER}/api/v3/graphql`;
export const BASE_URL_MIDNIGHT_INDEXER_WS =
  `${BASE_WS_MIDNIGHT_INDEXER}/api/v3/graphql/ws`;

export const BLOCK_HEIGHTS_ENDPOINT = `${BASE_URL_API}/block-heights`;

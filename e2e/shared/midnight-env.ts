const env = (key: string, fallback: string): string =>
  Deno.env.get(key)?.trim() || fallback;

const DEFAULT_INDEXER_HTTP = "http://127.0.0.1:8088/api/v3/graphql";
const DEFAULT_INDEXER_WS = "ws://127.0.0.1:8088/api/v3/graphql/ws";
const DEFAULT_NODE_HTTP = "http://127.0.0.1:9944";
const DEFAULT_PROOF_SERVER = "http://127.0.0.1:6300";
const DEFAULT_NETWORK_ID = "undeployed";

export const midnightNetworkId = (Deno.env.get("MIDNIGHT_NETWORK_ID") ??
  DEFAULT_NETWORK_ID).toLowerCase();

export const midnightNetworkConfig = {
  id: midnightNetworkId,
  indexer: env("MIDNIGHT_INDEXER_HTTP", DEFAULT_INDEXER_HTTP),
  indexerWS: env("MIDNIGHT_INDEXER_WS", DEFAULT_INDEXER_WS),
  node: env("MIDNIGHT_NODE_HTTP", DEFAULT_NODE_HTTP),
  proofServer: env("MIDNIGHT_PROOF_SERVER", DEFAULT_PROOF_SERVER),
};

export type MidnightNetworkConfig = typeof midnightNetworkConfig;


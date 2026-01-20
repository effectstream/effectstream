import type { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";

const env = (key: string, fallback?: string): string =>
  process.env[key]?.trim() || fallback || "";

const envFirst = (keys: string[], fallback?: string): string =>
  keys.map((key) => process.env[key]?.trim()).find((value) => !!value) ||
  fallback ||
  "";

const EFFECTSTREAM_ENV = process.env.EFFECTSTREAM_ENV || "local";
export const isTestnet = EFFECTSTREAM_ENV === "testnet";

// Midnight Network default configurations
const CONFIGS = {
  local: {
    indexer: "http://127.0.0.1:8088/api/v3/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
    node: "http://127.0.0.1:9944",
    networkId: "undeployed" as NetworkId.NetworkId,
    // In local mode, the Genesis Wallet Seed determines the initial funded wallet
    genesisWalletSeed:
      "0000000000000000000000000000000000000000000000000000000000000001",
  },
  testnet: {
    indexer: "https://indexer.preview.midnight.network/api/v3/graphql",
    indexerWS:
      "wss://indexer.preview.midnight.network/api/v3/graphql/ws",
    node: "https://rpc.preview.midnight.network",
    networkId: "preview" as NetworkId.NetworkId,
  },
} as const;

const currentDefaults = isTestnet ? CONFIGS.testnet : CONFIGS.local;

export const midnightNetworkId = env(
  "MIDNIGHT_NETWORK_ID",
  currentDefaults.networkId,
).toLowerCase();

/**
 * 1. NETWORK GENESIS PARAMETER
 * This is the hash of the genesis block, required to connect to the network.
 *
 * - Local Mode: Defaults to being derived from the local Genesis Wallet Seed.
 * - Testnet Mode: We default to empty string as we don't have a fixed genesis hash for testnets yet.
 */
const getGenesisBlockHash = () => {
  if (isTestnet) return "";
  // In local mode, the genesis block hash corresponds to the genesis wallet seed (prefixed with 0x)
  return "0x" + CONFIGS.local.genesisWalletSeed;
};

/**
 * 2. WALLET SEED (MIDNIGHT_WALLET_SEED)
 * This is the seed used to derive the wallet keys for signing transactions.
 *
 * - Local Mode: Defaults to the Genesis Wallet Seed (the initially funded account).
 * - Testnet Mode: User MUST provide their own funded wallet seed.
 */
const getFallbackWalletSeed = () => {
  if (isTestnet) return "";
  // In local mode, use the Genesis Wallet Seed
  return CONFIGS.local.genesisWalletSeed;
};

const resolvedProofServer = envFirst(
  ["MIDNIGHT_PROOF_SERVER_URL", "MIDNIGHT_PROOF_SERVER"],
  "http://127.0.0.1:6300",
);

export const midnightNetworkConfig = {
  id: midnightNetworkId as NetworkId.NetworkId,
  indexer: env("MIDNIGHT_INDEXER_HTTP", currentDefaults.indexer),
  indexerWS: env("MIDNIGHT_INDEXER_WS", currentDefaults.indexerWS),
  node: env("MIDNIGHT_NODE_HTTP", currentDefaults.node),
  proofServer: resolvedProofServer,
  // Wallet signing parameter
  walletSeed: env("MIDNIGHT_WALLET_SEED", getFallbackWalletSeed()),
};

export const isExternalProofServerConfigured = !!envFirst([
  "MIDNIGHT_PROOF_SERVER_URL",
]);

export type MidnightNetworkConfig = typeof midnightNetworkConfig;

// Validation for testnet
if (isTestnet) {
  if (!midnightNetworkConfig.walletSeed) {
    console.warn(
      "WARNING: MIDNIGHT_WALLET_SEED is not set but EFFECTSTREAM_ENV=testnet. A wallet seed is mandatory for non-local networks.",
    );
  }
}

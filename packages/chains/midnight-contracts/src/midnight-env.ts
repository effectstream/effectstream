import type { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { mnemonicToSeed } from "@scure/bip39";
import { Buffer } from "node:buffer";
import { getEnv } from "@effectstream/utils/runtime";

const getEnvValue = (key: string): string | undefined => {
  return getEnv(key);
};

const env = (key: string | string[], fallback?: string): string => {
  if (typeof key === 'string') {
    return getEnvValue(key)?.trim() || fallback || "";
  }
  if (Array.isArray(key)) {
    return key.map((k) => getEnvValue(k)?.trim()).find((value) => !!value) ||
    fallback ||
    "";
  }
  throw new Error('Invalid key type');
}  

type NetworkConfig = {
    indexer: string;
    indexerWS: string;
    node: string;
    proofServer: string;
    networkId: NetworkId.NetworkId;
    genesisWalletSeed: string;
}

// Midnight Network default configurations
const undeployedNetworkConfig: NetworkConfig = {
    indexer: "http://127.0.0.1:8088/api/v3/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
    node: "http://127.0.0.1:9944",
    networkId: "undeployed" as NetworkId.NetworkId,
    proofServer: "http://127.0.0.1:6300",
    // In local mode, the Genesis Wallet Seed determines the initial funded wallet
    genesisWalletSeed: "0000000000000000000000000000000000000000000000000000000000000001",
} as const;

const previewNetworkConfig: NetworkConfig = {
    indexer: "https://indexer.preview.midnight.network/api/v3/graphql",
    indexerWS: "wss://indexer.preview.midnight.network/api/v3/graphql/ws",
    node: "https://rpc.preview.midnight.network",
    proofServer: "http://127.0.0.1:6300",
    networkId: "preview" as NetworkId.NetworkId,
    genesisWalletSeed: '',
} as const;

let selectedNetworkConfig: NetworkConfig;
switch (env("MIDNIGHT_NETWORK_ID")) {
  case "preview":
    selectedNetworkConfig = previewNetworkConfig;
    break;
  case "undeployed":
  default:
    selectedNetworkConfig = undeployedNetworkConfig;
    break;
}

let walletSeed: string;
if (env("MIDNIGHT_WALLET_SEED")) {
  walletSeed = env("MIDNIGHT_WALLET_SEED");
} else if (env("MIDNIGHT_WALLET_MNEMONIC")) {
  walletSeed = Buffer.from(await mnemonicToSeed(env("MIDNIGHT_WALLET_MNEMONIC"))).toString('hex');
} else {
  walletSeed = selectedNetworkConfig.genesisWalletSeed;
}

export const midnightNetworkConfig = {
  id: selectedNetworkConfig.networkId,
  indexer: env("MIDNIGHT_INDEXER_HTTP", selectedNetworkConfig.indexer),
  indexerWS: env("MIDNIGHT_INDEXER_WS", selectedNetworkConfig.indexerWS),
  node: env("MIDNIGHT_NODE_HTTP", selectedNetworkConfig.node),
  proofServer: env(["MIDNIGHT_PROOF_SERVER_URL", "MIDNIGHT_PROOF_SERVER"], selectedNetworkConfig.proofServer),
  walletSeed,
};

const isLocalProofServer = !!midnightNetworkConfig.proofServer.match(/(localhost|127\.0\.0\.1)/);
export const isExternalProofServerConfigured = !isLocalProofServer;

// Set this using MIDNIGHT_NETWORK_ID=<network-id>
export type MidnightNetworkConfig = typeof midnightNetworkConfig;


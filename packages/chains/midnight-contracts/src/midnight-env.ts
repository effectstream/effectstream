import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
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

export type NetworkConfig = {
    indexer: string;
    indexerWS: string;
    node: string;
    proofServer: string;
    faucetUrl?: string;
    networkId: NetworkId.NetworkId;
    genesisWalletSeed: string;
}

// Midnight Network default configurations
const undeployedNetworkConfig: NetworkConfig = {
    indexer: "http://127.0.0.1:8088/api/v4/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
    node: "http://127.0.0.1:9944",
    networkId: "undeployed" as NetworkId.NetworkId,
    proofServer: "http://127.0.0.1:6300",
    // In local mode, the Genesis Wallet Seed determines the initial funded wallet
    genesisWalletSeed: "0000000000000000000000000000000000000000000000000000000000000001",
} as const;

const deployedNetworkConfig = (networkId: NetworkId.NetworkId): NetworkConfig => ({
    indexer: `https://indexer.${networkId}.midnight.network/api/v4/graphql`,
    indexerWS: `wss://indexer.${networkId}.midnight.network/api/v4/graphql/ws`,
    node: `https://rpc.${networkId}.midnight.network`,
    proofServer: "http://127.0.0.1:6300",
    networkId,
    genesisWalletSeed: '',
});

const stagenetNetworkConfig = Object.freeze({
    indexer: "https://indexer.stagenet.shielded.tools/api/v4/graphql",
    indexerWS: "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
    node: "wss://rpc.stagenet.shielded.tools",
    proofServer: "http://127.0.0.1:6300",
    faucetUrl: "https://faucet.stagenet.shielded.tools/api/drips",
    networkId: "stagenet" as NetworkId.NetworkId,
    genesisWalletSeed: '',
}) satisfies NetworkConfig;

/**
 * Resolve defaults for every wallet-SDK network ID. Only `undeployed` uses
 * loopback services; every deployed or future network ID follows the hosted
 * Midnight endpoint convention instead of being restricted to `stagenet`.
 */
export const defaultMidnightNetworkConfig = (
  networkId: NetworkId.NetworkId,
): NetworkConfig => {
  if (networkId === "undeployed") return undeployedNetworkConfig;
  if (networkId === "stagenet") return stagenetNetworkConfig;
  return deployedNetworkConfig(networkId);
};

const networkId = (env("MIDNIGHT_NETWORK_ID") || "undeployed") as NetworkId.NetworkId;
const selectedNetworkConfig = defaultMidnightNetworkConfig(networkId);

let walletSeed: string;
if (env("MIDNIGHT_WALLET_SEED")) {
  walletSeed = env("MIDNIGHT_WALLET_SEED");
} else if (env("MIDNIGHT_WALLET_MNEMONIC")) {
  const { mnemonicToSeed } = await import("@scure/bip39");
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
  faucetUrl: selectedNetworkConfig.faucetUrl,
  walletSeed,
};

const isLocalProofServer = !!midnightNetworkConfig.proofServer.match(/(localhost|127\.0\.0\.1)/);
export const isExternalProofServerConfigured = !isLocalProofServer;

// Set this using MIDNIGHT_NETWORK_ID=<network-id>
export type MidnightNetworkConfig = typeof midnightNetworkConfig;

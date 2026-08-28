import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { Buffer } from "node:buffer";
import { resolveMidnightNetworkProfile } from "@effectstream/config";
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

/**
 * Add wallet/deployment-only defaults to the config package's pure service
 * profile. The service endpoint table has one owner and this adapter keeps the
 * historical public wallet configuration shape.
 */
export const defaultMidnightNetworkConfig = (
  networkId: NetworkId.NetworkId,
): NetworkConfig => {
  const profile = resolveMidnightNetworkProfile(networkId);
  return {
    indexer: profile.indexerHttpUrl,
    indexerWS: profile.indexerWsUrl,
    node: profile.nodeUrl,
    proofServer: "http://127.0.0.1:6300",
    faucetUrl: profile.faucetUrl,
    networkId: profile.networkId,
    // In local mode, the Genesis Wallet Seed determines the initial funded wallet.
    genesisWalletSeed: networkId === "undeployed"
      ? "0000000000000000000000000000000000000000000000000000000000000001"
      : "",
  };
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

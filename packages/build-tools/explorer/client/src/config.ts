import type { ChainConfig, PaimaChains } from "./types/index.ts";

const ENV = {
  EFFECTSTREAM_API_PORT: import.meta.env.VITE_EFFECTSTREAM_API_PORT,
  BATCHER_PORT: import.meta.env.VITE_BATCHER_PORT,
  DOCS_PORT: import.meta.env.VITE_DOCS_PORT,
  EFFECTSTREAM_EXPLORER_PORT: import.meta.env.VITE_EFFECTSTREAM_EXPLORER_PORT,
  API_KEY_OPEN_ENDPOINTS_EXPLORER: import.meta.env.VITE_API_KEY_OPEN_ENDPOINTS_EXPLORER,
} as const;

/**
 * Fetch wrapper that attaches the explorer API key as x-api-key header.
 * Use this for all requests to protected explorer endpoints.
 */
export function explorerFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (ENV.API_KEY_OPEN_ENDPOINTS_EXPLORER) {
    headers.set("x-api-key", ENV.API_KEY_OPEN_ENDPOINTS_EXPLORER);
  }
  return fetch(url instanceof URL ? url.toString() : url, { ...init, headers });
}


// Define the structure of the config endpoint response
interface ConfigEndpointNetwork {
  name: string;
  type: string;
  chainId?: number;
  id?: number;
  rpcUrls?: {
    default: {
      http: string[];
    };
  };
  nodeUrl?: string;
  blockTimeMS?: number;
}

interface ConfigEndpointSyncProtocol {
  name: string;
  type: string;
  chainUri?: string;
  pollingInterval?: number;
}

interface ConfigEndpointItem {
  networkType: string;
  syncProtocolType: string;
  syncProtocol: ConfigEndpointSyncProtocol;
  network: ConfigEndpointNetwork;
  primitives: any[];
}

interface ConfigEndpointResponse {
  securityNamespace: string | null;
  syncProtocols: ConfigEndpointItem[];
}

let cachedSecurityNamespace: string | null = null;
export function getCachedSecurityNamespace(): string | null {
  return cachedSecurityNamespace;
}

// Color palette for different chain types
const CHAIN_COLORS = {
  paima: "#667eea",
  evm: "#4caf50",
  evmParallel: "#ff9800",
  cardano: "#2196f3",
  midnight: "#9c27b0",
  ntp: "#795548",
};

// Transform config endpoint response to PaimaChains format
export function transformConfigToPaimaChains(
  configData: ConfigEndpointItem[],
): PaimaChains {
  const chains: PaimaChains = {};

  // Filter out NTP chains since we have a hardcoded Paima main
  const filteredConfigData = configData.filter((item) =>
    item.networkType !== "ntp"
  );

  filteredConfigData.forEach((item, index) => {
    const network = item.network;
    const syncProtocol = item.syncProtocol;

    // Generate a unique key for each chain
    let chainKey = network.name;
    if (network.type === "evm" && network.chainId) {
      chainKey = `evm_${network.chainId}`;
    } else if (network.type === "evm" && network.id) {
      chainKey = `evm_${network.id}`;
    }

    // Ensure unique keys
    if (chains[chainKey]) {
      chainKey = `${chainKey}_${index}`;
    }

    // Determine RPC endpoint
    let rpcEndpoint: string | undefined;
    if (network.type === "evm") {
      if (network.rpcUrls?.default?.http?.[0]) {
        rpcEndpoint = network.rpcUrls.default.http[0];
      } else if (syncProtocol.chainUri) {
        rpcEndpoint = syncProtocol.chainUri;
      }
    } else if (network.type === "midnight") {
      // Use nodeUrl for Midnight chains
      rpcEndpoint = network.nodeUrl;
    } else if (network.type === 'avail' || network.type === 'cardano') {
      rpcEndpoint = network.nodeUrl;
    }

    // Determine color based on network type and name
    let color = CHAIN_COLORS.evm; // Default
    if (network.type === "cardano") {
      color = CHAIN_COLORS.cardano;
    } else if (network.type === "midnight") {
      color = CHAIN_COLORS.midnight;
    } else if (network.name.toLowerCase().includes("arbitrum")) {
      color = CHAIN_COLORS.evm;
    } else if (
      network.name.toLowerCase().includes("ethereum") ||
      network.name.toLowerCase().includes("l1")
    ) {
      color = CHAIN_COLORS.evmParallel;
    }

    // Create chain config
    const chainConfig: ChainConfig = {
      type: network.type.toUpperCase(),
      name: network.name,
      blockTime: network.blockTimeMS ?? syncProtocol.pollingInterval ?? undefined,
      color,
      blocks: [],
      currentBlock: network.type === "evm" ? 500000 : 100000, // Default starting block
      rpcEndpoint,
      latestBlockNumber: 0,
      previousLatestBlockNumber: 0,
      isConnected: false,
      protocolName: syncProtocol.name,
    };

    chains[chainKey] = chainConfig;
  });

  return chains;
}

// Function to fetch and transform config
export async function fetchChainConfigs(): Promise<PaimaChains> {
  const response = await fetch(CONFIG_ENDPOINT);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const payload: ConfigEndpointResponse = await response.json();
  cachedSecurityNamespace = payload.securityNamespace;
  const configData: ConfigEndpointItem[] = payload.syncProtocols;
  const dynamicChains = transformConfigToPaimaChains(configData);

  // Always start with hardcoded Paima main as the first element
  const combinedChains: PaimaChains = {
    Paima: {
      type: 'EVM',
      name: 'Paima Engine',
      blockTime:
        configData.find(c => c.syncProtocol.name === 'mainNtp')?.network.blockTimeMS ?? 1000,
      color: '#667eea',
      blocks: [],
      currentBlock: 1000000,
      rpcEndpoint: `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/rpc/evm`,
      latestBlockNumber: 0,
      previousLatestBlockNumber: 0,
      isConnected: false,
    },
    ...dynamicChains,
  };

  return combinedChains;
}

export const CONFIG_ENDPOINT = `http://127.0.0.1:9999/config`;
export const BLOCK_HEIGHTS_ENDPOINT =
  `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/block-heights`;
export const PRIMITIVES_ENDPOINT =
  `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/primitives`;
export const TABLES_ENDPOINT = `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/tables`;
export const GRAMMAR_ENDPOINT =
  `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/grammar`;
export const SCHEDULED_DATA_ENDPOINT =
  `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/scheduled-data`;
export const PRIMITIVES_SCHEMA_ENDPOINT =
  `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/primitives-schema`;
export const TABLE_SCHEMA_ENDPOINT =
  `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/table-schema`;
export const SYNC_PROTOCOLS_ENDPOINT =
  `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/sync-protocols`;
export const BATCHER_ENDPOINT =
  `http://localhost:${ENV.BATCHER_PORT}/send-input`;
export const BATCHER_OPENAPI_URL =
  `http://localhost:${ENV.BATCHER_PORT}/documentation`;
export const ENGINE_OPENAPI_URL =
  `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/documentation`;
export const DOCUMENTATION_URL =
  `https://effectstream.github.io/docs/`;
export const ADDRESSES_ENDPOINT =
  `http://127.0.0.1:${ENV.EFFECTSTREAM_API_PORT}/addresses`;

import type { ChainConfig, PaimaChains } from "./types/index.ts";
import { ENV } from "@paima/utils";

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
      blockTime: network.blockTimeMS ?? undefined,
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
  try {
    const response = await fetch(CONFIG_ENDPOINT);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const configData: ConfigEndpointItem[] = await response.json();
    const dynamicChains = transformConfigToPaimaChains(configData);

    // Always start with hardcoded Paima main as the first element
    const combinedChains: PaimaChains = {
      Paima: {
        type: "EVM",
        name: "Paima Engine",
        blockTime: configData.find(
          (c) => c.syncProtocol.name === "mainNtp",
        )?.network.blockTimeMS ?? 1000,
        color: "#667eea",
        blocks: [],
        currentBlock: 1000000,
        rpcEndpoint: `http://127.0.0.1:${ENV.PAIMA_API_PORT}/rpc/evm`,
        latestBlockNumber: 0,
        previousLatestBlockNumber: 0,
        isConnected: false,
      },
      ...dynamicChains,
    };

    return combinedChains;
  } catch (error) {
    console.error("Error fetching chain configs:", error);
    // Return fallback configs on error
    return initialChainConfigs;
  }
}

// Initial configuration for each chain (fallback)
export const initialChainConfigs: PaimaChains = {
  Paima: {
    type: "EVM",
    name: "Paima Engine",
    blockTime: 1000,
    color: "#667eea",
    blocks: [],
    currentBlock: 1000000,
    rpcEndpoint: `http://127.0.0.1:${ENV.PAIMA_API_PORT}/rpc/evm`,
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
    rpcEndpoint: "http://127.0.0.1:8545/rpc/evm",
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
  },
  evmParallel: {
    type: "EVM",
    name: "Ethereum L1",
    blockTime: 12000,
    color: "#ff9800",
    blocks: [],
    currentBlock: 750000,
    rpcEndpoint: "http://127.0.0.1:8546/rpc/evm",
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
  },
  cardano: {
    type: "Cardano",
    name: "Cardano",
    blockTime: 20000,
    color: "#2196f3",
    blocks: [],
    currentBlock: 300000,
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

export const CONFIG_ENDPOINT = `http://127.0.0.1:${ENV.PAIMA_API_PORT}/config`;
export const BLOCK_HEIGHTS_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/block-heights`;
export const PRIMITIVES_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/primitives`;
export const TABLES_ENDPOINT = `http://127.0.0.1:${ENV.PAIMA_API_PORT}/tables`;
export const GRAMMAR_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/grammar`;
export const SCHEDULED_DATA_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/scheduled-data`;
export const PRIMITIVES_SCHEMA_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/primitives-schema`;
export const TABLE_SCHEMA_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/table-schema`;
export const SYNC_PROTOCOLS_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/sync-protocols`;
export const BATCHER_ENDPOINT =
  `http://localhost:${ENV.BATCHER_PORT}/send-input`;
export const BATCHER_OPENAPI_URL =
  `http://localhost:${ENV.BATCHER_PORT}/documentation`;
export const ENGINE_OPENAPI_URL =
  `http://localhost:${ENV.PAIMA_API_PORT}/documentation`;
export const DOCUMENTATION_URL =
  `https://acedward.github.io/paima-v-next-docs/`;
export const ADDRESSES_ENDPOINT =
  `http://127.0.0.1:${ENV.PAIMA_API_PORT}/addresses`;

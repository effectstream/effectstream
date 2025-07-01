export interface ChainConfig {
  type: string;
  name: string;
  blockTime: number;
  color: string;
  blocks: Block[];
  currentBlock: number;
  rpcEndpoint?: string;
  latestBlockNumber?: number;
  previousLatestBlockNumber?: number;
  isConnected?: boolean;
}

export type PaimaChains = Record<string, ChainConfig>;

// TODO: This should passed through the config
// Initial configuration for each chain
export const initialChainConfigs: PaimaChains = {
  Paima: {
    type: "EVM",
    name: "Paima Engine",
    blockTime: 300,
    color: "#667eea",
    blocks: [],
    currentBlock: 1000000,
    rpcEndpoint: "http://127.0.0.1:9999/rpc/evm",
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

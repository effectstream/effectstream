export interface Block {
  number: number;
  hash: string;
  timestamp: Date;
}

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
  // Optional: maps this chain config to an engine sync protocol name
  protocolName?: string;
}

export type PaimaChains = Record<string, ChainConfig>;

export interface Field {
  name: string;
  dataTypeID: number;
}

export interface TableData {
  command?: string;
  rowCount: number;
  rows: any[];
  fields: Field[];
}

import type {
  BitcoinBlockHash,
  BitcoinTxId,
  BlockNumber,
  TimestampMs,
} from "@effectstream/utils";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PrimitiveEntry,
  SyncProtocolWithNetwork,
} from "@effectstream/config";

export type Page = BlockNumber;

export type ConfigType = Extract<
  SyncProtocolWithNetwork,
  { networkType: ConfigNetworkType.BITCOIN }
>;

export type PrimitiveEntryType = Extract<
  PrimitiveEntry,
  { syncProtocol: ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL }
>;

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL
>;

export type Input = PageSyncRange<Page>;

export type BitcoinScriptPubKey = {
  asm: string;
  hex: string;
  type?: string;
  address?: string;
  addresses?: string[];
};

export type BitcoinVout = {
  value: number;
  n: number;
  scriptPubKey: BitcoinScriptPubKey;
};

export type BitcoinVin = {
  txid?: BitcoinTxId;
  vout?: number;
  coinbase?: string;
  sequence: number;
};

export type BitcoinTransaction = {
  txid: BitcoinTxId;
  hash: BitcoinTxId;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: BitcoinVin[];
  vout: BitcoinVout[];
};

export type BitcoinBlock = {
  hash: BitcoinBlockHash;
  confirmations: number;
  size: number;
  height: Page;
  version: number;
  time: number;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  previousblockhash?: BitcoinBlockHash;
  nextblockhash?: BitcoinBlockHash;
  tx: BitcoinTransaction[];
};

export type Output = {
  raw: BitcoinBlock;
  primitives: PrimitiveType[];
  blockHashes: BitcoinBlockHash[];
};

export function toMsTimestamp(timestamp: number): TimestampMs {
  return timestamp * 1000 as TimestampMs;
}


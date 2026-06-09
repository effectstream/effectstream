import type {
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

/** Solana page type: a slot number (block height) */
export type Page = BlockNumber;

export type ConfigType = Extract<
  SyncProtocolWithNetwork,
  { networkType: ConfigNetworkType.SOLANA }
>;

export type PrimitiveEntryType = Extract<
  PrimitiveEntry,
  { syncProtocol: ConfigSyncProtocolType.SOLANA_RPC_PARALLEL }
>;

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.SOLANA_RPC_PARALLEL
>;

export type Input = PageSyncRange<Page>;

export type SolanaTransactionMeta = {
  err: unknown | null;
  logMessages: string[] | null;
  preBalances: number[];
  postBalances: number[];
};

export type Output = {
  slot: number;
  blockhash: string;
  blockTime: number | null;
  blockHeight: number | null;
  parentSlot: number;
  transactions: SolanaTransactionMeta[];
  primitives: PrimitiveType[];
};

/**
 * Convert a Solana blockTime (unix seconds or null) to milliseconds.
 * Returns 0 if blockTime is null.
 */
export function toMsTimestamp(blockTime: number | null): TimestampMs {
  return (blockTime ?? 0) * 1000 as TimestampMs;
}

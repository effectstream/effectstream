import type {
  BlockNumber,
  TimestampMs,
} from "@effectstream/utils";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type { LastPage } from "../base/state.ts";
import type { RootPage } from "../types.ts";
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

/**
 * What `stateToInput` hands `readData`. Block mode: the slot range to read.
 * Program mode: a marker that a poll is due (`programPoll`); `from` is the
 * first slot not yet covered and `to` equals it, because the tip is only known
 * once `readData` has asked for it (AA 00064 C2: every RPC call of a poll runs
 * in `readData`).
 */
export type Input = PageSyncRange<Page> & { programPoll?: true };

/** How the protocol reads Solana (AA 00064 C1). The engine's default is `block`. */
export type SolanaSyncMode = "block" | "program";

/**
 * Program mode's durable cursor (AA 00064 C5): the newest slot it emitted, and
 * every signature it emitted in that slot, in index order. A transaction is
 * "above the cursor" when its slot is higher, or equal with its signature not
 * listed. It rides in the resume marker the runtime persists with each block,
 * so a restart resumes exactly after the last committed transaction.
 */
export type ProgramCursor = { slot: number; signatures: string[] };

/** A resume marker or in-memory page; program mode's always carries `cursor`. */
export type SolanaLastPage = LastPage<Page, RootPage> & { cursor?: ProgramCursor };

export type SolanaTransactionMeta = {
  err: unknown | null;
  logMessages: string[] | null;
  preBalances: number[];
  postBalances: number[];
};

/**
 * One produced block (block mode), or the watched programs' transactions of one
 * slot (program mode, AA 00064 C4).
 */
export type Output = {
  slot: number;
  /**
   * Block mode: the block's hash. Program mode: the slot's first kept
   * signature (there is no block hash without `getBlock`). It feeds the
   * Effectstream block hash, so that hash differs between the modes.
   */
  blockhash: string;
  /**
   * Unix seconds. Non-null by construction: the fetcher resolves the RPC's
   * nullable `blockTime` before building an Output, because a block with no
   * timestamp cannot be placed in the time-ordered merge.
   */
  blockTime: number;
  blockHeight: number | null;
  /** Null in program mode (`getTransaction` does not report it). */
  parentSlot: number | null;
  /** Block mode: every transaction of the block. Program mode: the kept ones, by index. */
  transactions: SolanaTransactionMeta[];
  primitives: PrimitiveType[];
  /** Program mode: the cursor after this output, i.e. its resume marker's (C5). */
  cursor?: ProgramCursor;
};

/** Convert a Solana blockTime (unix seconds) to milliseconds. */
export function toMsTimestamp(blockTime: number): TimestampMs {
  return blockTime * 1000 as TimestampMs;
}

import type { ChainBlock, ChainPage } from "./common/root.ts";
import type { EvmSyncState } from "./evm/state.ts";
import type { SyncState } from "./base/state.ts";
import type { UtxoRpcSyncState } from "./utxorpc/state.ts";
import type { PaginatedFetcher } from "./base/fetcher.ts";
import type { UnionToIntersection } from "@effectstream/utils";
import type { MidnightSyncState } from "./midnight/state.ts";
import type { NtpSyncState } from "./ntp/state.ts";
import type { AvailSyncState } from "./avail/state.ts";
import type { BitcoinSyncState } from "./bitcoin/state.ts";
import type { CelestiaSyncState } from "./celestia/state.ts";
import type { NearSyncState } from "./near/state.ts";
import type { SolanaSyncState } from "./solana/state.ts";
import type { TestSyncState } from "./test/state.ts";

// TODO: move folders
export type RootOutput = ChainBlock;
export type RootPage = ChainPage;

// TODO: map config types to sync protocols
export type AllSyncProtocols =
  | NtpSyncState
  | EvmSyncState
  | UtxoRpcSyncState
  | MidnightSyncState
  | AvailSyncState
  | BitcoinSyncState
  | CelestiaSyncState
  | NearSyncState
  | SolanaSyncState
  | TestSyncState;
export type ISyncProtocol = UnionToIntersection<AllSyncProtocols>;

type toPaginated<T> = T extends { fetcher: PaginatedFetcher<infer Page> } ? T
  : never;
export type PaginatedSyncProtocols = toPaginated<AllSyncProtocols>;

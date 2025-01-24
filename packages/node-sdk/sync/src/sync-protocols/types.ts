import type { ChainBlock, ChainPage } from "./common/root.ts";
import type { EvmSyncState } from "./evm/state.ts";

// TODO: move folders
export type RootOutput = ChainBlock;
export type RootPage = ChainPage;

// TODO: map config types to sync protocols
export type AllSyncProtocols = EvmSyncState;

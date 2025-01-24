// https://github.com/denoland/deno/issues/26611#issuecomment-2492987153
declare global {
  type Buffer = typeof import("node:buffer").Buffer;
}

// https://github.com/adelsz/pgtyped/issues/565
export type { Json } from "./sql/events.queries.ts";

export {
  getAchievementProgress,
  setAchievementProgress,
} from "./sql/achievements.queries.ts";
export type {
  IGetAchievementProgressParams,
  IGetAchievementProgressResult,
  ISetAchievementProgressParams,
  ISetAchievementProgressResult,
} from "./sql/achievements.queries.ts";
// https://github.com/adelsz/pgtyped/issues/565
export {
  blockHeightDone,
  getBlockByHash,
  getBlockHeights,
  getBlockSeeds,
  getLatestProcessedBlockHeight,
  saveLastBlock,
} from "./sql/block-heights.queries.ts";
export type {
  IBlockHeightDoneParams,
  IBlockHeightDoneResult,
  IGetBlockByHashParams,
  IGetBlockByHashResult,
  IGetBlockHeightsParams,
  IGetBlockHeightsResult,
  IGetBlockSeedsParams,
  IGetBlockSeedsResult,
  IGetLatestProcessedBlockHeightParams,
  IGetLatestProcessedBlockHeightResult,
  ISaveLastBlockParams,
  ISaveLastBlockResult,
} from "./sql/block-heights.queries.ts";
export * from "./sql/statistics.queries.ts";
export * from "./sql/nonces.queries.ts";
export * from "./sql/rollup_inputs.queries.ts";
export * from "./sql/wallet-delegation.queries.ts";
export * from "./sql/events.queries.ts";
export * from "./sql/sync-protocols/page.queries.ts";

export * from "./event-indexing.ts";
export * from "./register-events.ts";
export * from "./generator.ts";
export * from "./pg-connection.ts";
export * from "./delegate-wallet.ts";

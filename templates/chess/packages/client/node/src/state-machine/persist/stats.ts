import type {
  IGetUserStatsResult,
  INewStatsParams,
  IUpdateStatsParams,
} from "@chess/db";
import { newStats, updateStats } from "@chess/db";
import type { ConciseResult } from "@chess/utils";
import type { UserStats } from "../v1/types.ts";
import type { AddressType, WalletAddress } from "@effectstream/utils";
import {
  type INewScheduledHeightDataParams,
  newScheduledHeightData,
} from "@effectstream/db";

export type SQLUpdate = [any, any];

// Generate blank/empty user stats
export function blankStats(wallet: string): SQLUpdate {
  const params: INewStatsParams = {
    stats: {
      wallet: wallet,
      wins: 0,
      ties: 0,
      losses: 0,
      rating: 0,
    },
  };
  return [newStats, params];
}

// Persist updating user stats in DB
export function persistStatsUpdate(
  newStats: UserStats,
  oldStats: IGetUserStatsResult,
): SQLUpdate {
  const { user, result, ratingChange } = newStats;
  const userParams: IUpdateStatsParams = {
    stats: {
      wallet: user,
      wins: result === "w" ? oldStats.wins + 1 : oldStats.wins,
      losses: result === "l" ? oldStats.losses + 1 : oldStats.losses,
      ties: result === "t" ? oldStats.ties + 1 : oldStats.ties,
      rating: oldStats.rating + ratingChange,
    },
  };
  return [updateStats, userParams];
}

// Schedule a stats update to be executed in the future
export function scheduleStatsUpdate(
  wallet: WalletAddress,
  walletType: AddressType,
  result: ConciseResult,
  ratingChange: number,
  block_height: number,
): SQLUpdate {
  const params: INewScheduledHeightDataParams = {
    from_address: wallet,
    from_address_type: walletType,
    future_block_height: block_height,
    input_data: createStatsUpdateInput(wallet, result, ratingChange),
  };
  return [newScheduledHeightData, params];
}

// Create stats update input
function createStatsUpdateInput(
  wallet: WalletAddress,
  result: ConciseResult,
  ratingChange: number,
) {
  // TODO: we don't support the "*" serial indicator for keys.
  //       it should be `${wallet}`
  return JSON.stringify([
    "u",
    `${wallet}`,
    `${result}`,
    `${ratingChange}`,
  ]);
}

import type { IGetUserStatsResult, INewStatsParams, IUpdateStatsParams } from '@game/db';
import { newStats, updateStats } from '@game/db';
import { GameResult, ShortNotationGameResult } from '@game/game-logic';
import type { SQLUpdate } from '@paima/node-sdk/db';
import { createScheduledData } from '@paima/node-sdk/db';
import type { WalletAddress } from '@paima/sdk/utils';

// Generate blank/empty user stats
export function blankStats(wallet: string): SQLUpdate {
  const params: INewStatsParams = {
    wallet: wallet,
    wins: 0,
    ties: 0,
    losses: 0,
  };
  return [newStats, params];
}

// Persist updating user stats in DB
export function persistStatsUpdate(
  user: WalletAddress,
  result: ShortNotationGameResult,
  stats: IGetUserStatsResult
): SQLUpdate {
  const userParams: IUpdateStatsParams = {
    wallet: user,
    wins: result === ShortNotationGameResult.WIN ? stats.wins + 1 : stats.wins,
    losses: result === ShortNotationGameResult.LOSS ? stats.losses + 1 : stats.losses,
    ties: result === ShortNotationGameResult.TIE ? stats.ties + 1 : stats.ties,
  };
  return [updateStats, userParams];
}

// Schedule a stats update to be executed in the future
export function scheduleStatsUpdate(
  wallet: WalletAddress,
  result: GameResult,
  block_height: number
): SQLUpdate {
  return createScheduledData(createStatsUpdateInput(wallet, result), block_height);
}

// Create stats update input
function createStatsUpdateInput(wallet: WalletAddress, result: GameResult): string {
  // convert GameResult to Short Notation for commands
  // tie  => t
  // win  => w
  // lose => l
  let shortNotationResult = ShortNotationGameResult.TIE;
  if (result === GameResult.WIN) shortNotationResult = ShortNotationGameResult.WIN;
  else if (result === GameResult.LOSS) shortNotationResult = ShortNotationGameResult.LOSS;

  return `u|*${wallet}|${shortNotationResult}`;
}

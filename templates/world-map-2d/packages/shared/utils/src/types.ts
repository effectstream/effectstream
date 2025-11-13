import type { IGetUserStatsResult, IGetWorldStatsResult } from '@game/db';
import type { IGetBlockHeightsResult } from '@paima/db';
import type { WalletAddress } from '@paima/sdk/utils';

export interface RoundExecutorData {
  match_state: string;
  block_data: IGetBlockHeightsResult;
}

interface ExecutorDataSeed {
  seed: string;
  block_height: number;
  round: number;
}

export interface MatchExecutorData {
  seeds: ExecutorDataSeed[];
}

export interface BaseRoundStatus {
  executed: boolean;
  usersWhoSubmittedMoves: WalletAddress[];
}

export interface RoundStatusData extends BaseRoundStatus {
  roundStarted: number; // blockheight
  roundLength: number;
}

export type UserStats = IGetUserStatsResult;

export type WorldStats = IGetWorldStatsResult;

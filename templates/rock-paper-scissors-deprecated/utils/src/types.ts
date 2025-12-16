import type {
  IGetLobbyByIdResult,
  IGetMovesByLobbyResult,
  IGetNewLobbiesByUserAndBlockHeightResult,
  IGetPaginatedUserLobbiesResult,
  IGetUserStatsResult,
  LobbyStatus,
} from '@game/db';

import type { IGetBlockHeightsResult } from '@paima/node-sdk/db';
import type { WalletAddress } from '@paima/sdk/utils';

export interface QueryLobby {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  round_length: number;
}

export interface MatchWinnerResponse {
  match_status?: LobbyStatus;
  winner_address?: string;
}

export interface RoundExecutorData {
  lobby: IGetLobbyByIdResult;
  moves: IGetMovesByLobbyResult[];
  block_height: IGetBlockHeightsResult;
}

interface ExecutorDataSeed {
  seed: string;
  block_height: number;
  round: number;
}

export interface MatchExecutorData {
  lobby: IGetLobbyByIdResult;
  moves: IGetMovesByLobbyResult[];
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

export interface LobbyState extends LobbyStateQuery {
  round_ends_in_blocks: number;
  round_ends_in_secs: number;
}

export interface LobbyStateQuery extends IGetLobbyByIdResult {
  round_start_height: number;
}

export interface UserLobby extends IGetPaginatedUserLobbiesResult {
  myTurn?: boolean;
}

export type NewLobby = IGetNewLobbiesByUserAndBlockHeightResult;

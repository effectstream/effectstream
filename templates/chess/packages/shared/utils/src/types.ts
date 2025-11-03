import type {
  IGetAllPaginatedUserLobbiesResult,
  IGetLobbyByIdResult,
  IGetMovesByLobbyResult,
  IGetNewLobbiesByUserAndBlockHeightResult,
  IGetUserStatsResult,
  LobbyStatus as LobbyStatusDB,
} from "@chess/db";

import type { WalletAddress } from "@paimaexample/utils";

export type LobbyStatus = "active" | "closed" | "finished" | "open";
export type MatchResult = "loss" | "tie" | "win";

type IGetBlockHeightsResult = {
  block_height: number;
  done: boolean;
  seed: string;
};

export type ConciseResult = "w" | "t" | "l";
export type ExpandedResult = "win" | "tie" | "loss";
export type MatchResultPair = [ConciseResult, ConciseResult];

export interface MatchWinnerResponse {
  match_status?: LobbyStatusDB;
  winner_address?: string;
}

export interface RoundExecutorData {
  lobby: IGetLobbyByIdResult;
  match_state: string;
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

export type NewLobby = IGetNewLobbiesByUserAndBlockHeightResult;

export interface LobbyState extends LobbyStateQuery {
  round_ends_in_blocks: number;
  round_ends_in_secs: number;
}

export interface LobbyStateQuery extends IGetLobbyByIdResult {
  round_start_height: number;
  remaining_blocks: {
    w: number;
    b: number;
  };
}

export interface UserLobby extends IGetAllPaginatedUserLobbiesResult {
  myTurn?: boolean;
}

export interface Timer {
  player_one_blocks_left: number;
  player_two_blocks_left: number;
}

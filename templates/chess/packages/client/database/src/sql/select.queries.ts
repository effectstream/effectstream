/** Types generated for queries found in "src/sql/select.sql" */
import { PreparedQuery } from "@pgtyped/runtime";

import type { Buffer } from "node:buffer";
// export type lobby_status = 'active' | 'closed' | 'finished' | 'open';
// export type match_result = 'loss' | 'tie' | 'win';
import type { LobbyStatus, MatchResult } from "../common.ts";
type lobby_status = LobbyStatus;
type match_result = MatchResult;

export type NumberOrString = number | string;

/** 'GetPaginatedOpenLobbies' parameters type */
export interface IGetPaginatedOpenLobbiesParams {
  count?: NumberOrString | null | void;
  page?: NumberOrString | null | void;
  wallet?: string | null | void;
}

/** 'GetPaginatedOpenLobbies' return type */
export interface IGetPaginatedOpenLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  play_time_per_player: number;
  player_one_iswhite: boolean;
  rating: number;
  round_length: number;
}

/** 'GetPaginatedOpenLobbies' query type */
export interface IGetPaginatedOpenLobbiesQuery {
  params: IGetPaginatedOpenLobbiesParams;
  result: IGetPaginatedOpenLobbiesResult;
}

const getPaginatedOpenLobbiesIR: any = {
  "usedParamSet": { "wallet": true, "count": true, "page": true },
  "params": [{
    "name": "wallet",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 496, "b": 502 }],
  }, {
    "name": "count",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 535, "b": 540 }],
  }, {
    "name": "page",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 549, "b": 553 }],
  }],
  "statement":
    "SELECT \nlobbies.lobby_id,\nlobbies.num_of_rounds,\nlobbies.round_length,\nlobbies.play_time_per_player,\nlobbies.current_round,\nlobbies.created_at,\nlobbies.creation_block_height,\nlobbies.hidden,\nlobbies.lobby_creator,\nlobbies.player_one_iswhite,\nlobbies.lobby_state,\nlobbies.latest_match_state,\nglobal_user_state.rating\nFROM lobbies\nJOIN global_user_state ON lobbies.lobby_creator = global_user_state.wallet\nWHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 * lobbies.lobby_id,
 * lobbies.num_of_rounds,
 * lobbies.round_length,
 * lobbies.play_time_per_player,
 * lobbies.current_round,
 * lobbies.created_at,
 * lobbies.creation_block_height,
 * lobbies.hidden,
 * lobbies.lobby_creator,
 * lobbies.player_one_iswhite,
 * lobbies.lobby_state,
 * lobbies.latest_match_state,
 * global_user_state.rating
 * FROM lobbies
 * JOIN global_user_state ON lobbies.lobby_creator = global_user_state.wallet
 * WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const getPaginatedOpenLobbies = new PreparedQuery<
  IGetPaginatedOpenLobbiesParams,
  IGetPaginatedOpenLobbiesResult
>(getPaginatedOpenLobbiesIR);

/** 'SearchPaginatedOpenLobbies' parameters type */
export interface ISearchPaginatedOpenLobbiesParams {
  count?: NumberOrString | null | void;
  page?: NumberOrString | null | void;
  searchQuery?: string | null | void;
  wallet?: string | null | void;
}

/** 'SearchPaginatedOpenLobbies' return type */
export interface ISearchPaginatedOpenLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  play_time_per_player: number;
  player_one_iswhite: boolean;
  round_length: number;
}

/** 'SearchPaginatedOpenLobbies' query type */
export interface ISearchPaginatedOpenLobbiesQuery {
  params: ISearchPaginatedOpenLobbiesParams;
  result: ISearchPaginatedOpenLobbiesResult;
}

const searchPaginatedOpenLobbiesIR: any = {
  "usedParamSet": {
    "wallet": true,
    "searchQuery": true,
    "count": true,
    "page": true,
  },
  "params": [{
    "name": "wallet",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 395, "b": 401 }],
  }, {
    "name": "searchQuery",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 429, "b": 440 }],
  }, {
    "name": "count",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 473, "b": 478 }],
  }, {
    "name": "page",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 487, "b": 491 }],
  }],
  "statement":
    "SELECT \nlobbies.lobby_id,\nlobbies.num_of_rounds,\nlobbies.round_length,\nlobbies.play_time_per_player,\nlobbies.current_round,\nlobbies.created_at,\nlobbies.creation_block_height,\nlobbies.hidden,\nlobbies.lobby_creator,\nlobbies.player_one_iswhite,\nlobbies.lobby_state,\nlobbies.latest_match_state\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet AND lobbies.lobby_id LIKE :searchQuery\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 * lobbies.lobby_id,
 * lobbies.num_of_rounds,
 * lobbies.round_length,
 * lobbies.play_time_per_player,
 * lobbies.current_round,
 * lobbies.created_at,
 * lobbies.creation_block_height,
 * lobbies.hidden,
 * lobbies.lobby_creator,
 * lobbies.player_one_iswhite,
 * lobbies.lobby_state,
 * lobbies.latest_match_state
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet AND lobbies.lobby_id LIKE :searchQuery
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const searchPaginatedOpenLobbies = new PreparedQuery<
  ISearchPaginatedOpenLobbiesParams,
  ISearchPaginatedOpenLobbiesResult
>(searchPaginatedOpenLobbiesIR);

/** 'GetOpenLobbyById' parameters type */
export interface IGetOpenLobbyByIdParams {
  searchQuery?: string | null | void;
  wallet?: string | null | void;
}

/** 'GetOpenLobbyById' return type */
export interface IGetOpenLobbyByIdResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  play_time_per_player: number;
  player_one_iswhite: boolean;
  round_length: number;
}

/** 'GetOpenLobbyById' query type */
export interface IGetOpenLobbyByIdQuery {
  params: IGetOpenLobbyByIdParams;
  result: IGetOpenLobbyByIdResult;
}

const getOpenLobbyByIdIR: any = {
  "usedParamSet": { "searchQuery": true, "wallet": true },
  "params": [{
    "name": "searchQuery",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 361, "b": 372 }],
  }, {
    "name": "wallet",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 403, "b": 409 }],
  }],
  "statement":
    "SELECT \nlobbies.lobby_id,\nlobbies.num_of_rounds,\nlobbies.round_length,\nlobbies.play_time_per_player,\nlobbies.current_round,\nlobbies.created_at,\nlobbies.creation_block_height,\nlobbies.hidden,\nlobbies.lobby_creator,\nlobbies.player_one_iswhite,\nlobbies.lobby_state,\nlobbies.latest_match_state\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :wallet",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 * lobbies.lobby_id,
 * lobbies.num_of_rounds,
 * lobbies.round_length,
 * lobbies.play_time_per_player,
 * lobbies.current_round,
 * lobbies.created_at,
 * lobbies.creation_block_height,
 * lobbies.hidden,
 * lobbies.lobby_creator,
 * lobbies.player_one_iswhite,
 * lobbies.lobby_state,
 * lobbies.latest_match_state
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :wallet
 * ```
 */
export const getOpenLobbyById = new PreparedQuery<
  IGetOpenLobbyByIdParams,
  IGetOpenLobbyByIdResult
>(getOpenLobbyByIdIR);

/** 'GetRandomLobby' parameters type */
export type IGetRandomLobbyParams = void;

/** 'GetRandomLobby' return type */
export interface IGetRandomLobbyResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  play_time_per_player: number;
  player_one_iswhite: boolean;
  round_length: number;
}

/** 'GetRandomLobby' query type */
export interface IGetRandomLobbyQuery {
  params: IGetRandomLobbyParams;
  result: IGetRandomLobbyResult;
}

const getRandomLobbyIR: any = {
  "usedParamSet": {},
  "params": [],
  "statement":
    "SELECT\nlobbies.lobby_id,\nlobbies.num_of_rounds,\nlobbies.round_length,\nlobbies.play_time_per_player,\nlobbies.current_round,\nlobbies.created_at,\nlobbies.creation_block_height,\nlobbies.hidden,\nlobbies.lobby_creator,\nlobbies.player_one_iswhite,\nlobbies.lobby_state,\nlobbies.latest_match_state\nFROM lobbies\nWHERE random() < 0.1\nAND lobbies.lobby_state = 'open' AND lobbies.hidden is FALSE\nLIMIT 1",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 * lobbies.lobby_id,
 * lobbies.num_of_rounds,
 * lobbies.round_length,
 * lobbies.play_time_per_player,
 * lobbies.current_round,
 * lobbies.created_at,
 * lobbies.creation_block_height,
 * lobbies.hidden,
 * lobbies.lobby_creator,
 * lobbies.player_one_iswhite,
 * lobbies.lobby_state,
 * lobbies.latest_match_state
 * FROM lobbies
 * WHERE random() < 0.1
 * AND lobbies.lobby_state = 'open' AND lobbies.hidden is FALSE
 * LIMIT 1
 * ```
 */
export const getRandomLobby = new PreparedQuery<
  IGetRandomLobbyParams,
  IGetRandomLobbyResult
>(getRandomLobbyIR);

/** 'GetRandomActiveLobby' parameters type */
export type IGetRandomActiveLobbyParams = void;

/** 'GetRandomActiveLobby' return type */
export interface IGetRandomActiveLobbyResult {
  bot_difficulty: number;
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  play_time_per_player: number;
  player_one_iswhite: boolean;
  player_two: string | null;
  practice: boolean;
  round_length: number;
}

/** 'GetRandomActiveLobby' query type */
export interface IGetRandomActiveLobbyQuery {
  params: IGetRandomActiveLobbyParams;
  result: IGetRandomActiveLobbyResult;
}

const getRandomActiveLobbyIR: any = {
  "usedParamSet": {},
  "params": [],
  "statement":
    "SELECT * FROM lobbies\nWHERE random() < 0.1\nAND lobbies.lobby_state = 'active'\nLIMIT 1",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE random() < 0.1
 * AND lobbies.lobby_state = 'active'
 * LIMIT 1
 * ```
 */
export const getRandomActiveLobby = new PreparedQuery<
  IGetRandomActiveLobbyParams,
  IGetRandomActiveLobbyResult
>(getRandomActiveLobbyIR);

/** 'GetAllPaginatedUserLobbies' parameters type */
export interface IGetAllPaginatedUserLobbiesParams {
  count?: NumberOrString | null | void;
  page?: NumberOrString | null | void;
  wallet?: string | null | void;
}

/** 'GetAllPaginatedUserLobbies' return type */
export interface IGetAllPaginatedUserLobbiesResult {
  bot_difficulty: number;
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  play_time_per_player: number;
  player_one_iswhite: boolean;
  player_two: string | null;
  practice: boolean;
  round_length: number;
}

/** 'GetAllPaginatedUserLobbies' query type */
export interface IGetAllPaginatedUserLobbiesQuery {
  params: IGetAllPaginatedUserLobbiesParams;
  result: IGetAllPaginatedUserLobbiesResult;
}

const getAllPaginatedUserLobbiesIR: any = {
  "usedParamSet": { "wallet": true, "count": true, "page": true },
  "params": [{
    "name": "wallet",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 53, "b": 59 }, { "a": 85, "b": 91 }],
  }, {
    "name": "count",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 239, "b": 244 }],
  }, {
    "name": "page",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 253, "b": 257 }],
  }],
  "statement":
    "SELECT * FROM lobbies\nWHERE (lobbies.lobby_creator = :wallet\nOR lobbies.player_two = :wallet)\nORDER BY lobby_state = 'active' DESC,\n         lobby_state = 'open' DESC,\n         lobby_state = 'finished' DESC,\n         created_at DESC\nLIMIT :count\nOFFSET :page",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE (lobbies.lobby_creator = :wallet
 * OR lobbies.player_two = :wallet)
 * ORDER BY lobby_state = 'active' DESC,
 *          lobby_state = 'open' DESC,
 *          lobby_state = 'finished' DESC,
 *          created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const getAllPaginatedUserLobbies = new PreparedQuery<
  IGetAllPaginatedUserLobbiesParams,
  IGetAllPaginatedUserLobbiesResult
>(getAllPaginatedUserLobbiesIR);

/** 'GetLobbyById' parameters type */
export interface IGetLobbyByIdParams {
  lobby_id?: string | null | void;
}

/** 'GetLobbyById' return type */
export interface IGetLobbyByIdResult {
  bot_difficulty: number;
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  play_time_per_player: number;
  player_one_iswhite: boolean;
  player_two: string | null;
  practice: boolean;
  round_length: number;
}

/** 'GetLobbyById' query type */
export interface IGetLobbyByIdQuery {
  params: IGetLobbyByIdParams;
  result: IGetLobbyByIdResult;
}

const getLobbyByIdIR: any = {
  "usedParamSet": { "lobby_id": true },
  "params": [{
    "name": "lobby_id",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 39, "b": 47 }],
  }],
  "statement": "SELECT * FROM lobbies\nWHERE lobby_id = :lobby_id",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE lobby_id = :lobby_id
 * ```
 */
export const getLobbyById = new PreparedQuery<
  IGetLobbyByIdParams,
  IGetLobbyByIdResult
>(getLobbyByIdIR);

/** 'GetUserStats' parameters type */
export interface IGetUserStatsParams {
  wallet?: string | null | void;
}

/** 'GetUserStats' return type */
export interface IGetUserStatsResult {
  losses: number;
  rating: number;
  ties: number;
  wallet: string;
  wins: number;
}

/** 'GetUserStats' query type */
export interface IGetUserStatsQuery {
  params: IGetUserStatsParams;
  result: IGetUserStatsResult;
}

const getUserStatsIR: any = {
  "usedParamSet": { "wallet": true },
  "params": [{
    "name": "wallet",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 47, "b": 53 }],
  }],
  "statement": "SELECT * FROM global_user_state\nWHERE wallet = :wallet",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_user_state
 * WHERE wallet = :wallet
 * ```
 */
export const getUserStats = new PreparedQuery<
  IGetUserStatsParams,
  IGetUserStatsResult
>(getUserStatsIR);

/** 'GetUserRatingPosition' parameters type */
export interface IGetUserRatingPositionParams {
  rating: number;
}

/** 'GetUserRatingPosition' return type */
export interface IGetUserRatingPositionResult {
  rank: string | null;
}

/** 'GetUserRatingPosition' query type */
export interface IGetUserRatingPositionQuery {
  params: IGetUserRatingPositionParams;
  result: IGetUserRatingPositionResult;
}

const getUserRatingPositionIR: any = {
  "usedParamSet": { "rating": true },
  "params": [{
    "name": "rating",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 64, "b": 71 }],
  }],
  "statement":
    "SELECT count(*)+1 as rank\nFROM global_user_state\nWHERE rating > :rating!",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT count(*)+1 as rank
 * FROM global_user_state
 * WHERE rating > :rating!
 * ```
 */
export const getUserRatingPosition = new PreparedQuery<
  IGetUserRatingPositionParams,
  IGetUserRatingPositionResult
>(getUserRatingPositionIR);

/** 'GetRoundMoves' parameters type */
export interface IGetRoundMovesParams {
  lobby_id: string;
  round: number;
}

/** 'GetRoundMoves' return type */
export interface IGetRoundMovesResult {
  id: number;
  lobby_id: string;
  move_pgn: string;
  round: number;
  wallet: string;
}

/** 'GetRoundMoves' query type */
export interface IGetRoundMovesQuery {
  params: IGetRoundMovesParams;
  result: IGetRoundMovesResult;
}

const getRoundMovesIR: any = {
  "usedParamSet": { "lobby_id": true, "round": true },
  "params": [{
    "name": "lobby_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 43, "b": 52 }],
  }, {
    "name": "round",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 68, "b": 74 }],
  }],
  "statement":
    "SELECT * FROM match_moves\nWHERE lobby_id = :lobby_id!\nAND   round = :round!",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM match_moves
 * WHERE lobby_id = :lobby_id!
 * AND   round = :round!
 * ```
 */
export const getRoundMoves = new PreparedQuery<
  IGetRoundMovesParams,
  IGetRoundMovesResult
>(getRoundMovesIR);

/** 'GetMovesByLobby' parameters type */
export interface IGetMovesByLobbyParams {
  lobby_id?: string | null | void;
}

/** 'GetMovesByLobby' return type */
export interface IGetMovesByLobbyResult {
  id: number;
  lobby_id: string;
  move_pgn: string;
  round: number;
  wallet: string;
}

/** 'GetMovesByLobby' query type */
export interface IGetMovesByLobbyQuery {
  params: IGetMovesByLobbyParams;
  result: IGetMovesByLobbyResult;
}

const getMovesByLobbyIR: any = {
  "usedParamSet": { "lobby_id": true },
  "params": [{
    "name": "lobby_id",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 55, "b": 63 }],
  }],
  "statement":
    "SELECT *\nFROM match_moves\nWHERE match_moves.lobby_id = :lobby_id",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM match_moves
 * WHERE match_moves.lobby_id = :lobby_id
 * ```
 */
export const getMovesByLobby = new PreparedQuery<
  IGetMovesByLobbyParams,
  IGetMovesByLobbyResult
>(getMovesByLobbyIR);

/** 'GetNewLobbiesByUserAndBlockHeight' parameters type */
export interface IGetNewLobbiesByUserAndBlockHeightParams {
  block_height?: number | null | void;
  wallet?: string | null | void;
}

/** 'GetNewLobbiesByUserAndBlockHeight' return type */
export interface IGetNewLobbiesByUserAndBlockHeightResult {
  lobby_id: string;
}

/** 'GetNewLobbiesByUserAndBlockHeight' query type */
export interface IGetNewLobbiesByUserAndBlockHeightQuery {
  params: IGetNewLobbiesByUserAndBlockHeightParams;
  result: IGetNewLobbiesByUserAndBlockHeightResult;
}

const getNewLobbiesByUserAndBlockHeightIR: any = {
  "usedParamSet": { "wallet": true, "block_height": true },
  "params": [{
    "name": "wallet",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 51, "b": 57 }],
  }, {
    "name": "block_height",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 87, "b": 99 }],
  }],
  "statement":
    "SELECT lobby_id FROM lobbies\nWHERE lobby_creator = :wallet\nAND creation_block_height = :block_height",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT lobby_id FROM lobbies
 * WHERE lobby_creator = :wallet
 * AND creation_block_height = :block_height
 * ```
 */
export const getNewLobbiesByUserAndBlockHeight = new PreparedQuery<
  IGetNewLobbiesByUserAndBlockHeightParams,
  IGetNewLobbiesByUserAndBlockHeightResult
>(getNewLobbiesByUserAndBlockHeightIR);

/** 'GetRoundData' parameters type */
export interface IGetRoundDataParams {
  lobby_id: string;
  round_number?: number | null | void;
}

/** 'GetRoundData' return type */
export interface IGetRoundDataResult {
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  match_state: string;
  player_one_blocks_left: number;
  player_two_blocks_left: number;
  round_within_match: number;
  starting_block_height: number;
}

/** 'GetRoundData' query type */
export interface IGetRoundDataQuery {
  params: IGetRoundDataParams;
  result: IGetRoundDataResult;
}

const getRoundDataIR: any = {
  "usedParamSet": { "lobby_id": true, "round_number": true },
  "params": [{
    "name": "lobby_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 38, "b": 47 }],
  }, {
    "name": "round_number",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 74, "b": 86 }],
  }],
  "statement":
    "SELECT * FROM rounds\nWHERE lobby_id = :lobby_id!\nAND round_within_match = :round_number",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM rounds
 * WHERE lobby_id = :lobby_id!
 * AND round_within_match = :round_number
 * ```
 */
export const getRoundData = new PreparedQuery<
  IGetRoundDataParams,
  IGetRoundDataResult
>(getRoundDataIR);

/** 'GetMatchSeeds' parameters type */
export interface IGetMatchSeedsParams {
  lobby_id?: string | null | void;
}

/** 'GetMatchSeeds' return type */
export interface IGetMatchSeedsResult {
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  match_state: string;
  player_one_blocks_left: number;
  player_two_blocks_left: number;
  round_within_match: number;
  starting_block_height: number;
}

/** 'GetMatchSeeds' query type */
export interface IGetMatchSeedsQuery {
  params: IGetMatchSeedsParams;
  result: IGetMatchSeedsResult;
}

const getMatchSeedsIR: any = {
  "usedParamSet": { "lobby_id": true },
  "params": [{
    "name": "lobby_id",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 45, "b": 53 }],
  }],
  "statement": "SELECT * FROM rounds\nWHERE rounds.lobby_id = :lobby_id",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM rounds
 * WHERE rounds.lobby_id = :lobby_id
 * ```
 */
export const getMatchSeeds = new PreparedQuery<
  IGetMatchSeedsParams,
  IGetMatchSeedsResult
>(getMatchSeedsIR);

/** 'GetFinalState' parameters type */
export interface IGetFinalStateParams {
  lobby_id?: string | null | void;
}

/** 'GetFinalState' return type */
export interface IGetFinalStateResult {
  lobby_id: string;
  player_one_elapsed_time: number;
  player_one_iswhite: boolean;
  player_one_result: match_result;
  player_one_wallet: string;
  player_two_elapsed_time: number;
  player_two_result: match_result;
  player_two_wallet: string;
  positions: string;
}

/** 'GetFinalState' query type */
export interface IGetFinalStateQuery {
  params: IGetFinalStateParams;
  result: IGetFinalStateResult;
}

const getFinalStateIR: any = {
  "usedParamSet": { "lobby_id": true },
  "params": [{
    "name": "lobby_id",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 49, "b": 57 }],
  }],
  "statement": "SELECT * FROM final_match_state\nWHERE lobby_id = :lobby_id",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM final_match_state
 * WHERE lobby_id = :lobby_id
 * ```
 */
export const getFinalState = new PreparedQuery<
  IGetFinalStateParams,
  IGetFinalStateResult
>(getFinalStateIR);

/** 'GetLobbyRounds' parameters type */
export interface IGetLobbyRoundsParams {
  lobby_id?: string | null | void;
}

/** 'GetLobbyRounds' return type */
export interface IGetLobbyRoundsResult {
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  match_state: string;
  player_one_blocks_left: number;
  player_two_blocks_left: number;
  round_within_match: number;
  starting_block_height: number;
}

/** 'GetLobbyRounds' query type */
export interface IGetLobbyRoundsQuery {
  params: IGetLobbyRoundsParams;
  result: IGetLobbyRoundsResult;
}

const getLobbyRoundsIR: any = {
  "usedParamSet": { "lobby_id": true },
  "params": [{
    "name": "lobby_id",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 38, "b": 46 }],
  }],
  "statement": "SELECT * FROM rounds\nWHERE lobby_id = :lobby_id",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM rounds
 * WHERE lobby_id = :lobby_id
 * ```
 */
export const getLobbyRounds = new PreparedQuery<
  IGetLobbyRoundsParams,
  IGetLobbyRoundsResult
>(getLobbyRoundsIR);

/** 'InternalStateA' parameters type */
export type IInternalStateAParams = void;

/** 'InternalStateA' return type */
export interface IInternalStateAResult {
  from_address: string;
  id: number;
  input_data: string;
}

/** 'InternalStateA' query type */
export interface IInternalStateAQuery {
  params: IInternalStateAParams;
  result: IInternalStateAResult;
}

const internalStateAIR: any = {
  "usedParamSet": {},
  "params": [],
  "statement": "SELECT * FROM paima.rollup_inputs",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.rollup_inputs
 * ```
 */
export const internalStateA = new PreparedQuery<
  IInternalStateAParams,
  IInternalStateAResult
>(internalStateAIR);

/** 'InternalStateB' parameters type */
export type IInternalStateBParams = void;

/** 'InternalStateB' return type */
export interface IInternalStateBResult {
  caip2: string | null;
  contract_address: string | null;
  id: number;
  primitive_name: string | null;
  tx_hash: Buffer | null;
}

/** 'InternalStateB' query type */
export interface IInternalStateBQuery {
  params: IInternalStateBParams;
  result: IInternalStateBResult;
}

const internalStateBIR: any = {
  "usedParamSet": {},
  "params": [],
  "statement": "SELECT * FROM paima.rollup_input_origin",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.rollup_input_origin
 * ```
 */
export const internalStateB = new PreparedQuery<
  IInternalStateBParams,
  IInternalStateBResult
>(internalStateBIR);

/** 'InternalStateC' parameters type */
export type IInternalStateCParams = void;

/** 'InternalStateC' return type */
export interface IInternalStateCResult {
  future_block_height: number;
  id: number;
}

/** 'InternalStateC' query type */
export interface IInternalStateCQuery {
  params: IInternalStateCParams;
  result: IInternalStateCResult;
}

const internalStateCIR: any = {
  "usedParamSet": {},
  "params": [],
  "statement": "SELECT * FROM paima.rollup_input_future_block",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.rollup_input_future_block
 * ```
 */
export const internalStateC = new PreparedQuery<
  IInternalStateCParams,
  IInternalStateCResult
>(internalStateCIR);

/** 'InternalStateD' parameters type */
export type IInternalStateDParams = void;

/** 'InternalStateD' return type */
export interface IInternalStateDResult {
  future_ms_timestamp: Date;
  id: number;
}

/** 'InternalStateD' query type */
export interface IInternalStateDQuery {
  params: IInternalStateDParams;
  result: IInternalStateDResult;
}

const internalStateDIR: any = {
  "usedParamSet": {},
  "params": [],
  "statement": "SELECT * FROM paima.rollup_input_future_timestamp",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.rollup_input_future_timestamp
 * ```
 */
export const internalStateD = new PreparedQuery<
  IInternalStateDParams,
  IInternalStateDResult
>(internalStateDIR);

/** 'InternalStateE' parameters type */
export type IInternalStateEParams = void;

/** 'InternalStateE' return type */
export interface IInternalStateEResult {
  block_height: number;
  id: number;
  index_in_block: number;
  paima_tx_hash: Buffer;
  success: boolean;
}

/** 'InternalStateE' query type */
export interface IInternalStateEQuery {
  params: IInternalStateEParams;
  result: IInternalStateEResult;
}

const internalStateEIR: any = {
  "usedParamSet": {},
  "params": [],
  "statement": "SELECT * FROM paima.rollup_input_result",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.rollup_input_result
 * ```
 */
export const internalStateE = new PreparedQuery<
  IInternalStateEParams,
  IInternalStateEResult
>(internalStateEIR);

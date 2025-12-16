/** Types generated for queries found in "src/sql/select.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import { LobbyStatus, MatchResult, RockPaperScissors } from '../common.ts';

/** 'GetLobbyById' parameters type */
export interface IGetLobbyByIdParams {
  lobby_id?: string | null | void;
}

/** 'GetLobbyById' return type */
export interface IGetLobbyByIdResult {
  lobby_id: string;
  num_of_rounds: number;
  round_length: number;
  current_round: number;
  round_winner: string;
  created_at: Date;
  creation_block_height: number;
  hidden: boolean;
  practice: boolean;
  lobby_creator: string;
  player_two: string | null;
  lobby_state: LobbyStatus;
  latest_match_state: string;
}

/** 'GetLobbyById' query type */
export interface IGetLobbyByIdQuery {
  params: IGetLobbyByIdParams;
  result: IGetLobbyByIdResult;
}

const getLobbyByIdIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":35,"b":43}]}],"statement":"SELECT * FROM lobbies\nWHERE lobby_id = :lobby_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE lobby_id = :lobby_id
 * ```
 */
export const getLobbyById = new PreparedQuery<IGetLobbyByIdParams,IGetLobbyByIdResult>(getLobbyByIdIR);


/** 'GetUserStats' parameters type */
export interface IGetUserStatsParams {
  wallet?: string | null | void;
}

/** 'GetUserStats' return type */
export interface IGetUserStatsResult {
  wallet: string;
  wins: number;
  losses: number;
  ties: number;
}

/** 'GetUserStats' query type */
export interface IGetUserStatsQuery {
  params: IGetUserStatsParams;
  result: IGetUserStatsResult;
}

const getUserStatsIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":47,"b":53}]}],"statement":"SELECT * FROM global_user_state\nWHERE wallet = :wallet"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_user_state
 * WHERE wallet = :wallet
 * ```
 */
export const getUserStats = new PreparedQuery<IGetUserStatsParams,IGetUserStatsResult>(getUserStatsIR);


/** 'GetPaginatedOpenLobbies' parameters type */
export interface IGetPaginatedOpenLobbiesParams {
  count?: number | null | void;
  page?: number | null | void;
}

/** 'GetPaginatedOpenLobbies' return type */
export interface IGetPaginatedOpenLobbiesResult {
  lobby_id: string;
  num_of_rounds: number;
  round_length: number;
  current_round: number;
  round_winner: string;
  created_at: Date;
  creation_block_height: number;
  hidden: boolean;
  practice: boolean;
  lobby_creator: string;
  player_two: string | null;
  lobby_state: LobbyStatus;
  latest_match_state: string;
}

/** 'GetPaginatedOpenLobbies' query type */
export interface IGetPaginatedOpenLobbiesQuery {
  params: IGetPaginatedOpenLobbiesParams;
  result: IGetPaginatedOpenLobbiesResult;
}

const getPaginatedOpenLobbiesIR: any = {"usedParamSet":{"count":true,"page":true},"params":[{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":96,"b":101}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":109,"b":113}]}],"statement":"SELECT * FROM lobbies\nWHERE lobby_state = 'open' AND hidden = false\nORDER BY created_at DESC\nLIMIT :count OFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE lobby_state = 'open' AND hidden = false
 * ORDER BY created_at DESC
 * LIMIT :count OFFSET :page
 * ```
 */
export const getPaginatedOpenLobbies = new PreparedQuery<IGetPaginatedOpenLobbiesParams,IGetPaginatedOpenLobbiesResult>(getPaginatedOpenLobbiesIR);


/** 'GetUserLobbies' parameters type */
export interface IGetUserLobbiesParams {
  wallet?: string | null | void;
  count?: number | null | void;
  page?: number | null | void;
}

/** 'GetUserLobbies' return type */
export interface IGetUserLobbiesResult {
  lobby_id: string;
  num_of_rounds: number;
  round_length: number;
  current_round: number;
  round_winner: string;
  created_at: Date;
  creation_block_height: number;
  hidden: boolean;
  practice: boolean;
  lobby_creator: string;
  player_two: string | null;
  lobby_state: LobbyStatus;
  latest_match_state: string;
}

/** 'GetUserLobbies' query type */
export interface IGetUserLobbiesQuery {
  params: IGetUserLobbiesParams;
  result: IGetUserLobbiesResult;
}

const getUserLobbiesIR: any = {"usedParamSet":{"wallet":true,"count":true,"page":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":48,"b":54},{"a":73,"b":79}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":155,"b":160}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":168,"b":172}]}],"statement":"SELECT * FROM lobbies\nWHERE (lobby_creator = :wallet OR player_two = :wallet)\n  AND lobby_state IN ('active', 'finished')\nORDER BY created_at DESC\nLIMIT :count OFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE (lobby_creator = :wallet OR player_two = :wallet)
 *   AND lobby_state IN ('active', 'finished')
 * ORDER BY created_at DESC
 * LIMIT :count OFFSET :page
 * ```
 */
export const getUserLobbies = new PreparedQuery<IGetUserLobbiesParams,IGetUserLobbiesResult>(getUserLobbiesIR);


/** 'GetRoundData' parameters type */
export interface IGetRoundDataParams {
  lobby_id?: string | null | void;
  round?: number | null | void;
}

/** 'GetRoundData' return type */
export interface IGetRoundDataResult {
  id: number;
  lobby_id: string;
  round_within_match: number;
  starting_block_height: number;
  execution_block_height: number | null;
}

/** 'GetRoundData' query type */
export interface IGetRoundDataQuery {
  params: IGetRoundDataParams;
  result: IGetRoundDataResult;
}

const getRoundDataIR: any = {"usedParamSet":{"lobby_id":true,"round":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":33,"b":41}]},{"name":"round","required":false,"transform":{"type":"scalar"},"locs":[{"a":67,"b":72}]}],"statement":"SELECT * FROM rounds\nWHERE lobby_id = :lobby_id AND round_within_match = :round"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM rounds
 * WHERE lobby_id = :lobby_id AND round_within_match = :round
 * ```
 */
export const getRoundData = new PreparedQuery<IGetRoundDataParams,IGetRoundDataResult>(getRoundDataIR);


/** 'GetCachedMoves' parameters type */
export interface IGetCachedMovesParams {
  lobby_id?: string | null | void;
  round?: number | null | void;
}

/** 'GetCachedMoves' return type */
export interface IGetCachedMovesResult {
  id: number;
  lobby_id: string;
  wallet: string;
  round: number;
  move_rps: RockPaperScissors;
}

/** 'GetCachedMoves' query type */
export interface IGetCachedMovesQuery {
  params: IGetCachedMovesParams;
  result: IGetCachedMovesResult;
}

const getCachedMovesIR: any = {"usedParamSet":{"lobby_id":true,"round":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":38,"b":46}]},{"name":"round","required":false,"transform":{"type":"scalar"},"locs":[{"a":58,"b":63}]}],"statement":"SELECT * FROM match_moves\nWHERE lobby_id = :lobby_id AND round = :round"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM match_moves
 * WHERE lobby_id = :lobby_id AND round = :round
 * ```
 */
export const getCachedMoves = new PreparedQuery<IGetCachedMovesParams,IGetCachedMovesResult>(getCachedMovesIR);


/** 'GetFinalMatchState' parameters type */
export interface IGetFinalMatchStateParams {
  lobby_id?: string | null | void;
}

/** 'GetFinalMatchState' return type */
export interface IGetFinalMatchStateResult {
  lobby_id: string;
  player_one_wallet: string;
  player_one_result: MatchResult;
  player_two_wallet: string;
  player_two_result: MatchResult;
  total_time: number;
  game_moves: string;
}

/** 'GetFinalMatchState' query type */
export interface IGetFinalMatchStateQuery {
  params: IGetFinalMatchStateParams;
  result: IGetFinalMatchStateResult;
}

const getFinalMatchStateIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":46,"b":54}]}],"statement":"SELECT * FROM final_match_state\nWHERE lobby_id = :lobby_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM final_match_state
 * WHERE lobby_id = :lobby_id
 * ```
 */
export const getFinalMatchState = new PreparedQuery<IGetFinalMatchStateParams,IGetFinalMatchStateResult>(getFinalMatchStateIR);


/** 'GetAllRounds' parameters type */
export interface IGetAllRoundsParams {
  lobby_id?: string | null | void;
}

/** 'GetAllRounds' return type */
export interface IGetAllRoundsResult {
  id: number;
  lobby_id: string;
  round_within_match: number;
  starting_block_height: number;
  execution_block_height: number | null;
}

/** 'GetAllRounds' query type */
export interface IGetAllRoundsQuery {
  params: IGetAllRoundsParams;
  result: IGetAllRoundsResult;
}

const getAllRoundsIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":33,"b":41}]}],"statement":"SELECT * FROM rounds\nWHERE lobby_id = :lobby_id\nORDER BY round_within_match ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM rounds
 * WHERE lobby_id = :lobby_id
 * ORDER BY round_within_match ASC
 * ```
 */
export const getAllRounds = new PreparedQuery<IGetAllRoundsParams,IGetAllRoundsResult>(getAllRoundsIR);


/** 'GetAllMovesForLobby' parameters type */
export interface IGetAllMovesForLobbyParams {
  lobby_id?: string | null | void;
}

/** 'GetAllMovesForLobby' return type */
export interface IGetAllMovesForLobbyResult {
  id: number;
  lobby_id: string;
  wallet: string;
  round: number;
  move_rps: RockPaperScissors;
}

/** 'GetAllMovesForLobby' query type */
export interface IGetAllMovesForLobbyQuery {
  params: IGetAllMovesForLobbyParams;
  result: IGetAllMovesForLobbyResult;
}

const getAllMovesForLobbyIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":38,"b":46}]}],"statement":"SELECT * FROM match_moves\nWHERE lobby_id = :lobby_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM match_moves
 * WHERE lobby_id = :lobby_id
 * ```
 */
export const getAllMovesForLobby = new PreparedQuery<IGetAllMovesForLobbyParams,IGetAllMovesForLobbyResult>(getAllMovesForLobbyIR);

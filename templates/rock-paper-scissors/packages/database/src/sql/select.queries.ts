/** Types generated for queries found in "src/sql/select.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type lobby_status = 'active' | 'closed' | 'finished' | 'open';

export type match_result = 'loss' | 'tie' | 'win';

export type rock_paper_scissors = 'P' | 'R' | 'S';

export type NumberOrString = number | string;

/** 'GetLobbyById' parameters type */
export interface IGetLobbyByIdParams {
  lobby_id?: string | null | void;
}

/** 'GetLobbyById' return type */
export interface IGetLobbyByIdResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  player_two: string | null;
  practice: boolean;
  round_length: number;
  round_winner: string;
}

/** 'GetLobbyById' query type */
export interface IGetLobbyByIdQuery {
  params: IGetLobbyByIdParams;
  result: IGetLobbyByIdResult;
}

const getLobbyByIdIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":39,"b":47}]}],"statement":"SELECT * FROM lobbies\nWHERE lobby_id = :lobby_id"};

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
  losses: number;
  ties: number;
  wallet: string;
  wins: number;
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
  count?: NumberOrString | null | void;
  page?: NumberOrString | null | void;
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
  player_two: string | null;
  practice: boolean;
  round_length: number;
  round_winner: string;
}

/** 'GetPaginatedOpenLobbies' query type */
export interface IGetPaginatedOpenLobbiesQuery {
  params: IGetPaginatedOpenLobbiesParams;
  result: IGetPaginatedOpenLobbiesResult;
}

const getPaginatedOpenLobbiesIR: any = {"usedParamSet":{"count":true,"page":true},"params":[{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":99,"b":104}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":113,"b":117}]}],"statement":"SELECT * FROM lobbies\nWHERE lobby_state = 'open' AND hidden = false\nORDER BY created_at DESC\nLIMIT :count OFFSET :page"};

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
  count?: NumberOrString | null | void;
  page?: NumberOrString | null | void;
  wallet?: string | null | void;
}

/** 'GetUserLobbies' return type */
export interface IGetUserLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  player_two: string | null;
  practice: boolean;
  round_length: number;
  round_winner: string;
}

/** 'GetUserLobbies' query type */
export interface IGetUserLobbiesQuery {
  params: IGetUserLobbiesParams;
  result: IGetUserLobbiesResult;
}

const getUserLobbiesIR: any = {"usedParamSet":{"wallet":true,"count":true,"page":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":45,"b":51},{"a":69,"b":75}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":153,"b":158}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":167,"b":171}]}],"statement":"SELECT * FROM lobbies\nWHERE (lobby_creator = :wallet OR player_two = :wallet)\n  AND lobby_state IN ('active', 'finished')\nORDER BY created_at DESC\nLIMIT :count OFFSET :page"};

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
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  round_within_match: number;
  starting_block_height: number;
}

/** 'GetRoundData' query type */
export interface IGetRoundDataQuery {
  params: IGetRoundDataParams;
  result: IGetRoundDataResult;
}

const getRoundDataIR: any = {"usedParamSet":{"lobby_id":true,"round":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":38,"b":46}]},{"name":"round","required":false,"transform":{"type":"scalar"},"locs":[{"a":73,"b":78}]}],"statement":"SELECT * FROM rounds\nWHERE lobby_id = :lobby_id AND round_within_match = :round"};

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
  move_rps: rock_paper_scissors;
  round: number;
  wallet: string;
}

/** 'GetCachedMoves' query type */
export interface IGetCachedMovesQuery {
  params: IGetCachedMovesParams;
  result: IGetCachedMovesResult;
}

const getCachedMovesIR: any = {"usedParamSet":{"lobby_id":true,"round":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":43,"b":51}]},{"name":"round","required":false,"transform":{"type":"scalar"},"locs":[{"a":65,"b":70}]}],"statement":"SELECT * FROM match_moves\nWHERE lobby_id = :lobby_id AND round = :round"};

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
  game_moves: string;
  lobby_id: string;
  player_one_result: match_result;
  player_one_wallet: string;
  player_two_result: match_result;
  player_two_wallet: string;
  total_time: number;
}

/** 'GetFinalMatchState' query type */
export interface IGetFinalMatchStateQuery {
  params: IGetFinalMatchStateParams;
  result: IGetFinalMatchStateResult;
}

const getFinalMatchStateIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":49,"b":57}]}],"statement":"SELECT * FROM final_match_state\nWHERE lobby_id = :lobby_id"};

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
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  round_within_match: number;
  starting_block_height: number;
}

/** 'GetAllRounds' query type */
export interface IGetAllRoundsQuery {
  params: IGetAllRoundsParams;
  result: IGetAllRoundsResult;
}

const getAllRoundsIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":38,"b":46}]}],"statement":"SELECT * FROM rounds\nWHERE lobby_id = :lobby_id\nORDER BY round_within_match ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM rounds
 * WHERE lobby_id = :lobby_id
 * ORDER BY round_within_match ASC
 * ```
 */
export const getAllRounds = new PreparedQuery<IGetAllRoundsParams,IGetAllRoundsResult>(getAllRoundsIR);



/** Types generated for queries found in "src/queries/select.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { LobbyStatus, RockPaperScissors, MatchResult } from '@src/common.js';

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
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  round_length: number;
  round_winner: string;
}

/** 'GetPaginatedOpenLobbies' query type */
export interface IGetPaginatedOpenLobbiesQuery {
  params: IGetPaginatedOpenLobbiesParams;
  result: IGetPaginatedOpenLobbiesResult;
}

const getPaginatedOpenLobbiesIR: any = {"usedParamSet":{"wallet":true,"count":true,"page":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":359,"b":365}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":398,"b":403}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":412,"b":416}]}],"statement":"SELECT \nlobbies.lobby_id,\nlobbies.num_of_rounds,\nlobbies.round_length,\nlobbies.current_round,\nlobbies.created_at,\nlobbies.creation_block_height,\nlobbies.hidden,\nlobbies.lobby_creator,\nlobbies.lobby_state,\nlobbies.latest_match_state,\nlobbies.round_winner\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 * lobbies.lobby_id,
 * lobbies.num_of_rounds,
 * lobbies.round_length,
 * lobbies.current_round,
 * lobbies.created_at,
 * lobbies.creation_block_height,
 * lobbies.hidden,
 * lobbies.lobby_creator,
 * lobbies.lobby_state,
 * lobbies.latest_match_state,
 * lobbies.round_winner
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const getPaginatedOpenLobbies = new PreparedQuery<IGetPaginatedOpenLobbiesParams,IGetPaginatedOpenLobbiesResult>(getPaginatedOpenLobbiesIR);


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
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  round_length: number;
  round_winner: string;
}

/** 'SearchPaginatedOpenLobbies' query type */
export interface ISearchPaginatedOpenLobbiesQuery {
  params: ISearchPaginatedOpenLobbiesParams;
  result: ISearchPaginatedOpenLobbiesResult;
}

const searchPaginatedOpenLobbiesIR: any = {"usedParamSet":{"wallet":true,"searchQuery":true,"count":true,"page":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":359,"b":365}]},{"name":"searchQuery","required":false,"transform":{"type":"scalar"},"locs":[{"a":393,"b":404}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":437,"b":442}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":451,"b":455}]}],"statement":"SELECT \nlobbies.lobby_id,\nlobbies.num_of_rounds,\nlobbies.round_length,\nlobbies.current_round,\nlobbies.created_at,\nlobbies.creation_block_height,\nlobbies.hidden,\nlobbies.lobby_creator,\nlobbies.lobby_state,\nlobbies.latest_match_state,\nlobbies.round_winner\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet AND lobbies.lobby_id LIKE :searchQuery\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 * lobbies.lobby_id,
 * lobbies.num_of_rounds,
 * lobbies.round_length,
 * lobbies.current_round,
 * lobbies.created_at,
 * lobbies.creation_block_height,
 * lobbies.hidden,
 * lobbies.lobby_creator,
 * lobbies.lobby_state,
 * lobbies.latest_match_state,
 * lobbies.round_winner
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet AND lobbies.lobby_id LIKE :searchQuery
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const searchPaginatedOpenLobbies = new PreparedQuery<ISearchPaginatedOpenLobbiesParams,ISearchPaginatedOpenLobbiesResult>(searchPaginatedOpenLobbiesIR);


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
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  round_length: number;
  round_winner: string;
}

/** 'GetOpenLobbyById' query type */
export interface IGetOpenLobbyByIdQuery {
  params: IGetOpenLobbyByIdParams;
  result: IGetOpenLobbyByIdResult;
}

const getOpenLobbyByIdIR: any = {"usedParamSet":{"searchQuery":true,"wallet":true},"params":[{"name":"searchQuery","required":false,"transform":{"type":"scalar"},"locs":[{"a":325,"b":336}]},{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":367,"b":373}]}],"statement":"SELECT \nlobbies.lobby_id,\nlobbies.num_of_rounds,\nlobbies.round_length,\nlobbies.current_round,\nlobbies.created_at,\nlobbies.creation_block_height,\nlobbies.hidden,\nlobbies.lobby_creator,\nlobbies.lobby_state,\nlobbies.latest_match_state,\nlobbies.round_winner\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :wallet"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 * lobbies.lobby_id,
 * lobbies.num_of_rounds,
 * lobbies.round_length,
 * lobbies.current_round,
 * lobbies.created_at,
 * lobbies.creation_block_height,
 * lobbies.hidden,
 * lobbies.lobby_creator,
 * lobbies.lobby_state,
 * lobbies.latest_match_state,
 * lobbies.round_winner
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :wallet
 * ```
 */
export const getOpenLobbyById = new PreparedQuery<IGetOpenLobbyByIdParams,IGetOpenLobbyByIdResult>(getOpenLobbyByIdIR);


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
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  round_length: number;
  round_winner: string;
}

/** 'GetRandomLobby' query type */
export interface IGetRandomLobbyQuery {
  params: IGetRandomLobbyParams;
  result: IGetRandomLobbyResult;
}

const getRandomLobbyIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT\nlobbies.lobby_id,\nlobbies.num_of_rounds,\nlobbies.round_length,\nlobbies.current_round,\nlobbies.created_at,\nlobbies.creation_block_height,\nlobbies.hidden,\nlobbies.lobby_creator,\nlobbies.lobby_state,\nlobbies.latest_match_state,\nlobbies.round_winner\nFROM lobbies\nWHERE random() < 0.1\nAND lobbies.lobby_state = 'open' AND lobbies.hidden is FALSE\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 * lobbies.lobby_id,
 * lobbies.num_of_rounds,
 * lobbies.round_length,
 * lobbies.current_round,
 * lobbies.created_at,
 * lobbies.creation_block_height,
 * lobbies.hidden,
 * lobbies.lobby_creator,
 * lobbies.lobby_state,
 * lobbies.latest_match_state,
 * lobbies.round_winner
 * FROM lobbies
 * WHERE random() < 0.1
 * AND lobbies.lobby_state = 'open' AND lobbies.hidden is FALSE
 * LIMIT 1
 * ```
 */
export const getRandomLobby = new PreparedQuery<IGetRandomLobbyParams,IGetRandomLobbyResult>(getRandomLobbyIR);


/** 'GetRandomActiveLobby' parameters type */
export type IGetRandomActiveLobbyParams = void;

/** 'GetRandomActiveLobby' return type */
export interface IGetRandomActiveLobbyResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  player_two: string | null;
  practice: boolean;
  round_length: number;
  round_winner: string;
}

/** 'GetRandomActiveLobby' query type */
export interface IGetRandomActiveLobbyQuery {
  params: IGetRandomActiveLobbyParams;
  result: IGetRandomActiveLobbyResult;
}

const getRandomActiveLobbyIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM lobbies\nWHERE random() < 0.1\nAND lobbies.lobby_state = 'active'\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE random() < 0.1
 * AND lobbies.lobby_state = 'active'
 * LIMIT 1
 * ```
 */
export const getRandomActiveLobby = new PreparedQuery<IGetRandomActiveLobbyParams,IGetRandomActiveLobbyResult>(getRandomActiveLobbyIR);


/** 'GetUserLobbies' parameters type */
export interface IGetUserLobbiesParams {
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
  lobby_state: LobbyStatus;
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

const getUserLobbiesIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":127,"b":133},{"a":159,"b":165}]}],"statement":"SELECT * FROM lobbies\nWHERE lobbies.lobby_state != 'finished'\nAND lobbies.lobby_state != 'closed'\nAND (lobbies.lobby_creator = :wallet\nOR lobbies.player_two = :wallet)\nORDER BY created_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE lobbies.lobby_state != 'finished'
 * AND lobbies.lobby_state != 'closed'
 * AND (lobbies.lobby_creator = :wallet
 * OR lobbies.player_two = :wallet)
 * ORDER BY created_at DESC
 * ```
 */
export const getUserLobbies = new PreparedQuery<IGetUserLobbiesParams,IGetUserLobbiesResult>(getUserLobbiesIR);


/** 'GetPaginatedUserLobbies' parameters type */
export interface IGetPaginatedUserLobbiesParams {
  count?: NumberOrString | null | void;
  page?: NumberOrString | null | void;
  wallet?: string | null | void;
}

/** 'GetPaginatedUserLobbies' return type */
export interface IGetPaginatedUserLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  player_two: string | null;
  practice: boolean;
  round_length: number;
  round_winner: string;
}

/** 'GetPaginatedUserLobbies' query type */
export interface IGetPaginatedUserLobbiesQuery {
  params: IGetPaginatedUserLobbiesParams;
  result: IGetPaginatedUserLobbiesResult;
}

const getPaginatedUserLobbiesIR: any = {"usedParamSet":{"wallet":true,"count":true,"page":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":127,"b":133},{"a":159,"b":165}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":199,"b":204}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":213,"b":217}]}],"statement":"SELECT * FROM lobbies\nWHERE lobbies.lobby_state != 'finished'\nAND lobbies.lobby_state != 'closed'\nAND (lobbies.lobby_creator = :wallet\nOR lobbies.player_two = :wallet)\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE lobbies.lobby_state != 'finished'
 * AND lobbies.lobby_state != 'closed'
 * AND (lobbies.lobby_creator = :wallet
 * OR lobbies.player_two = :wallet)
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const getPaginatedUserLobbies = new PreparedQuery<IGetPaginatedUserLobbiesParams,IGetPaginatedUserLobbiesResult>(getPaginatedUserLobbiesIR);


/** 'GetAllPaginatedUserLobbies' parameters type */
export interface IGetAllPaginatedUserLobbiesParams {
  count?: NumberOrString | null | void;
  page?: NumberOrString | null | void;
  wallet?: string | null | void;
}

/** 'GetAllPaginatedUserLobbies' return type */
export interface IGetAllPaginatedUserLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  player_two: string | null;
  practice: boolean;
  round_length: number;
  round_winner: string;
}

/** 'GetAllPaginatedUserLobbies' query type */
export interface IGetAllPaginatedUserLobbiesQuery {
  params: IGetAllPaginatedUserLobbiesParams;
  result: IGetAllPaginatedUserLobbiesResult;
}

const getAllPaginatedUserLobbiesIR: any = {"usedParamSet":{"wallet":true,"count":true,"page":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":53,"b":59},{"a":85,"b":91}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":239,"b":244}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":253,"b":257}]}],"statement":"SELECT * FROM lobbies\nWHERE (lobbies.lobby_creator = :wallet\nOR lobbies.player_two = :wallet)\nORDER BY lobby_state = 'active' DESC,\n         lobby_state = 'open' DESC,\n         lobby_state = 'finished' DESC,\n         created_at DESC\nLIMIT :count\nOFFSET :page"};

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
export const getAllPaginatedUserLobbies = new PreparedQuery<IGetAllPaginatedUserLobbiesParams,IGetAllPaginatedUserLobbiesResult>(getAllPaginatedUserLobbiesIR);


/** 'GetActiveLobbies' parameters type */
export type IGetActiveLobbiesParams = void;

/** 'GetActiveLobbies' return type */
export interface IGetActiveLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: LobbyStatus;
  num_of_rounds: number;
  player_two: string | null;
  practice: boolean;
  round_length: number;
  round_winner: string;
}

/** 'GetActiveLobbies' query type */
export interface IGetActiveLobbiesQuery {
  params: IGetActiveLobbiesParams;
  result: IGetActiveLobbiesResult;
}

const getActiveLobbiesIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM lobbies\nWHERE lobbies.lobby_state = 'active'"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE lobbies.lobby_state = 'active'
 * ```
 */
export const getActiveLobbies = new PreparedQuery<IGetActiveLobbiesParams,IGetActiveLobbiesResult>(getActiveLobbiesIR);


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
  lobby_state: LobbyStatus;
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


/** 'GetBothUserStats' parameters type */
export interface IGetBothUserStatsParams {
  wallet?: string | null | void;
  wallet2?: string | null | void;
}

/** 'GetBothUserStats' return type */
export interface IGetBothUserStatsResult {
  losses: number;
  ties: number;
  wallet: string;
  wins: number;
}

/** 'GetBothUserStats' query type */
export interface IGetBothUserStatsQuery {
  params: IGetBothUserStatsParams;
  result: IGetBothUserStatsResult;
}

const getBothUserStatsIR: any = {"usedParamSet":{"wallet":true,"wallet2":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":108,"b":114}]},{"name":"wallet2","required":false,"transform":{"type":"scalar"},"locs":[{"a":146,"b":153}]}],"statement":"SELECT global_user_state.wallet, wins, losses, ties\nFROM global_user_state\nWHERE global_user_state.wallet = :wallet\nOR global_user_state.wallet = :wallet2"};

/**
 * Query generated from SQL:
 * ```
 * SELECT global_user_state.wallet, wins, losses, ties
 * FROM global_user_state
 * WHERE global_user_state.wallet = :wallet
 * OR global_user_state.wallet = :wallet2
 * ```
 */
export const getBothUserStats = new PreparedQuery<IGetBothUserStatsParams,IGetBothUserStatsResult>(getBothUserStatsIR);


/** 'GetMatchUserStats' parameters type */
export interface IGetMatchUserStatsParams {
  wallet1?: string | null | void;
}

/** 'GetMatchUserStats' return type */
export interface IGetMatchUserStatsResult {
  created_at: Date;
  creation_block_height: number;
  current_round: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: LobbyStatus;
  losses: number;
  num_of_rounds: number;
  player_two: string | null;
  practice: boolean;
  round_length: number;
  round_winner: string;
  ties: number;
  wallet: string;
  wins: number;
}

/** 'GetMatchUserStats' query type */
export interface IGetMatchUserStatsQuery {
  params: IGetMatchUserStatsParams;
  result: IGetMatchUserStatsResult;
}

const getMatchUserStatsIR: any = {"usedParamSet":{"wallet1":true},"params":[{"name":"wallet1","required":false,"transform":{"type":"scalar"},"locs":[{"a":185,"b":192}]}],"statement":"SELECT * FROM global_user_state\nINNER JOIN lobbies\nON lobbies.lobby_creator = global_user_state.wallet\nOR lobbies.player_two = global_user_state.wallet\nWHERE global_user_state.wallet = :wallet1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_user_state
 * INNER JOIN lobbies
 * ON lobbies.lobby_creator = global_user_state.wallet
 * OR lobbies.player_two = global_user_state.wallet
 * WHERE global_user_state.wallet = :wallet1
 * ```
 */
export const getMatchUserStats = new PreparedQuery<IGetMatchUserStatsParams,IGetMatchUserStatsResult>(getMatchUserStatsIR);


/** 'GetRoundMoves' parameters type */
export interface IGetRoundMovesParams {
  lobby_id: string;
  round: number;
}

/** 'GetRoundMoves' return type */
export interface IGetRoundMovesResult {
  id: number;
  lobby_id: string;
  move_rps: RockPaperScissors;
  round: number;
  wallet: string;
}

/** 'GetRoundMoves' query type */
export interface IGetRoundMovesQuery {
  params: IGetRoundMovesParams;
  result: IGetRoundMovesResult;
}

const getRoundMovesIR: any = {"usedParamSet":{"lobby_id":true,"round":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":43,"b":52}]},{"name":"round","required":true,"transform":{"type":"scalar"},"locs":[{"a":68,"b":74}]}],"statement":"SELECT * FROM match_moves\nWHERE lobby_id = :lobby_id!\nAND   round = :round!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM match_moves
 * WHERE lobby_id = :lobby_id!
 * AND   round = :round!
 * ```
 */
export const getRoundMoves = new PreparedQuery<IGetRoundMovesParams,IGetRoundMovesResult>(getRoundMovesIR);


/** 'GetCachedMoves' parameters type */
export interface IGetCachedMovesParams {
  lobby_id?: string | null | void;
}

/** 'GetCachedMoves' return type */
export interface IGetCachedMovesResult {
  id: number;
  lobby_id: string;
  move_rps: RockPaperScissors;
  round: number;
  wallet: string;
}

/** 'GetCachedMoves' query type */
export interface IGetCachedMovesQuery {
  params: IGetCachedMovesParams;
  result: IGetCachedMovesResult;
}

const getCachedMovesIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":303,"b":311}]}],"statement":"SELECT\nmatch_moves.id,\nmatch_moves.lobby_id,\nmatch_moves.wallet,\nmatch_moves.move_rps,\nmatch_moves.round\nFROM match_moves\nINNER JOIN rounds\nON match_moves.lobby_id = rounds.lobby_id\nAND match_moves.round = rounds.round_within_match\nWHERE rounds.execution_block_height IS NULL\nAND match_moves.lobby_id = :lobby_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 * match_moves.id,
 * match_moves.lobby_id,
 * match_moves.wallet,
 * match_moves.move_rps,
 * match_moves.round
 * FROM match_moves
 * INNER JOIN rounds
 * ON match_moves.lobby_id = rounds.lobby_id
 * AND match_moves.round = rounds.round_within_match
 * WHERE rounds.execution_block_height IS NULL
 * AND match_moves.lobby_id = :lobby_id
 * ```
 */
export const getCachedMoves = new PreparedQuery<IGetCachedMovesParams,IGetCachedMovesResult>(getCachedMovesIR);


/** 'GetMovesByLobby' parameters type */
export interface IGetMovesByLobbyParams {
  lobby_id?: string | null | void;
}

/** 'GetMovesByLobby' return type */
export interface IGetMovesByLobbyResult {
  id: number;
  lobby_id: string;
  move_rps: RockPaperScissors;
  round: number;
  wallet: string;
}

/** 'GetMovesByLobby' query type */
export interface IGetMovesByLobbyQuery {
  params: IGetMovesByLobbyParams;
  result: IGetMovesByLobbyResult;
}

const getMovesByLobbyIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":55,"b":63}]}],"statement":"SELECT *\nFROM match_moves\nWHERE match_moves.lobby_id = :lobby_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM match_moves
 * WHERE match_moves.lobby_id = :lobby_id
 * ```
 */
export const getMovesByLobby = new PreparedQuery<IGetMovesByLobbyParams,IGetMovesByLobbyResult>(getMovesByLobbyIR);


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

const getNewLobbiesByUserAndBlockHeightIR: any = {"usedParamSet":{"wallet":true,"block_height":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":51,"b":57}]},{"name":"block_height","required":false,"transform":{"type":"scalar"},"locs":[{"a":87,"b":99}]}],"statement":"SELECT lobby_id FROM lobbies\nWHERE lobby_creator = :wallet\nAND creation_block_height = :block_height"};

/**
 * Query generated from SQL:
 * ```
 * SELECT lobby_id FROM lobbies
 * WHERE lobby_creator = :wallet
 * AND creation_block_height = :block_height
 * ```
 */
export const getNewLobbiesByUserAndBlockHeight = new PreparedQuery<IGetNewLobbiesByUserAndBlockHeightParams,IGetNewLobbiesByUserAndBlockHeightResult>(getNewLobbiesByUserAndBlockHeightIR);


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
  round_within_match: number;
  starting_block_height: number;
}

/** 'GetRoundData' query type */
export interface IGetRoundDataQuery {
  params: IGetRoundDataParams;
  result: IGetRoundDataResult;
}

const getRoundDataIR: any = {"usedParamSet":{"lobby_id":true,"round_number":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":38,"b":47}]},{"name":"round_number","required":false,"transform":{"type":"scalar"},"locs":[{"a":74,"b":86}]}],"statement":"SELECT * FROM rounds\nWHERE lobby_id = :lobby_id!\nAND round_within_match = :round_number"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM rounds
 * WHERE lobby_id = :lobby_id!
 * AND round_within_match = :round_number
 * ```
 */
export const getRoundData = new PreparedQuery<IGetRoundDataParams,IGetRoundDataResult>(getRoundDataIR);


/** 'GetMatchSeeds' parameters type */
export interface IGetMatchSeedsParams {
  lobby_id?: string | null | void;
}

/** 'GetMatchSeeds' return type */
export interface IGetMatchSeedsResult {
  block_height: number;
  done: boolean;
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  round_within_match: number;
  seed: string;
  starting_block_height: number;
}

/** 'GetMatchSeeds' query type */
export interface IGetMatchSeedsQuery {
  params: IGetMatchSeedsParams;
  result: IGetMatchSeedsResult;
}

const getMatchSeedsIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":132,"b":140}]}],"statement":"SELECT * FROM rounds\nINNER JOIN block_heights\nON block_heights.block_height = rounds.execution_block_height\nWHERE rounds.lobby_id = :lobby_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM rounds
 * INNER JOIN block_heights
 * ON block_heights.block_height = rounds.execution_block_height
 * WHERE rounds.lobby_id = :lobby_id
 * ```
 */
export const getMatchSeeds = new PreparedQuery<IGetMatchSeedsParams,IGetMatchSeedsResult>(getMatchSeedsIR);


/** 'GetFinalState' parameters type */
export interface IGetFinalStateParams {
  lobby_id?: string | null | void;
}

/** 'GetFinalState' return type */
export interface IGetFinalStateResult {
  game_moves: string;
  lobby_id: string;
  player_one_result: MatchResult;
  player_one_wallet: string;
  player_two_result: MatchResult;
  player_two_wallet: string;
  total_time: number;
}

/** 'GetFinalState' query type */
export interface IGetFinalStateQuery {
  params: IGetFinalStateParams;
  result: IGetFinalStateResult;
}

const getFinalStateIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":49,"b":57}]}],"statement":"SELECT * FROM final_match_state\nWHERE lobby_id = :lobby_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM final_match_state
 * WHERE lobby_id = :lobby_id
 * ```
 */
export const getFinalState = new PreparedQuery<IGetFinalStateParams,IGetFinalStateResult>(getFinalStateIR);



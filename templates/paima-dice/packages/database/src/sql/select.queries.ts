/** Types generated for queries found in "src/sql/select.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { LobbyStatus } from '../../../common.ts';

export type NumberOrString = number | string;

/** 'GetPaginatedOpenLobbies' parameters type */
export interface IGetPaginatedOpenLobbiesParams {
  count?: NumberOrString | null | void;
  nft_id?: number | null | void;
  page?: NumberOrString | null | void;
}

/** 'GetPaginatedOpenLobbies' return type */
export interface IGetPaginatedOpenLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
}

/** 'GetPaginatedOpenLobbies' query type */
export interface IGetPaginatedOpenLobbiesQuery {
  params: IGetPaginatedOpenLobbiesParams;
  result: IGetPaginatedOpenLobbiesResult;
}

const getPaginatedOpenLobbiesIR: any = {"usedParamSet":{"nft_id":true,"count":true,"page":true},"params":[{"name":"nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":114,"b":120}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":153,"b":158}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":167,"b":171}]}],"statement":"SELECT *\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :nft_id\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :nft_id
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const getPaginatedOpenLobbies = new PreparedQuery<IGetPaginatedOpenLobbiesParams,IGetPaginatedOpenLobbiesResult>(getPaginatedOpenLobbiesIR);


/** 'SearchPaginatedOpenLobbies' parameters type */
export interface ISearchPaginatedOpenLobbiesParams {
  count?: NumberOrString | null | void;
  nft_id?: number | null | void;
  page?: NumberOrString | null | void;
  searchQuery?: string | null | void;
}

/** 'SearchPaginatedOpenLobbies' return type */
export interface ISearchPaginatedOpenLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
}

/** 'SearchPaginatedOpenLobbies' query type */
export interface ISearchPaginatedOpenLobbiesQuery {
  params: ISearchPaginatedOpenLobbiesParams;
  result: ISearchPaginatedOpenLobbiesResult;
}

const searchPaginatedOpenLobbiesIR: any = {"usedParamSet":{"nft_id":true,"searchQuery":true,"count":true,"page":true},"params":[{"name":"nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":114,"b":120}]},{"name":"searchQuery","required":false,"transform":{"type":"scalar"},"locs":[{"a":148,"b":159}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":192,"b":197}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":206,"b":210}]}],"statement":"SELECT *\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :nft_id AND lobbies.lobby_id LIKE :searchQuery\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :nft_id AND lobbies.lobby_id LIKE :searchQuery
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const searchPaginatedOpenLobbies = new PreparedQuery<ISearchPaginatedOpenLobbiesParams,ISearchPaginatedOpenLobbiesResult>(searchPaginatedOpenLobbiesIR);


/** 'GetOpenLobbyById' parameters type */
export interface IGetOpenLobbyByIdParams {
  nft_id?: number | null | void;
  searchQuery?: string | null | void;
}

/** 'GetOpenLobbyById' return type */
export interface IGetOpenLobbyByIdResult {
  created_at: Date;
  creation_block_height: number;
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
}

/** 'GetOpenLobbyById' query type */
export interface IGetOpenLobbyByIdQuery {
  params: IGetOpenLobbyByIdParams;
  result: IGetOpenLobbyByIdResult;
}

const getOpenLobbyByIdIR: any = {"usedParamSet":{"searchQuery":true,"nft_id":true},"params":[{"name":"searchQuery","required":false,"transform":{"type":"scalar"},"locs":[{"a":80,"b":91}]},{"name":"nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":122,"b":128}]}],"statement":"SELECT *\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :nft_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :nft_id
 * ```
 */
export const getOpenLobbyById = new PreparedQuery<IGetOpenLobbyByIdParams,IGetOpenLobbyByIdResult>(getOpenLobbyByIdIR);


/** 'GetLobbyPlayers' parameters type */
export interface IGetLobbyPlayersParams {
  lobby_id: string;
}

/** 'GetLobbyPlayers' return type */
export interface IGetLobbyPlayersResult {
  id: number;
  lobby_id: string;
  nft_id: number;
  points: number;
  score: number;
  turn: number | null;
}

/** 'GetLobbyPlayers' query type */
export interface IGetLobbyPlayersQuery {
  params: IGetLobbyPlayersParams;
  result: IGetLobbyPlayersResult;
}

const getLobbyPlayersIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":57,"b":66}]}],"statement":"SELECT *\nFROM lobby_player\nWHERE lobby_player.lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM lobby_player
 * WHERE lobby_player.lobby_id = :lobby_id!
 * ```
 */
export const getLobbyPlayers = new PreparedQuery<IGetLobbyPlayersParams,IGetLobbyPlayersResult>(getLobbyPlayersIR);


/** 'GetRandomLobby' parameters type */
export type IGetRandomLobbyParams = void;

/** 'GetRandomLobby' return type */
export interface IGetRandomLobbyResult {
  created_at: Date;
  creation_block_height: number;
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
}

/** 'GetRandomLobby' query type */
export interface IGetRandomLobbyQuery {
  params: IGetRandomLobbyParams;
  result: IGetRandomLobbyResult;
}

const getRandomLobbyIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT *\nFROM lobbies\nWHERE random() < 0.1\nAND lobbies.lobby_state = 'open' AND lobbies.hidden is FALSE\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
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
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
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
  nft_id: number;
}

/** 'GetUserLobbies' return type */
export interface IGetUserLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
}

/** 'GetUserLobbies' query type */
export interface IGetUserLobbiesQuery {
  params: IGetUserLobbiesParams;
  result: IGetUserLobbiesResult;
}

const getUserLobbiesIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":196,"b":203}]}],"statement":"SELECT lobbies.*\nFROM lobbies JOIN lobby_player\n  ON lobbies.lobby_id = lobby_player.lobby_id\nWHERE lobbies.lobby_state != 'finished'\nAND lobbies.lobby_state != 'closed'\nAND lobby_player.nft_id = :nft_id!\nORDER BY created_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT lobbies.*
 * FROM lobbies JOIN lobby_player
 *   ON lobbies.lobby_id = lobby_player.lobby_id
 * WHERE lobbies.lobby_state != 'finished'
 * AND lobbies.lobby_state != 'closed'
 * AND lobby_player.nft_id = :nft_id!
 * ORDER BY created_at DESC
 * ```
 */
export const getUserLobbies = new PreparedQuery<IGetUserLobbiesParams,IGetUserLobbiesResult>(getUserLobbiesIR);


/** 'GetPaginatedUserLobbies' parameters type */
export interface IGetPaginatedUserLobbiesParams {
  count?: NumberOrString | null | void;
  nft_id: number;
  page?: NumberOrString | null | void;
}

/** 'GetPaginatedUserLobbies' return type */
export interface IGetPaginatedUserLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
}

/** 'GetPaginatedUserLobbies' query type */
export interface IGetPaginatedUserLobbiesQuery {
  params: IGetPaginatedUserLobbiesParams;
  result: IGetPaginatedUserLobbiesResult;
}

const getPaginatedUserLobbiesIR: any = {"usedParamSet":{"nft_id":true,"count":true,"page":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":203,"b":210}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":269,"b":274}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":283,"b":287}]}],"statement":"SELECT lobbies.*\nFROM lobbies JOIN lobby_player\n  ON lobbies.lobby_id = lobby_player.lobby_id\nWHERE \n  lobbies.lobby_state != 'finished' AND\n  lobbies.lobby_state != 'closed' AND\n  lobby_player.nft_id = :nft_id!\nGROUP BY lobbies.lobby_id\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT lobbies.*
 * FROM lobbies JOIN lobby_player
 *   ON lobbies.lobby_id = lobby_player.lobby_id
 * WHERE 
 *   lobbies.lobby_state != 'finished' AND
 *   lobbies.lobby_state != 'closed' AND
 *   lobby_player.nft_id = :nft_id!
 * GROUP BY lobbies.lobby_id
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const getPaginatedUserLobbies = new PreparedQuery<IGetPaginatedUserLobbiesParams,IGetPaginatedUserLobbiesResult>(getPaginatedUserLobbiesIR);


/** 'GetAllPaginatedUserLobbies' parameters type */
export interface IGetAllPaginatedUserLobbiesParams {
  count?: NumberOrString | null | void;
  nft_id: number;
  page?: NumberOrString | null | void;
}

/** 'GetAllPaginatedUserLobbies' return type */
export interface IGetAllPaginatedUserLobbiesResult {
  created_at: Date;
  creation_block_height: number;
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
}

/** 'GetAllPaginatedUserLobbies' query type */
export interface IGetAllPaginatedUserLobbiesQuery {
  params: IGetAllPaginatedUserLobbiesParams;
  result: IGetAllPaginatedUserLobbiesResult;
}

const getAllPaginatedUserLobbiesIR: any = {"usedParamSet":{"nft_id":true,"count":true,"page":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":127,"b":134}]},{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":289,"b":294}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":303,"b":307}]}],"statement":"SELECT lobbies.*\nFROM \n  lobbies JOIN lobby_player\n    ON lobbies.lobby_id = lobby_player.lobby_id\nWHERE lobby_player.nft_id = :nft_id!\nGROUP BY lobbies.lobby_id\nORDER BY \n  lobby_state = 'active' DESC,\n  lobby_state = 'open' DESC,\n  lobby_state = 'finished' DESC,\n  created_at DESC\nLIMIT :count\nOFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT lobbies.*
 * FROM 
 *   lobbies JOIN lobby_player
 *     ON lobbies.lobby_id = lobby_player.lobby_id
 * WHERE lobby_player.nft_id = :nft_id!
 * GROUP BY lobbies.lobby_id
 * ORDER BY 
 *   lobby_state = 'active' DESC,
 *   lobby_state = 'open' DESC,
 *   lobby_state = 'finished' DESC,
 *   created_at DESC
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
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
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
  lobby_id: string;
}

/** 'GetLobbyById' return type */
export interface IGetLobbyByIdResult {
  created_at: Date;
  creation_block_height: number;
  current_match: number | null;
  current_proper_round: number | null;
  current_round: number | null;
  current_turn: number | null;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  play_time_per_player: number;
  practice: boolean;
  round_length: number;
}

/** 'GetLobbyById' query type */
export interface IGetLobbyByIdQuery {
  params: IGetLobbyByIdParams;
  result: IGetLobbyByIdResult;
}

const getLobbyByIdIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":39,"b":48}]}],"statement":"SELECT * FROM lobbies\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobbies
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const getLobbyById = new PreparedQuery<IGetLobbyByIdParams,IGetLobbyByIdResult>(getLobbyByIdIR);


/** 'GetMatch' parameters type */
export interface IGetMatchParams {
  lobby_id: string;
  match_within_lobby: number;
}

/** 'GetMatch' return type */
export interface IGetMatchResult {
  id: number;
  lobby_id: string;
  match_within_lobby: number;
  starting_block_height: number;
}

/** 'GetMatch' query type */
export interface IGetMatchQuery {
  params: IGetMatchParams;
  result: IGetMatchResult;
}

const getMatchIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":55}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":103}]}],"statement":"SELECT * FROM lobby_match\nWHERE \n  lobby_id = :lobby_id! AND\n  match_within_lobby = :match_within_lobby!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM lobby_match
 * WHERE 
 *   lobby_id = :lobby_id! AND
 *   match_within_lobby = :match_within_lobby!
 * ```
 */
export const getMatch = new PreparedQuery<IGetMatchParams,IGetMatchResult>(getMatchIR);


/** 'GetUserStats' parameters type */
export interface IGetUserStatsParams {
  nft_id?: number | null | void;
}

/** 'GetUserStats' return type */
export interface IGetUserStatsResult {
  losses: number;
  nft_id: number;
  ties: number;
  wins: number;
}

/** 'GetUserStats' query type */
export interface IGetUserStatsQuery {
  params: IGetUserStatsParams;
  result: IGetUserStatsResult;
}

const getUserStatsIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":47,"b":53}]}],"statement":"SELECT * FROM global_user_state\nWHERE nft_id = :nft_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_user_state
 * WHERE nft_id = :nft_id
 * ```
 */
export const getUserStats = new PreparedQuery<IGetUserStatsParams,IGetUserStatsResult>(getUserStatsIR);


/** 'GetBothUserStats' parameters type */
export interface IGetBothUserStatsParams {
  nft_id_1?: number | null | void;
  nft_id_2?: number | null | void;
}

/** 'GetBothUserStats' return type */
export interface IGetBothUserStatsResult {
  losses: number;
  nft_id: number;
  ties: number;
  wins: number;
}

/** 'GetBothUserStats' query type */
export interface IGetBothUserStatsQuery {
  params: IGetBothUserStatsParams;
  result: IGetBothUserStatsResult;
}

const getBothUserStatsIR: any = {"usedParamSet":{"nft_id_1":true,"nft_id_2":true},"params":[{"name":"nft_id_1","required":false,"transform":{"type":"scalar"},"locs":[{"a":108,"b":116}]},{"name":"nft_id_2","required":false,"transform":{"type":"scalar"},"locs":[{"a":148,"b":156}]}],"statement":"SELECT global_user_state.nft_id, wins, losses, ties\nFROM global_user_state\nWHERE global_user_state.nft_id = :nft_id_1\nOR global_user_state.nft_id = :nft_id_2"};

/**
 * Query generated from SQL:
 * ```
 * SELECT global_user_state.nft_id, wins, losses, ties
 * FROM global_user_state
 * WHERE global_user_state.nft_id = :nft_id_1
 * OR global_user_state.nft_id = :nft_id_2
 * ```
 */
export const getBothUserStats = new PreparedQuery<IGetBothUserStatsParams,IGetBothUserStatsResult>(getBothUserStatsIR);


/** 'GetRoundMoves' parameters type */
export interface IGetRoundMovesParams {
  lobby_id: string;
  match_within_lobby: number;
  round_within_match: number;
}

/** 'GetRoundMoves' return type */
export interface IGetRoundMovesResult {
  id: number;
  lobby_id: string;
  match_within_lobby: number;
  move_within_round: number;
  nft_id: number;
  roll_again: boolean;
  round_within_match: number;
}

/** 'GetRoundMoves' query type */
export interface IGetRoundMovesQuery {
  params: IGetRoundMovesParams;
  result: IGetRoundMovesResult;
}

const getRoundMovesIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true,"round_within_match":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":44,"b":53}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":82,"b":101}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":130,"b":149}]}],"statement":"SELECT *\nFROM round_move\nWHERE\n  lobby_id = :lobby_id! AND\n  match_within_lobby = :match_within_lobby! AND\n  round_within_match = :round_within_match!\nORDER BY round_move.move_within_round"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM round_move
 * WHERE
 *   lobby_id = :lobby_id! AND
 *   match_within_lobby = :match_within_lobby! AND
 *   round_within_match = :round_within_match!
 * ORDER BY round_move.move_within_round
 * ```
 */
export const getRoundMoves = new PreparedQuery<IGetRoundMovesParams,IGetRoundMovesResult>(getRoundMovesIR);


/** 'GetMatchMoves' parameters type */
export interface IGetMatchMovesParams {
  lobby_id: string;
  match_within_lobby: number;
}

/** 'GetMatchMoves' return type */
export interface IGetMatchMovesResult {
  id: number;
  lobby_id: string;
  match_within_lobby: number;
  move_within_round: number;
  nft_id: number;
  roll_again: boolean;
  round_within_match: number;
}

/** 'GetMatchMoves' query type */
export interface IGetMatchMovesQuery {
  params: IGetMatchMovesParams;
  result: IGetMatchMovesResult;
}

const getMatchMovesIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":54}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":83,"b":102}]}],"statement":"SELECT *\nFROM round_move\nWHERE \n  lobby_id = :lobby_id! AND\n  match_within_lobby = :match_within_lobby!\nORDER BY\n  round_move.round_within_match,\n  round_move.move_within_round"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM round_move
 * WHERE 
 *   lobby_id = :lobby_id! AND
 *   match_within_lobby = :match_within_lobby!
 * ORDER BY
 *   round_move.round_within_match,
 *   round_move.move_within_round
 * ```
 */
export const getMatchMoves = new PreparedQuery<IGetMatchMovesParams,IGetMatchMovesResult>(getMatchMovesIR);


/** 'GetNewLobbiesByUserAndBlockHeight' parameters type */
export interface IGetNewLobbiesByUserAndBlockHeightParams {
  block_height?: number | null | void;
  nft_id?: number | null | void;
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

const getNewLobbiesByUserAndBlockHeightIR: any = {"usedParamSet":{"nft_id":true,"block_height":true},"params":[{"name":"nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":51,"b":57}]},{"name":"block_height","required":false,"transform":{"type":"scalar"},"locs":[{"a":87,"b":99}]}],"statement":"SELECT lobby_id FROM lobbies\nWHERE lobby_creator = :nft_id\nAND creation_block_height = :block_height"};

/**
 * Query generated from SQL:
 * ```
 * SELECT lobby_id FROM lobbies
 * WHERE lobby_creator = :nft_id
 * AND creation_block_height = :block_height
 * ```
 */
export const getNewLobbiesByUserAndBlockHeight = new PreparedQuery<IGetNewLobbiesByUserAndBlockHeightParams,IGetNewLobbiesByUserAndBlockHeightResult>(getNewLobbiesByUserAndBlockHeightIR);


/** 'GetRound' parameters type */
export interface IGetRoundParams {
  lobby_id: string;
  match_within_lobby: number;
  round_within_match: number;
}

/** 'GetRound' return type */
export interface IGetRoundResult {
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  match_within_lobby: number;
  round_within_match: number;
  starting_block_height: number;
}

/** 'GetRound' query type */
export interface IGetRoundQuery {
  params: IGetRoundParams;
  result: IGetRoundResult;
}

const getRoundIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true,"round_within_match":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":55}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":103}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":132,"b":151}]}],"statement":"SELECT *\nFROM match_round\nWHERE \n  lobby_id = :lobby_id! AND\n  match_within_lobby = :match_within_lobby! AND\n  round_within_match = :round_within_match!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM match_round
 * WHERE 
 *   lobby_id = :lobby_id! AND
 *   match_within_lobby = :match_within_lobby! AND
 *   round_within_match = :round_within_match!
 * ```
 */
export const getRound = new PreparedQuery<IGetRoundParams,IGetRoundResult>(getRoundIR);


/** 'GetMatchSeeds' parameters type */
export interface IGetMatchSeedsParams {
  lobby_id: string;
  match_within_lobby: number;
}

/** 'GetMatchSeeds' return type */
export interface IGetMatchSeedsResult {
  block_height: number;
  done: boolean;
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  match_within_lobby: number;
  round_within_match: number;
  seed: string;
  starting_block_height: number;
}

/** 'GetMatchSeeds' query type */
export interface IGetMatchSeedsQuery {
  params: IGetMatchSeedsParams;
  result: IGetMatchSeedsResult;
}

const getMatchSeedsIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":133,"b":142}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":171,"b":190}]}],"statement":"SELECT *\nFROM match_round JOIN block_heights\n  ON block_heights.block_height = match_round.execution_block_height\nWHERE\n  lobby_id = :lobby_id! AND\n  match_within_lobby = :match_within_lobby!\nORDER BY match_round.round_within_match ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM match_round JOIN block_heights
 *   ON block_heights.block_height = match_round.execution_block_height
 * WHERE
 *   lobby_id = :lobby_id! AND
 *   match_within_lobby = :match_within_lobby!
 * ORDER BY match_round.round_within_match ASC
 * ```
 */
export const getMatchSeeds = new PreparedQuery<IGetMatchSeedsParams,IGetMatchSeedsResult>(getMatchSeedsIR);



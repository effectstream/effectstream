/** Types generated for queries found in "src/sql/update.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import { LobbyStatus } from '../common.ts';

/** 'UpdateLobbyState' parameters type */
export interface IUpdateLobbyStateParams {
  lobby_state: LobbyStatus;
  lobby_id: string;
}

/** 'UpdateLobbyState' return type */
export type IUpdateLobbyStateResult = void;

/** 'UpdateLobbyState' query type */
export interface IUpdateLobbyStateQuery {
  params: IUpdateLobbyStateParams;
  result: IUpdateLobbyStateResult;
}

const updateLobbyStateIR: any = {"usedParamSet":{"lobby_state":true,"lobby_id":true},"params":[{"name":"lobby_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":35,"b":47}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":73}]}],"statement":"UPDATE lobbies\nSET lobby_state = :lobby_state!\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET lobby_state = :lobby_state!
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateLobbyState = new PreparedQuery<IUpdateLobbyStateParams,IUpdateLobbyStateResult>(updateLobbyStateIR);


/** 'UpdateLobbyPlayerTwo' parameters type */
export interface IUpdateLobbyPlayerTwoParams {
  player_two: string;
  lobby_id: string;
}

/** 'UpdateLobbyPlayerTwo' return type */
export type IUpdateLobbyPlayerTwoResult = void;

/** 'UpdateLobbyPlayerTwo' query type */
export interface IUpdateLobbyPlayerTwoQuery {
  params: IUpdateLobbyPlayerTwoParams;
  result: IUpdateLobbyPlayerTwoResult;
}

const updateLobbyPlayerTwoIR: any = {"usedParamSet":{"player_two":true,"lobby_id":true},"params":[{"name":"player_two","required":true,"transform":{"type":"scalar"},"locs":[{"a":32,"b":43}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":79,"b":88}]}],"statement":"UPDATE lobbies\nSET player_two = :player_two!, lobby_state = 'active'\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET player_two = :player_two!, lobby_state = 'active'
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateLobbyPlayerTwo = new PreparedQuery<IUpdateLobbyPlayerTwoParams,IUpdateLobbyPlayerTwoResult>(updateLobbyPlayerTwoIR);


/** 'UpdateMatchState' parameters type */
export interface IUpdateMatchStateParams {
  latest_match_state: string;
  round_winner: string;
  lobby_id: string;
}

/** 'UpdateMatchState' return type */
export type IUpdateMatchStateResult = void;

/** 'UpdateMatchState' query type */
export interface IUpdateMatchStateQuery {
  params: IUpdateMatchStateParams;
  result: IUpdateMatchStateResult;
}

const updateMatchStateIR: any = {"usedParamSet":{"latest_match_state":true,"round_winner":true,"lobby_id":true},"params":[{"name":"latest_match_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":44,"b":63}]},{"name":"round_winner","required":true,"transform":{"type":"scalar"},"locs":[{"a":83,"b":96}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":113,"b":122}]}],"statement":"UPDATE lobbies\nSET\n  latest_match_state = :latest_match_state!,\n  round_winner = :round_winner!\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET
 *   latest_match_state = :latest_match_state!,
 *   round_winner = :round_winner!
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateMatchState = new PreparedQuery<IUpdateMatchStateParams,IUpdateMatchStateResult>(updateMatchStateIR);


/** 'UpdateRoundExecution' parameters type */
export interface IUpdateRoundExecutionParams {
  execution_block_height: number;
  lobby_id: string;
  round_within_match: number;
}

/** 'UpdateRoundExecution' return type */
export type IUpdateRoundExecutionResult = void;

/** 'UpdateRoundExecution' query type */
export interface IUpdateRoundExecutionQuery {
  params: IUpdateRoundExecutionParams;
  result: IUpdateRoundExecutionResult;
}

const updateRoundExecutionIR: any = {"usedParamSet":{"execution_block_height":true,"lobby_id":true,"round_within_match":true},"params":[{"name":"execution_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":52,"b":75}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":92,"b":101}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":128,"b":147}]}],"statement":"UPDATE rounds\nSET execution_block_height = :execution_block_height!\nWHERE lobby_id = :lobby_id! AND round_within_match = :round_within_match!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE rounds
 * SET execution_block_height = :execution_block_height!
 * WHERE lobby_id = :lobby_id! AND round_within_match = :round_within_match!
 * ```
 */
export const updateRoundExecution = new PreparedQuery<IUpdateRoundExecutionParams,IUpdateRoundExecutionResult>(updateRoundExecutionIR);


/** 'UpdateUserStats' parameters type */
export interface IUpdateUserStatsParams {
  wins: number;
  losses: number;
  ties: number;
  wallet: string;
}

/** 'UpdateUserStats' return type */
export type IUpdateUserStatsResult = void;

/** 'UpdateUserStats' query type */
export interface IUpdateUserStatsQuery {
  params: IUpdateUserStatsParams;
  result: IUpdateUserStatsResult;
}

const updateUserStatsIR: any = {"usedParamSet":{"wins":true,"losses":true,"ties":true,"wallet":true},"params":[{"name":"wins","required":true,"transform":{"type":"scalar"},"locs":[{"a":52,"b":57}]},{"name":"losses","required":true,"transform":{"type":"scalar"},"locs":[{"a":79,"b":86}]},{"name":"ties","required":true,"transform":{"type":"scalar"},"locs":[{"a":103,"b":108}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":132}]}],"statement":"UPDATE global_user_state\nSET\n  wins = wins + :wins!,\n  losses = losses + :losses!,\n  ties = ties + :ties!\nWHERE wallet = :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET
 *   wins = wins + :wins!,
 *   losses = losses + :losses!,
 *   ties = ties + :ties!
 * WHERE wallet = :wallet!
 * ```
 */
export const updateUserStats = new PreparedQuery<IUpdateUserStatsParams,IUpdateUserStatsResult>(updateUserStatsIR);


/** 'CloseLobby' parameters type */
export interface ICloseLobbyParams {
  lobby_id: string;
}

/** 'CloseLobby' return type */
export type ICloseLobbyResult = void;

/** 'CloseLobby' query type */
export interface ICloseLobbyQuery {
  params: ICloseLobbyParams;
  result: ICloseLobbyResult;
}

const closeLobbyIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":69}]}],"statement":"UPDATE lobbies\nSET lobby_state = 'closed'\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET lobby_state = 'closed'
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const closeLobby = new PreparedQuery<ICloseLobbyParams,ICloseLobbyResult>(closeLobbyIR);


/** 'FinishLobby' parameters type */
export interface IFinishLobbyParams {
  lobby_id: string;
}

/** 'FinishLobby' return type */
export type IFinishLobbyResult = void;

/** 'FinishLobby' query type */
export interface IFinishLobbyQuery {
  params: IFinishLobbyParams;
  result: IFinishLobbyResult;
}

const finishLobbyIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":62,"b":71}]}],"statement":"UPDATE lobbies\nSET lobby_state = 'finished'\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET lobby_state = 'finished'
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const finishLobby = new PreparedQuery<IFinishLobbyParams,IFinishLobbyResult>(finishLobbyIR);

/** Types generated for queries found in "src/queries/insert.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { LobbyStatus, RockPaperScissors, MatchResult } from '@src/common.js';

export type DateOrString = Date | string;

/** 'CreateLobby' parameters type */
export interface ICreateLobbyParams {
  created_at: DateOrString;
  creation_block_height: number;
  current_round?: number | null | void;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: LobbyStatus;
  num_of_rounds?: number | null | void;
  player_two?: string | null | void;
  practice: boolean;
  round_length?: number | null | void;
  round_winner: string;
}

/** 'CreateLobby' return type */
export type ICreateLobbyResult = void;

/** 'CreateLobby' query type */
export interface ICreateLobbyQuery {
  params: ICreateLobbyParams;
  result: ICreateLobbyResult;
}

const createLobbyIR: any = {"usedParamSet":{"lobby_id":true,"num_of_rounds":true,"round_length":true,"current_round":true,"creation_block_height":true,"created_at":true,"hidden":true,"practice":true,"lobby_creator":true,"lobby_state":true,"player_two":true,"latest_match_state":true,"round_winner":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":253,"b":262}]},{"name":"num_of_rounds","required":false,"transform":{"type":"scalar"},"locs":[{"a":266,"b":279}]},{"name":"round_length","required":false,"transform":{"type":"scalar"},"locs":[{"a":283,"b":295}]},{"name":"current_round","required":false,"transform":{"type":"scalar"},"locs":[{"a":299,"b":312}]},{"name":"creation_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":316,"b":338}]},{"name":"created_at","required":true,"transform":{"type":"scalar"},"locs":[{"a":342,"b":353}]},{"name":"hidden","required":true,"transform":{"type":"scalar"},"locs":[{"a":357,"b":364}]},{"name":"practice","required":true,"transform":{"type":"scalar"},"locs":[{"a":368,"b":377}]},{"name":"lobby_creator","required":true,"transform":{"type":"scalar"},"locs":[{"a":381,"b":395}]},{"name":"lobby_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":399,"b":411}]},{"name":"player_two","required":false,"transform":{"type":"scalar"},"locs":[{"a":415,"b":425}]},{"name":"latest_match_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":429,"b":448}]},{"name":"round_winner","required":true,"transform":{"type":"scalar"},"locs":[{"a":452,"b":465}]}],"statement":"INSERT INTO lobbies (\n   lobby_id,\n   num_of_rounds,\n   round_length,\n   current_round,\n   creation_block_height,\n   created_at,\n   hidden,\n   practice,\n   lobby_creator,\n   lobby_state,\n   player_two,\n   latest_match_state,\n   round_winner\n)\nVALUES (\n :lobby_id!,\n :num_of_rounds,\n :round_length,\n :current_round,\n :creation_block_height!,\n :created_at!,\n :hidden!,\n :practice!,\n :lobby_creator!,\n :lobby_state!,\n :player_two,\n :latest_match_state!,\n :round_winner!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO lobbies (
 *    lobby_id,
 *    num_of_rounds,
 *    round_length,
 *    current_round,
 *    creation_block_height,
 *    created_at,
 *    hidden,
 *    practice,
 *    lobby_creator,
 *    lobby_state,
 *    player_two,
 *    latest_match_state,
 *    round_winner
 * )
 * VALUES (
 *  :lobby_id!,
 *  :num_of_rounds,
 *  :round_length,
 *  :current_round,
 *  :creation_block_height!,
 *  :created_at!,
 *  :hidden!,
 *  :practice!,
 *  :lobby_creator!,
 *  :lobby_state!,
 *  :player_two,
 *  :latest_match_state!,
 *  :round_winner!
 * )
 * ```
 */
export const createLobby = new PreparedQuery<ICreateLobbyParams,ICreateLobbyResult>(createLobbyIR);


/** 'NewRound' parameters type */
export interface INewRoundParams {
  execution_block_height?: number | null | void;
  lobby_id: string;
  round_within_match: number;
  starting_block_height: number;
}

/** 'NewRound' return type */
export interface INewRoundResult {
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  round_within_match: number;
  starting_block_height: number;
}

/** 'NewRound' query type */
export interface INewRoundQuery {
  params: INewRoundParams;
  result: INewRoundResult;
}

const newRoundIR: any = {"usedParamSet":{"lobby_id":true,"round_within_match":true,"starting_block_height":true,"execution_block_height":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":113}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":116,"b":135}]},{"name":"starting_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":138,"b":160}]},{"name":"execution_block_height","required":false,"transform":{"type":"scalar"},"locs":[{"a":163,"b":185}]}],"statement":"INSERT INTO rounds(lobby_id, round_within_match, starting_block_height, execution_block_height)\nVALUES (:lobby_id!, :round_within_match!, :starting_block_height!, :execution_block_height)\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO rounds(lobby_id, round_within_match, starting_block_height, execution_block_height)
 * VALUES (:lobby_id!, :round_within_match!, :starting_block_height!, :execution_block_height)
 * RETURNING *
 * ```
 */
export const newRound = new PreparedQuery<INewRoundParams,INewRoundResult>(newRoundIR);


/** 'NewMatchMove' parameters type */
export interface INewMatchMoveParams {
  lobby_id: string;
  move_rps: RockPaperScissors;
  round: number;
  wallet: string;
}

/** 'NewMatchMove' return type */
export type INewMatchMoveResult = void;

/** 'NewMatchMove' query type */
export interface INewMatchMoveQuery {
  params: INewMatchMoveParams;
  result: INewMatchMoveResult;
}

const newMatchMoveIR: any = {"usedParamSet":{"lobby_id":true,"wallet":true,"round":true,"move_rps":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":76}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":79,"b":86}]},{"name":"round","required":true,"transform":{"type":"scalar"},"locs":[{"a":89,"b":95}]},{"name":"move_rps","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":107}]}],"statement":"INSERT INTO match_moves(lobby_id, wallet, round, move_rps)\nVALUES (:lobby_id!, :wallet!, :round!, :move_rps!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO match_moves(lobby_id, wallet, round, move_rps)
 * VALUES (:lobby_id!, :wallet!, :round!, :move_rps!)
 * ```
 */
export const newMatchMove = new PreparedQuery<INewMatchMoveParams,INewMatchMoveResult>(newMatchMoveIR);


/** 'NewFinalState' parameters type */
export interface INewFinalStateParams {
  game_moves: string;
  lobby_id: string;
  player_one_result: MatchResult;
  player_one_wallet: string;
  player_two_result: MatchResult;
  player_two_wallet: string;
  total_time: number;
}

/** 'NewFinalState' return type */
export type INewFinalStateResult = void;

/** 'NewFinalState' query type */
export interface INewFinalStateQuery {
  params: INewFinalStateParams;
  result: INewFinalStateResult;
}

const newFinalStateIR: any = {"usedParamSet":{"lobby_id":true,"player_one_wallet":true,"player_one_result":true,"player_two_wallet":true,"player_two_result":true,"total_time":true,"game_moves":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":174,"b":183}]},{"name":"player_one_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":188,"b":206}]},{"name":"player_one_result","required":true,"transform":{"type":"scalar"},"locs":[{"a":211,"b":229}]},{"name":"player_two_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":234,"b":252}]},{"name":"player_two_result","required":true,"transform":{"type":"scalar"},"locs":[{"a":257,"b":275}]},{"name":"total_time","required":true,"transform":{"type":"scalar"},"locs":[{"a":280,"b":291}]},{"name":"game_moves","required":true,"transform":{"type":"scalar"},"locs":[{"a":296,"b":307}]}],"statement":"INSERT INTO final_match_state (\n  lobby_id, \n  player_one_wallet, \n  player_one_result, \n  player_two_wallet, \n  player_two_result, \n  total_time, \n  game_moves\n)\nVALUES (\n  :lobby_id!,\n  :player_one_wallet!,\n  :player_one_result!,\n  :player_two_wallet!,\n  :player_two_result!,\n  :total_time!,\n  :game_moves!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO final_match_state (
 *   lobby_id, 
 *   player_one_wallet, 
 *   player_one_result, 
 *   player_two_wallet, 
 *   player_two_result, 
 *   total_time, 
 *   game_moves
 * )
 * VALUES (
 *   :lobby_id!,
 *   :player_one_wallet!,
 *   :player_one_result!,
 *   :player_two_wallet!,
 *   :player_two_result!,
 *   :total_time!,
 *   :game_moves!
 * )
 * ```
 */
export const newFinalState = new PreparedQuery<INewFinalStateParams,INewFinalStateResult>(newFinalStateIR);


/** 'NewStats' parameters type */
export interface INewStatsParams {
  losses: number;
  ties: number;
  wallet: string;
  wins: number;
}

/** 'NewStats' return type */
export type INewStatsResult = void;

/** 'NewStats' query type */
export interface INewStatsQuery {
  params: INewStatsParams;
  result: INewStatsResult;
}

const newStatsIR: any = {"usedParamSet":{"wallet":true,"wins":true,"losses":true,"ties":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":38,"b":45}]},{"name":"wins","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":53}]},{"name":"losses","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":63}]},{"name":"ties","required":true,"transform":{"type":"scalar"},"locs":[{"a":66,"b":71}]}],"statement":"INSERT INTO global_user_state\nVALUES (:wallet!, :wins!, :losses!, :ties!)\nON CONFLICT (wallet)\nDO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_user_state
 * VALUES (:wallet!, :wins!, :losses!, :ties!)
 * ON CONFLICT (wallet)
 * DO NOTHING
 * ```
 */
export const newStats = new PreparedQuery<INewStatsParams,INewStatsResult>(newStatsIR);


/** 'UpdateStats' parameters type */
export interface IUpdateStatsParams {
  losses: number;
  ties: number;
  wallet: string;
  wins: number;
}

/** 'UpdateStats' return type */
export type IUpdateStatsResult = void;

/** 'UpdateStats' query type */
export interface IUpdateStatsQuery {
  params: IUpdateStatsParams;
  result: IUpdateStatsResult;
}

const updateStatsIR: any = {"usedParamSet":{"wallet":true,"wins":true,"losses":true,"ties":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":38,"b":45}]},{"name":"wins","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":53}]},{"name":"losses","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":63}]},{"name":"ties","required":true,"transform":{"type":"scalar"},"locs":[{"a":66,"b":71}]}],"statement":"INSERT INTO global_user_state\nVALUES (:wallet!, :wins!, :losses!, :ties!)\nON CONFLICT (wallet)\nDO UPDATE SET\nwins = EXCLUDED.wins,\nlosses = EXCLUDED.losses,\nties = EXCLUDED.ties"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_user_state
 * VALUES (:wallet!, :wins!, :losses!, :ties!)
 * ON CONFLICT (wallet)
 * DO UPDATE SET
 * wins = EXCLUDED.wins,
 * losses = EXCLUDED.losses,
 * ties = EXCLUDED.ties
 * ```
 */
export const updateStats = new PreparedQuery<IUpdateStatsParams,IUpdateStatsResult>(updateStatsIR);



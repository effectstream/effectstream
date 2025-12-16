/** Types generated for queries found in "src/sql/insert.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import { LobbyStatus, MatchResult, RockPaperScissors } from '../common.ts';

/** 'CreateLobby' parameters type */
export interface ICreateLobbyParams {
  lobby_id: string;
  num_of_rounds: number;
  round_length: number;
  round_winner: string;
  created_at: Date;
  creation_block_height: number;
  hidden: boolean;
  practice: boolean;
  lobby_creator: string;
  lobby_state: LobbyStatus;
  latest_match_state: string;
}

/** 'CreateLobby' return type */
export type ICreateLobbyResult = void;

/** 'CreateLobby' query type */
export interface ICreateLobbyQuery {
  params: ICreateLobbyParams;
  result: ICreateLobbyResult;
}

const createLobbyIR: any = {"usedParamSet":{"lobby_id":true,"num_of_rounds":true,"round_length":true,"round_winner":true,"created_at":true,"creation_block_height":true,"hidden":true,"practice":true,"lobby_creator":true,"lobby_state":true,"latest_match_state":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":181,"b":190}]},{"name":"num_of_rounds","required":true,"transform":{"type":"scalar"},"locs":[{"a":195,"b":209}]},{"name":"round_length","required":true,"transform":{"type":"scalar"},"locs":[{"a":214,"b":227}]},{"name":"round_winner","required":true,"transform":{"type":"scalar"},"locs":[{"a":232,"b":245}]},{"name":"created_at","required":true,"transform":{"type":"scalar"},"locs":[{"a":250,"b":261}]},{"name":"creation_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":266,"b":288}]},{"name":"hidden","required":true,"transform":{"type":"scalar"},"locs":[{"a":293,"b":300}]},{"name":"practice","required":true,"transform":{"type":"scalar"},"locs":[{"a":305,"b":314}]},{"name":"lobby_creator","required":true,"transform":{"type":"scalar"},"locs":[{"a":319,"b":333}]},{"name":"lobby_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":338,"b":350}]},{"name":"latest_match_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":355,"b":374}]}],"statement":"INSERT INTO lobbies (\n  lobby_id,\n  num_of_rounds,\n  round_length,\n  round_winner,\n  created_at,\n  creation_block_height,\n  hidden,\n  practice,\n  lobby_creator,\n  lobby_state,\n  latest_match_state\n) VALUES (\n  :lobby_id!,\n  :num_of_rounds!,\n  :round_length!,\n  :round_winner!,\n  :created_at!,\n  :creation_block_height!,\n  :hidden!,\n  :practice!,\n  :lobby_creator!,\n  :lobby_state!,\n  :latest_match_state!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO lobbies (
 *   lobby_id,
 *   num_of_rounds,
 *   round_length,
 *   round_winner,
 *   created_at,
 *   creation_block_height,
 *   hidden,
 *   practice,
 *   lobby_creator,
 *   lobby_state,
 *   latest_match_state
 * ) VALUES (
 *   :lobby_id!,
 *   :num_of_rounds!,
 *   :round_length!,
 *   :round_winner!,
 *   :created_at!,
 *   :creation_block_height!,
 *   :hidden!,
 *   :practice!,
 *   :lobby_creator!,
 *   :lobby_state!,
 *   :latest_match_state!
 * )
 * ```
 */
export const createLobby = new PreparedQuery<ICreateLobbyParams,ICreateLobbyResult>(createLobbyIR);


/** 'CreateRound' parameters type */
export interface ICreateRoundParams {
  lobby_id: string;
  round_within_match: number;
  starting_block_height: number;
}

/** 'CreateRound' return type */
export type ICreateRoundResult = void;

/** 'CreateRound' query type */
export interface ICreateRoundQuery {
  params: ICreateRoundParams;
  result: ICreateRoundResult;
}

const createRoundIR: any = {"usedParamSet":{"lobby_id":true,"round_within_match":true,"starting_block_height":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":89,"b":98}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":103,"b":122}]},{"name":"starting_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":127,"b":149}]}],"statement":"INSERT INTO rounds (\n  lobby_id,\n  round_within_match,\n  starting_block_height\n) VALUES (\n  :lobby_id!,\n  :round_within_match!,\n  :starting_block_height!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO rounds (
 *   lobby_id,
 *   round_within_match,
 *   starting_block_height
 * ) VALUES (
 *   :lobby_id!,
 *   :round_within_match!,
 *   :starting_block_height!
 * )
 * ```
 */
export const createRound = new PreparedQuery<ICreateRoundParams,ICreateRoundResult>(createRoundIR);


/** 'CreateMove' parameters type */
export interface ICreateMoveParams {
  lobby_id: string;
  wallet: string;
  round: number;
  move_rps: RockPaperScissors;
}

/** 'CreateMove' return type */
export type ICreateMoveResult = void;

/** 'CreateMove' query type */
export interface ICreateMoveQuery {
  params: ICreateMoveParams;
  result: ICreateMoveResult;
}

const createMoveIR: any = {"usedParamSet":{"lobby_id":true,"wallet":true,"round":true,"move_rps":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":77,"b":86}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":91,"b":98}]},{"name":"round","required":true,"transform":{"type":"scalar"},"locs":[{"a":103,"b":109}]},{"name":"move_rps","required":true,"transform":{"type":"scalar"},"locs":[{"a":114,"b":123}]}],"statement":"INSERT INTO match_moves (\n  lobby_id,\n  wallet,\n  round,\n  move_rps\n) VALUES (\n  :lobby_id!,\n  :wallet!,\n  :round!,\n  :move_rps!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO match_moves (
 *   lobby_id,
 *   wallet,
 *   round,
 *   move_rps
 * ) VALUES (
 *   :lobby_id!,
 *   :wallet!,
 *   :round!,
 *   :move_rps!
 * )
 * ```
 */
export const createMove = new PreparedQuery<ICreateMoveParams,ICreateMoveResult>(createMoveIR);


/** 'CreateUserStats' parameters type */
export interface ICreateUserStatsParams {
  wallet: string;
}

/** 'CreateUserStats' return type */
export type ICreateUserStatsResult = void;

/** 'CreateUserStats' query type */
export interface ICreateUserStatsQuery {
  params: ICreateUserStatsParams;
  result: ICreateUserStatsResult;
}

const createUserStatsIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":54,"b":61}]}],"statement":"INSERT INTO global_user_state (wallet)\nVALUES (:wallet!)\nON CONFLICT (wallet) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_user_state (wallet)
 * VALUES (:wallet!)
 * ON CONFLICT (wallet) DO NOTHING
 * ```
 */
export const createUserStats = new PreparedQuery<ICreateUserStatsParams,ICreateUserStatsResult>(createUserStatsIR);


/** 'CreateFinalMatchState' parameters type */
export interface ICreateFinalMatchStateParams {
  lobby_id: string;
  player_one_wallet: string;
  player_one_result: MatchResult;
  player_two_wallet: string;
  player_two_result: MatchResult;
  total_time: number;
  game_moves: string;
}

/** 'CreateFinalMatchState' return type */
export type ICreateFinalMatchStateResult = void;

/** 'CreateFinalMatchState' query type */
export interface ICreateFinalMatchStateQuery {
  params: ICreateFinalMatchStateParams;
  result: ICreateFinalMatchStateResult;
}

const createFinalMatchStateIR: any = {"usedParamSet":{"lobby_id":true,"player_one_wallet":true,"player_one_result":true,"player_two_wallet":true,"player_two_result":true,"total_time":true,"game_moves":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":132,"b":141}]},{"name":"player_one_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":146,"b":164}]},{"name":"player_one_result","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":187}]},{"name":"player_two_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":192,"b":210}]},{"name":"player_two_result","required":true,"transform":{"type":"scalar"},"locs":[{"a":215,"b":233}]},{"name":"total_time","required":true,"transform":{"type":"scalar"},"locs":[{"a":238,"b":249}]},{"name":"game_moves","required":true,"transform":{"type":"scalar"},"locs":[{"a":254,"b":265}]}],"statement":"INSERT INTO final_match_state (\n  lobby_id,\n  player_one_wallet,\n  player_one_result,\n  player_two_wallet,\n  player_two_result,\n  total_time,\n  game_moves\n) VALUES (\n  :lobby_id!,\n  :player_one_wallet!,\n  :player_one_result!,\n  :player_two_wallet!,\n  :player_two_result!,\n  :total_time!,\n  :game_moves!\n)"};

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
 * ) VALUES (
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
export const createFinalMatchState = new PreparedQuery<ICreateFinalMatchStateParams,ICreateFinalMatchStateResult>(createFinalMatchStateIR);

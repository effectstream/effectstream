/** Types generated for queries found in "src/sql/insert.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type lobby_status_1 = 'active' | 'closed' | 'finished' | 'open';

export type match_result_1 = 'loss' | 'tie' | 'win';

export type rock_paper_scissors_1 = 'P' | 'R' | 'S';

export type DateOrString = Date | string;

/** 'CreateLobby' parameters type */
export interface ICreateLobbyParams {
  created_at: DateOrString;
  creation_block_height: number;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status_1;
  num_of_rounds: number;
  practice: boolean;
  round_length: number;
  round_winner: string;
}

/** 'CreateLobby' return type */
export type ICreateLobbyResult = void;

/** 'CreateLobby' query type */
export interface ICreateLobbyQuery {
  params: ICreateLobbyParams;
  result: ICreateLobbyResult;
}

const createLobbyIR: any = {"usedParamSet":{"lobby_id":true,"num_of_rounds":true,"round_length":true,"round_winner":true,"created_at":true,"creation_block_height":true,"hidden":true,"practice":true,"lobby_creator":true,"lobby_state":true,"latest_match_state":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":210,"b":219}]},{"name":"num_of_rounds","required":true,"transform":{"type":"scalar"},"locs":[{"a":224,"b":238}]},{"name":"round_length","required":true,"transform":{"type":"scalar"},"locs":[{"a":243,"b":256}]},{"name":"round_winner","required":true,"transform":{"type":"scalar"},"locs":[{"a":261,"b":274}]},{"name":"created_at","required":true,"transform":{"type":"scalar"},"locs":[{"a":279,"b":290}]},{"name":"creation_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":295,"b":317}]},{"name":"hidden","required":true,"transform":{"type":"scalar"},"locs":[{"a":322,"b":329}]},{"name":"practice","required":true,"transform":{"type":"scalar"},"locs":[{"a":334,"b":343}]},{"name":"lobby_creator","required":true,"transform":{"type":"scalar"},"locs":[{"a":348,"b":362}]},{"name":"lobby_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":367,"b":379}]},{"name":"latest_match_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":384,"b":403}]}],"statement":"INSERT INTO lobbies (\n  lobby_id,\n  num_of_rounds,\n  round_length,\n  round_winner,\n  created_at,\n  creation_block_height,\n  hidden,\n  practice,\n  lobby_creator,\n  lobby_state,\n  latest_match_state\n) VALUES (\n  :lobby_id!,\n  :num_of_rounds!,\n  :round_length!,\n  :round_winner!,\n  :created_at!,\n  :creation_block_height!,\n  :hidden!,\n  :practice!,\n  :lobby_creator!,\n  :lobby_state!,\n  :latest_match_state!\n)"};

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

const createRoundIR: any = {"usedParamSet":{"lobby_id":true,"round_within_match":true,"starting_block_height":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":92,"b":101}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":106,"b":125}]},{"name":"starting_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":130,"b":152}]}],"statement":"INSERT INTO rounds (\n  lobby_id,\n  round_within_match,\n  starting_block_height\n) VALUES (\n  :lobby_id!,\n  :round_within_match!,\n  :starting_block_height!\n)"};

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
  move_rps: rock_paper_scissors_1;
  round: number;
  wallet: string;
}

/** 'CreateMove' return type */
export type ICreateMoveResult = void;

/** 'CreateMove' query type */
export interface ICreateMoveQuery {
  params: ICreateMoveParams;
  result: ICreateMoveResult;
}

const createMoveIR: any = {"usedParamSet":{"lobby_id":true,"wallet":true,"round":true,"move_rps":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":81,"b":90}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":95,"b":102}]},{"name":"round","required":true,"transform":{"type":"scalar"},"locs":[{"a":107,"b":113}]},{"name":"move_rps","required":true,"transform":{"type":"scalar"},"locs":[{"a":118,"b":127}]}],"statement":"INSERT INTO match_moves (\n  lobby_id,\n  wallet,\n  round,\n  move_rps\n) VALUES (\n  :lobby_id!,\n  :wallet!,\n  :round!,\n  :move_rps!\n)"};

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

const createUserStatsIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":47,"b":54}]}],"statement":"INSERT INTO global_user_state (wallet)\nVALUES (:wallet!)\nON CONFLICT (wallet) DO NOTHING"};

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
  game_moves: string;
  lobby_id: string;
  player_one_result: match_result_1;
  player_one_wallet: string;
  player_two_result: match_result_1;
  player_two_wallet: string;
  total_time: number;
}

/** 'CreateFinalMatchState' return type */
export type ICreateFinalMatchStateResult = void;

/** 'CreateFinalMatchState' query type */
export interface ICreateFinalMatchStateQuery {
  params: ICreateFinalMatchStateParams;
  result: ICreateFinalMatchStateResult;
}

const createFinalMatchStateIR: any = {"usedParamSet":{"lobby_id":true,"player_one_wallet":true,"player_one_result":true,"player_two_wallet":true,"player_two_result":true,"total_time":true,"game_moves":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":168,"b":177}]},{"name":"player_one_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":182,"b":200}]},{"name":"player_one_result","required":true,"transform":{"type":"scalar"},"locs":[{"a":205,"b":223}]},{"name":"player_two_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":228,"b":246}]},{"name":"player_two_result","required":true,"transform":{"type":"scalar"},"locs":[{"a":251,"b":269}]},{"name":"total_time","required":true,"transform":{"type":"scalar"},"locs":[{"a":274,"b":285}]},{"name":"game_moves","required":true,"transform":{"type":"scalar"},"locs":[{"a":290,"b":301}]}],"statement":"INSERT INTO final_match_state (\n  lobby_id,\n  player_one_wallet,\n  player_one_result,\n  player_two_wallet,\n  player_two_result,\n  total_time,\n  game_moves\n) VALUES (\n  :lobby_id!,\n  :player_one_wallet!,\n  :player_one_result!,\n  :player_two_wallet!,\n  :player_two_result!,\n  :total_time!,\n  :game_moves!\n)"};

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



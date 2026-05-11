/** Types generated for queries found in "sql/update.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type lobby_status = 'active' | 'closed' | 'finished' | 'open';

/** 'StartMatch' parameters type */
export interface IStartMatchParams {
  lobby_id: string;
  player_two: string;
}

/** 'StartMatch' return type */
export interface IStartMatchResult {
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

/** 'StartMatch' query type */
export interface IStartMatchQuery {
  params: IStartMatchParams;
  result: IStartMatchResult;
}

const startMatchIR: any = {"usedParamSet":{"player_two":true,"lobby_id":true},"params":[{"name":"player_two","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":67}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":86,"b":95}]}],"statement":"UPDATE lobbies\nSET\nlobby_state = 'active',\nplayer_two = :player_two!\nWHERE lobby_id = :lobby_id!\nAND player_two IS NULL\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET
 * lobby_state = 'active',
 * player_two = :player_two!
 * WHERE lobby_id = :lobby_id!
 * AND player_two IS NULL
 * RETURNING *
 * ```
 */
export const startMatch = new PreparedQuery<IStartMatchParams,IStartMatchResult>(startMatchIR);


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

const closeLobbyIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":59,"b":68}]}],"statement":"UPDATE lobbies\nSET\nlobby_state = 'closed'\nWHERE lobby_id = :lobby_id!\nAND player_two IS NULL"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET
 * lobby_state = 'closed'
 * WHERE lobby_id = :lobby_id!
 * AND player_two IS NULL
 * ```
 */
export const closeLobby = new PreparedQuery<ICloseLobbyParams,ICloseLobbyResult>(closeLobbyIR);


/** 'UpdateLatestMatchState' parameters type */
export interface IUpdateLatestMatchStateParams {
  latest_match_state: string;
  lobby_id: string;
}

/** 'UpdateLatestMatchState' return type */
export type IUpdateLatestMatchStateResult = void;

/** 'UpdateLatestMatchState' query type */
export interface IUpdateLatestMatchStateQuery {
  params: IUpdateLatestMatchStateParams;
  result: IUpdateLatestMatchStateResult;
}

const updateLatestMatchStateIR: any = {"usedParamSet":{"latest_match_state":true,"lobby_id":true},"params":[{"name":"latest_match_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":59}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":87}]}],"statement":"UPDATE lobbies\nSET latest_match_state = :latest_match_state!\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET latest_match_state = :latest_match_state!
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateLatestMatchState = new PreparedQuery<IUpdateLatestMatchStateParams,IUpdateLatestMatchStateResult>(updateLatestMatchStateIR);


/** 'EndMatch' parameters type */
export interface IEndMatchParams {
  lobby_id: string;
}

/** 'EndMatch' return type */
export type IEndMatchResult = void;

/** 'EndMatch' query type */
export interface IEndMatchQuery {
  params: IEndMatchParams;
  result: IEndMatchResult;
}

const endMatchIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":62,"b":71}]}],"statement":"UPDATE lobbies\nSET  lobby_state = 'finished'\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET  lobby_state = 'finished'
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const endMatch = new PreparedQuery<IEndMatchParams,IEndMatchResult>(endMatchIR);


/** 'ExecutedRound' parameters type */
export interface IExecutedRoundParams {
  execution_block_height: number;
  lobby_id: string;
  round: number;
}

/** 'ExecutedRound' return type */
export type IExecutedRoundResult = void;

/** 'ExecutedRound' query type */
export interface IExecutedRoundQuery {
  params: IExecutedRoundParams;
  result: IExecutedRoundResult;
}

const executedRoundIR: any = {"usedParamSet":{"execution_block_height":true,"lobby_id":true,"round":true},"params":[{"name":"execution_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":43,"b":66}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":92,"b":101}]},{"name":"round","required":true,"transform":{"type":"scalar"},"locs":[{"a":135,"b":141}]}],"statement":"UPDATE rounds\nSET execution_block_height = :execution_block_height!\nWHERE rounds.lobby_id = :lobby_id!\nAND rounds.round_within_match = :round!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE rounds
 * SET execution_block_height = :execution_block_height!
 * WHERE rounds.lobby_id = :lobby_id!
 * AND rounds.round_within_match = :round!
 * ```
 */
export const executedRound = new PreparedQuery<IExecutedRoundParams,IExecutedRoundResult>(executedRoundIR);



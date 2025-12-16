/** Types generated for queries found in "src/queries/update.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { LobbyStatus } from '@src/common.js';

/** 'StartMatch' parameters type */
export interface IStartMatchParams {
  lobby_id: string;
  player_two: string;
}

/** 'StartMatch' return type */
export interface IStartMatchResult {
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

/** 'StartMatch' query type */
export interface IStartMatchQuery {
  params: IStartMatchParams;
  result: IStartMatchResult;
}

const startMatchIR: any = {"usedParamSet":{"player_two":true,"lobby_id":true},"params":[{"name":"player_two","required":true,"transform":{"type":"scalar"},"locs":[{"a":58,"b":69}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":88,"b":97}]}],"statement":"UPDATE lobbies\nSET  \nlobby_state = 'active',\nplayer_two = :player_two!\nWHERE lobby_id = :lobby_id!\nAND player_two IS NULL\nRETURNING *"};

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

const closeLobbyIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":70}]}],"statement":"UPDATE lobbies\nSET  \nlobby_state = 'closed'\nWHERE lobby_id = :lobby_id!\nAND player_two IS NULL"};

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


/** 'UpdateRound' parameters type */
export interface IUpdateRoundParams {
  lobby_id: string;
  round: number;
}

/** 'UpdateRound' return type */
export type IUpdateRoundResult = void;

/** 'UpdateRound' query type */
export interface IUpdateRoundQuery {
  params: IUpdateRoundParams;
  result: IUpdateRoundResult;
}

const updateRoundIR: any = {"usedParamSet":{"round":true,"lobby_id":true},"params":[{"name":"round","required":true,"transform":{"type":"scalar"},"locs":[{"a":35,"b":41}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":69}]}],"statement":"UPDATE lobbies\nSET current_round = :round!\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET current_round = :round!
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateRound = new PreparedQuery<IUpdateRoundParams,IUpdateRoundResult>(updateRoundIR);


/** 'UpdateLatestMatchState' parameters type */
export interface IUpdateLatestMatchStateParams {
  latest_match_state: string;
  lobby_id: string;
  round_winner: string;
}

/** 'UpdateLatestMatchState' return type */
export type IUpdateLatestMatchStateResult = void;

/** 'UpdateLatestMatchState' query type */
export interface IUpdateLatestMatchStateQuery {
  params: IUpdateLatestMatchStateParams;
  result: IUpdateLatestMatchStateResult;
}

const updateLatestMatchStateIR: any = {"usedParamSet":{"latest_match_state":true,"round_winner":true,"lobby_id":true},"params":[{"name":"latest_match_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":60}]},{"name":"round_winner","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":91}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":110,"b":119}]}],"statement":"UPDATE lobbies\nSET \nlatest_match_state = :latest_match_state!,\nround_winner = :round_winner!\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET 
 * latest_match_state = :latest_match_state!,
 * round_winner = :round_winner!
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


/** 'AddWin' parameters type */
export interface IAddWinParams {
  wallet?: string | null | void;
}

/** 'AddWin' return type */
export type IAddWinResult = void;

/** 'AddWin' query type */
export interface IAddWinQuery {
  params: IAddWinParams;
  result: IAddWinResult;
}

const addWinIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":60,"b":66}]}],"statement":"UPDATE global_user_state\nSET\nwins = wins + 1\nWHERE wallet = :wallet"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET
 * wins = wins + 1
 * WHERE wallet = :wallet
 * ```
 */
export const addWin = new PreparedQuery<IAddWinParams,IAddWinResult>(addWinIR);


/** 'AddLoss' parameters type */
export interface IAddLossParams {
  wallet?: string | null | void;
}

/** 'AddLoss' return type */
export type IAddLossResult = void;

/** 'AddLoss' query type */
export interface IAddLossQuery {
  params: IAddLossParams;
  result: IAddLossResult;
}

const addLossIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":64,"b":70}]}],"statement":"UPDATE global_user_state\nSET\nlosses = losses + 1\nWHERE wallet = :wallet"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET
 * losses = losses + 1
 * WHERE wallet = :wallet
 * ```
 */
export const addLoss = new PreparedQuery<IAddLossParams,IAddLossResult>(addLossIR);


/** 'AddTie' parameters type */
export interface IAddTieParams {
  wallet?: string | null | void;
}

/** 'AddTie' return type */
export type IAddTieResult = void;

/** 'AddTie' query type */
export interface IAddTieQuery {
  params: IAddTieParams;
  result: IAddTieResult;
}

const addTieIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":60,"b":66}]}],"statement":"UPDATE global_user_state\nSET\nties = ties + 1\nWHERE wallet = :wallet"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET
 * ties = ties + 1
 * WHERE wallet = :wallet
 * ```
 */
export const addTie = new PreparedQuery<IAddTieParams,IAddTieResult>(addTieIR);



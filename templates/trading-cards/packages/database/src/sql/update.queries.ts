/** Types generated for queries found in "src/sql/update.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { LobbyStatus, ConciseResult } from '../../../common.ts';

export type numberArray = (number)[];

/** 'UpdateLobbyState' parameters type */
export interface IUpdateLobbyStateParams {
  lobby_id: string;
  lobby_state: LobbyStatus;
}

/** 'UpdateLobbyState' return type */
export type IUpdateLobbyStateResult = void;

/** 'UpdateLobbyState' query type */
export interface IUpdateLobbyStateQuery {
  params: IUpdateLobbyStateParams;
  result: IUpdateLobbyStateResult;
}

const updateLobbyStateIR: any = {"usedParamSet":{"lobby_state":true,"lobby_id":true},"params":[{"name":"lobby_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":33,"b":45}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":73}]}],"statement":"UPDATE lobbies\nSET lobby_state = :lobby_state!\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET lobby_state = :lobby_state!
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateLobbyState = new PreparedQuery<IUpdateLobbyStateParams,IUpdateLobbyStateResult>(updateLobbyStateIR);


/** 'UpdateLobbyCurrentMatch' parameters type */
export interface IUpdateLobbyCurrentMatchParams {
  current_match?: number | null | void;
  lobby_id: string;
}

/** 'UpdateLobbyCurrentMatch' return type */
export type IUpdateLobbyCurrentMatchResult = void;

/** 'UpdateLobbyCurrentMatch' query type */
export interface IUpdateLobbyCurrentMatchQuery {
  params: IUpdateLobbyCurrentMatchParams;
  result: IUpdateLobbyCurrentMatchResult;
}

const updateLobbyCurrentMatchIR: any = {"usedParamSet":{"current_match":true,"lobby_id":true},"params":[{"name":"current_match","required":false,"transform":{"type":"scalar"},"locs":[{"a":35,"b":48}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":76}]}],"statement":"UPDATE lobbies\nSET current_match = :current_match\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET current_match = :current_match
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateLobbyCurrentMatch = new PreparedQuery<IUpdateLobbyCurrentMatchParams,IUpdateLobbyCurrentMatchResult>(updateLobbyCurrentMatchIR);


/** 'UpdateLobbyCurrentRound' parameters type */
export interface IUpdateLobbyCurrentRoundParams {
  current_round?: number | null | void;
  lobby_id: string;
}

/** 'UpdateLobbyCurrentRound' return type */
export type IUpdateLobbyCurrentRoundResult = void;

/** 'UpdateLobbyCurrentRound' query type */
export interface IUpdateLobbyCurrentRoundQuery {
  params: IUpdateLobbyCurrentRoundParams;
  result: IUpdateLobbyCurrentRoundResult;
}

const updateLobbyCurrentRoundIR: any = {"usedParamSet":{"current_round":true,"lobby_id":true},"params":[{"name":"current_round","required":false,"transform":{"type":"scalar"},"locs":[{"a":35,"b":48}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":76}]}],"statement":"UPDATE lobbies\nSET current_round = :current_round\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET current_round = :current_round
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateLobbyCurrentRound = new PreparedQuery<IUpdateLobbyCurrentRoundParams,IUpdateLobbyCurrentRoundResult>(updateLobbyCurrentRoundIR);


/** 'UpdateLobbyMatchState' parameters type */
export interface IUpdateLobbyMatchStateParams {
  current_proper_round: number;
  current_turn: number;
  lobby_id: string;
}

/** 'UpdateLobbyMatchState' return type */
export type IUpdateLobbyMatchStateResult = void;

/** 'UpdateLobbyMatchState' query type */
export interface IUpdateLobbyMatchStateQuery {
  params: IUpdateLobbyMatchStateParams;
  result: IUpdateLobbyMatchStateResult;
}

const updateLobbyMatchStateIR: any = {"usedParamSet":{"current_turn":true,"current_proper_round":true,"lobby_id":true},"params":[{"name":"current_turn","required":true,"transform":{"type":"scalar"},"locs":[{"a":36,"b":49}]},{"name":"current_proper_round","required":true,"transform":{"type":"scalar"},"locs":[{"a":77,"b":98}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":117,"b":126}]}],"statement":"UPDATE lobbies\nSET\n  current_turn = :current_turn!,\n  current_proper_round = :current_proper_round!\nWHERE lobby_id = :lobby_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobbies
 * SET
 *   current_turn = :current_turn!,
 *   current_proper_round = :current_proper_round!
 * WHERE lobby_id = :lobby_id!
 * ```
 */
export const updateLobbyMatchState = new PreparedQuery<IUpdateLobbyMatchStateParams,IUpdateLobbyMatchStateResult>(updateLobbyMatchStateIR);


/** 'UpdateLobbyPlayer' parameters type */
export interface IUpdateLobbyPlayerParams {
  current_board: numberArray;
  current_deck: numberArray;
  current_draw: number;
  current_hand: numberArray;
  current_result?: ConciseResult | null | void;
  hit_points: number;
  lobby_id: string;
  nft_id: number;
  turn?: number | null | void;
}

/** 'UpdateLobbyPlayer' return type */
export type IUpdateLobbyPlayerResult = void;

/** 'UpdateLobbyPlayer' query type */
export interface IUpdateLobbyPlayerQuery {
  params: IUpdateLobbyPlayerParams;
  result: IUpdateLobbyPlayerResult;
}

const updateLobbyPlayerIR: any = {"usedParamSet":{"hit_points":true,"current_deck":true,"current_hand":true,"current_board":true,"current_draw":true,"current_result":true,"turn":true,"lobby_id":true,"nft_id":true},"params":[{"name":"hit_points","required":true,"transform":{"type":"scalar"},"locs":[{"a":39,"b":50}]},{"name":"current_deck","required":true,"transform":{"type":"scalar"},"locs":[{"a":70,"b":83}]},{"name":"current_hand","required":true,"transform":{"type":"scalar"},"locs":[{"a":103,"b":116}]},{"name":"current_board","required":true,"transform":{"type":"scalar"},"locs":[{"a":137,"b":151}]},{"name":"current_draw","required":true,"transform":{"type":"scalar"},"locs":[{"a":171,"b":184}]},{"name":"current_result","required":false,"transform":{"type":"scalar"},"locs":[{"a":206,"b":220}]},{"name":"turn","required":false,"transform":{"type":"scalar"},"locs":[{"a":232,"b":236}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":257,"b":266}]},{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":281,"b":288}]}],"statement":"UPDATE lobby_player\nSET\n  hit_points = :hit_points!,\n  current_deck = :current_deck!,\n  current_hand = :current_hand!,\n  current_board = :current_board!,\n  current_draw = :current_draw!,\n  current_result = :current_result,\n  turn = :turn\nWHERE\n  lobby_id = :lobby_id! AND nft_id = :nft_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE lobby_player
 * SET
 *   hit_points = :hit_points!,
 *   current_deck = :current_deck!,
 *   current_hand = :current_hand!,
 *   current_board = :current_board!,
 *   current_draw = :current_draw!,
 *   current_result = :current_result,
 *   turn = :turn
 * WHERE
 *   lobby_id = :lobby_id! AND nft_id = :nft_id!
 * ```
 */
export const updateLobbyPlayer = new PreparedQuery<IUpdateLobbyPlayerParams,IUpdateLobbyPlayerResult>(updateLobbyPlayerIR);


/** 'ExecutedRound' parameters type */
export interface IExecutedRoundParams {
  execution_block_height: number;
  lobby_id: string;
  match_within_lobby: number;
  round_within_match: number;
}

/** 'ExecutedRound' return type */
export type IExecutedRoundResult = void;

/** 'ExecutedRound' query type */
export interface IExecutedRoundQuery {
  params: IExecutedRoundParams;
  result: IExecutedRoundResult;
}

const executedRoundIR: any = {"usedParamSet":{"execution_block_height":true,"lobby_id":true,"match_within_lobby":true,"round_within_match":true},"params":[{"name":"execution_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":71}]},{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":92,"b":101}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":130,"b":149}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":178,"b":197}]}],"statement":"UPDATE match_round\nSET execution_block_height = :execution_block_height!\nWHERE\n  lobby_id = :lobby_id! AND\n  match_within_lobby = :match_within_lobby! AND\n  round_within_match = :round_within_match!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE match_round
 * SET execution_block_height = :execution_block_height!
 * WHERE
 *   lobby_id = :lobby_id! AND
 *   match_within_lobby = :match_within_lobby! AND
 *   round_within_match = :round_within_match!
 * ```
 */
export const executedRound = new PreparedQuery<IExecutedRoundParams,IExecutedRoundResult>(executedRoundIR);


/** 'AddWin' parameters type */
export interface IAddWinParams {
  nft_id?: number | null | void;
}

/** 'AddWin' return type */
export type IAddWinResult = void;

/** 'AddWin' query type */
export interface IAddWinQuery {
  params: IAddWinParams;
  result: IAddWinResult;
}

const addWinIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":60,"b":66}]}],"statement":"UPDATE global_user_state\nSET wins = wins + 1\nWHERE nft_id = :nft_id"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET wins = wins + 1
 * WHERE nft_id = :nft_id
 * ```
 */
export const addWin = new PreparedQuery<IAddWinParams,IAddWinResult>(addWinIR);


/** 'AddLoss' parameters type */
export interface IAddLossParams {
  nft_id?: number | null | void;
}

/** 'AddLoss' return type */
export type IAddLossResult = void;

/** 'AddLoss' query type */
export interface IAddLossQuery {
  params: IAddLossParams;
  result: IAddLossResult;
}

const addLossIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":64,"b":70}]}],"statement":"UPDATE global_user_state\nSET losses = losses + 1\nWHERE nft_id = :nft_id"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET losses = losses + 1
 * WHERE nft_id = :nft_id
 * ```
 */
export const addLoss = new PreparedQuery<IAddLossParams,IAddLossResult>(addLossIR);


/** 'AddTie' parameters type */
export interface IAddTieParams {
  nft_id?: number | null | void;
}

/** 'AddTie' return type */
export type IAddTieResult = void;

/** 'AddTie' query type */
export interface IAddTieQuery {
  params: IAddTieParams;
  result: IAddTieResult;
}

const addTieIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":60,"b":66}]}],"statement":"UPDATE global_user_state\nSET ties = ties + 1\nWHERE nft_id = :nft_id"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET ties = ties + 1
 * WHERE nft_id = :nft_id
 * ```
 */
export const addTie = new PreparedQuery<IAddTieParams,IAddTieResult>(addTieIR);


/** 'TransferCard' parameters type */
export interface ITransferCardParams {
  id: number;
  owner_nft_id?: number | null | void;
}

/** 'TransferCard' return type */
export type ITransferCardResult = void;

/** 'TransferCard' query type */
export interface ITransferCardQuery {
  params: ITransferCardParams;
  result: ITransferCardResult;
}

const transferCardIR: any = {"usedParamSet":{"owner_nft_id":true,"id":true},"params":[{"name":"owner_nft_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":32,"b":44}]},{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":57,"b":60}]}],"statement":"UPDATE cards\nSET owner_nft_id = :owner_nft_id\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE cards
 * SET owner_nft_id = :owner_nft_id
 * WHERE id = :id!
 * ```
 */
export const transferCard = new PreparedQuery<ITransferCardParams,ITransferCardResult>(transferCardIR);


/** 'SetTradeNftCards' parameters type */
export interface ISetTradeNftCardsParams {
  cards?: numberArray | null | void;
  nft_id: number;
}

/** 'SetTradeNftCards' return type */
export type ISetTradeNftCardsResult = void;

/** 'SetTradeNftCards' query type */
export interface ISetTradeNftCardsQuery {
  params: ISetTradeNftCardsParams;
  result: ISetTradeNftCardsResult;
}

const setTradeNftCardsIR: any = {"usedParamSet":{"cards":true,"nft_id":true},"params":[{"name":"cards","required":false,"transform":{"type":"scalar"},"locs":[{"a":34,"b":39}]},{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":63}]}],"statement":"UPDATE card_trade_nft\nSET cards = :cards\nWHERE nft_id = :nft_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE card_trade_nft
 * SET cards = :cards
 * WHERE nft_id = :nft_id!
 * ```
 */
export const setTradeNftCards = new PreparedQuery<ISetTradeNftCardsParams,ISetTradeNftCardsResult>(setTradeNftCardsIR);


/** 'DeleteTradeNftCards' parameters type */
export interface IDeleteTradeNftCardsParams {
  nft_id: number;
}

/** 'DeleteTradeNftCards' return type */
export type IDeleteTradeNftCardsResult = void;

/** 'DeleteTradeNftCards' query type */
export interface IDeleteTradeNftCardsQuery {
  params: IDeleteTradeNftCardsParams;
  result: IDeleteTradeNftCardsResult;
}

const deleteTradeNftCardsIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":54,"b":61}]}],"statement":"UPDATE card_trade_nft\nSET cards = NULL\nWHERE nft_id = :nft_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE card_trade_nft
 * SET cards = NULL
 * WHERE nft_id = :nft_id!
 * ```
 */
export const deleteTradeNftCards = new PreparedQuery<IDeleteTradeNftCardsParams,IDeleteTradeNftCardsResult>(deleteTradeNftCardsIR);



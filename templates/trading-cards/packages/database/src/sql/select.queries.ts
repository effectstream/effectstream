/** Types generated for queries found in "src/sql/select.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { LobbyStatus, ConciseResult } from '../../../common.ts';

export type NumberOrString = number | string;

export type numberArray = (number)[];

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
  practice: boolean;
  turn_length: number;
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


/** 'GetOpenLobbies' parameters type */
export interface IGetOpenLobbiesParams {
  count?: NumberOrString | null | void;
  page?: NumberOrString | null | void;
}

/** 'GetOpenLobbies' return type */
export interface IGetOpenLobbiesResult {
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
  practice: boolean;
  turn_length: number;
}

/** 'GetOpenLobbies' query type */
export interface IGetOpenLobbiesQuery {
  params: IGetOpenLobbiesParams;
  result: IGetOpenLobbiesResult;
}

const getOpenLobbiesIR: any = {"usedParamSet":{"count":true,"page":true},"params":[{"name":"count","required":false,"transform":{"type":"scalar"},"locs":[{"a":116,"b":121}]},{"name":"page","required":false,"transform":{"type":"scalar"},"locs":[{"a":130,"b":134}]}],"statement":"SELECT *\nFROM lobbies\nWHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE\nORDER BY created_at DESC\nLIMIT :count\nOFFSET :page"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM lobbies
 * WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE
 * ORDER BY created_at DESC
 * LIMIT :count
 * OFFSET :page
 * ```
 */
export const getOpenLobbies = new PreparedQuery<IGetOpenLobbiesParams,IGetOpenLobbiesResult>(getOpenLobbiesIR);


/** 'GetLobbyPlayers' parameters type */
export interface IGetLobbyPlayersParams {
  lobby_id: string;
}

/** 'GetLobbyPlayers' return type */
export interface IGetLobbyPlayersResult {
  current_board: numberArray;
  current_deck: numberArray;
  current_draw: number;
  current_hand: numberArray;
  current_result: ConciseResult | null;
  hit_points: number;
  id: number;
  lobby_id: string;
  nft_id: number;
  starting_commitments: string;
  turn: number | null;
}

/** 'GetLobbyPlayers' query type */
export interface IGetLobbyPlayersQuery {
  params: IGetLobbyPlayersParams;
  result: IGetLobbyPlayersResult;
}

const getLobbyPlayersIR: any = {"usedParamSet":{"lobby_id":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":57,"b":66}]}],"statement":"SELECT *\nFROM lobby_player\nWHERE lobby_player.lobby_id = :lobby_id!\nORDER BY lobby_player.id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM lobby_player
 * WHERE lobby_player.lobby_id = :lobby_id!
 * ORDER BY lobby_player.id
 * ```
 */
export const getLobbyPlayers = new PreparedQuery<IGetLobbyPlayersParams,IGetLobbyPlayersResult>(getLobbyPlayersIR);


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
  practice: boolean;
  turn_length: number;
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

const getMatchIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":54}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":83,"b":102}]}],"statement":"SELECT * FROM lobby_match\nWHERE\n  lobby_id = :lobby_id! AND\n  match_within_lobby = :match_within_lobby!"};

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

const getRoundIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true,"round_within_match":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":54}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":83,"b":102}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":131,"b":150}]}],"statement":"SELECT *\nFROM match_round\nWHERE\n  lobby_id = :lobby_id! AND\n  match_within_lobby = :match_within_lobby! AND\n  round_within_match = :round_within_match!"};

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
  round_within_match: number;
  serialized_move: string;
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


/** 'GetOwnedNft' parameters type */
export interface IGetOwnedNftParams {
  wallet_address: string;
}

/** 'GetOwnedNft' return type */
export interface IGetOwnedNftResult {
  nft_id: number;
}

/** 'GetOwnedNft' query type */
export interface IGetOwnedNftQuery {
  params: IGetOwnedNftParams;
  result: IGetOwnedNftResult;
}

const getOwnedNftIR: any = {"usedParamSet":{"wallet_address":true},"params":[{"name":"wallet_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":71}]}],"statement":"SELECT nft_id FROM nft_ownership\nWHERE wallet_address = :wallet_address!\nORDER BY nft_id\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT nft_id FROM nft_ownership
 * WHERE wallet_address = :wallet_address!
 * ORDER BY nft_id
 * LIMIT 1
 * ```
 */
export const getOwnedNft = new PreparedQuery<IGetOwnedNftParams,IGetOwnedNftResult>(getOwnedNftIR);


/** 'GetNftsForWallet' parameters type */
export interface IGetNftsForWalletParams {
  wallet_address: string;
}

/** 'GetNftsForWallet' return type */
export interface IGetNftsForWalletResult {
  nft_id: number;
}

/** 'GetNftsForWallet' query type */
export interface IGetNftsForWalletQuery {
  params: IGetNftsForWalletParams;
  result: IGetNftsForWalletResult;
}

const getNftsForWalletIR: any = {"usedParamSet":{"wallet_address":true},"params":[{"name":"wallet_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":71}]}],"statement":"SELECT nft_id FROM nft_ownership\nWHERE wallet_address = :wallet_address!\nORDER BY nft_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT nft_id FROM nft_ownership
 * WHERE wallet_address = :wallet_address!
 * ORDER BY nft_id
 * ```
 */
export const getNftsForWallet = new PreparedQuery<IGetNftsForWalletParams,IGetNftsForWalletResult>(getNftsForWalletIR);


/** 'GetOwnedCards' parameters type */
export interface IGetOwnedCardsParams {
  owner_nft_id: number;
}

/** 'GetOwnedCards' return type */
export interface IGetOwnedCardsResult {
  id: number;
  owner_nft_id: number | null;
  registry_id: number;
}

/** 'GetOwnedCards' query type */
export interface IGetOwnedCardsQuery {
  params: IGetOwnedCardsParams;
  result: IGetOwnedCardsResult;
}

const getOwnedCardsIR: any = {"usedParamSet":{"owner_nft_id":true},"params":[{"name":"owner_nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":54}]}],"statement":"SELECT * FROM cards\nWHERE owner_nft_id = :owner_nft_id!\nORDER BY id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM cards
 * WHERE owner_nft_id = :owner_nft_id!
 * ORDER BY id
 * ```
 */
export const getOwnedCards = new PreparedQuery<IGetOwnedCardsParams,IGetOwnedCardsResult>(getOwnedCardsIR);


/** 'CheckOwnedCard' parameters type */
export interface ICheckOwnedCardParams {
  id: number;
  owner_nft_id: number;
}

/** 'CheckOwnedCard' return type */
export interface ICheckOwnedCardResult {
  id: number;
  owner_nft_id: number | null;
  registry_id: number;
}

/** 'CheckOwnedCard' query type */
export interface ICheckOwnedCardQuery {
  params: ICheckOwnedCardParams;
  result: ICheckOwnedCardResult;
}

const checkOwnedCardIR: any = {"usedParamSet":{"owner_nft_id":true,"id":true},"params":[{"name":"owner_nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":54}]},{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":65,"b":68}]}],"statement":"SELECT * FROM cards\nWHERE owner_nft_id = :owner_nft_id! AND id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM cards
 * WHERE owner_nft_id = :owner_nft_id! AND id = :id!
 * ```
 */
export const checkOwnedCard = new PreparedQuery<ICheckOwnedCardParams,ICheckOwnedCardResult>(checkOwnedCardIR);


/** 'GetCardPacks' parameters type */
export interface IGetCardPacksParams {
  buyer_nft_id: number;
}

/** 'GetCardPacks' return type */
export interface IGetCardPacksResult {
  buyer_nft_id: number;
  card_registry_ids: numberArray;
  id: number;
}

/** 'GetCardPacks' query type */
export interface IGetCardPacksQuery {
  params: IGetCardPacksParams;
  result: IGetCardPacksResult;
}

const getCardPacksIR: any = {"usedParamSet":{"buyer_nft_id":true},"params":[{"name":"buyer_nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":59}]}],"statement":"SELECT * FROM card_packs\nWHERE buyer_nft_id = :buyer_nft_id!\nORDER BY id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM card_packs
 * WHERE buyer_nft_id = :buyer_nft_id!
 * ORDER BY id
 * ```
 */
export const getCardPacks = new PreparedQuery<IGetCardPacksParams,IGetCardPacksResult>(getCardPacksIR);


/** 'GetTradeNft' parameters type */
export interface IGetTradeNftParams {
  nft_id: number;
}

/** 'GetTradeNft' return type */
export interface IGetTradeNftResult {
  cards: numberArray | null;
  nft_id: number;
}

/** 'GetTradeNft' query type */
export interface IGetTradeNftQuery {
  params: IGetTradeNftParams;
  result: IGetTradeNftResult;
}

const getTradeNftIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":44,"b":51}]}],"statement":"SELECT * FROM card_trade_nft\nWHERE nft_id = :nft_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM card_trade_nft
 * WHERE nft_id = :nft_id!
 * ```
 */
export const getTradeNft = new PreparedQuery<IGetTradeNftParams,IGetTradeNftResult>(getTradeNftIR);



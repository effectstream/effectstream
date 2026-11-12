/** Types generated for queries found in "src/sql/insert.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { LobbyStatus } from '../../../common.ts';

export type DateOrString = Date | string;

export type numberArray = (number)[];

/** 'CreateLobby' parameters type */
export interface ICreateLobbyParams {
  created_at: DateOrString;
  creation_block_height: number;
  hidden: boolean;
  lobby_creator: number;
  lobby_id: string;
  lobby_state: LobbyStatus;
  max_players: number;
  num_of_rounds: number;
  practice: boolean;
  turn_length: number;
}

/** 'CreateLobby' return type */
export type ICreateLobbyResult = void;

/** 'CreateLobby' query type */
export interface ICreateLobbyQuery {
  params: ICreateLobbyParams;
  result: ICreateLobbyResult;
}

const createLobbyIR: any = {"usedParamSet":{"lobby_id":true,"max_players":true,"num_of_rounds":true,"turn_length":true,"creation_block_height":true,"created_at":true,"hidden":true,"practice":true,"lobby_creator":true,"lobby_state":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":184,"b":193}]},{"name":"max_players","required":true,"transform":{"type":"scalar"},"locs":[{"a":198,"b":210}]},{"name":"num_of_rounds","required":true,"transform":{"type":"scalar"},"locs":[{"a":215,"b":229}]},{"name":"turn_length","required":true,"transform":{"type":"scalar"},"locs":[{"a":234,"b":246}]},{"name":"creation_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":251,"b":273}]},{"name":"created_at","required":true,"transform":{"type":"scalar"},"locs":[{"a":278,"b":289}]},{"name":"hidden","required":true,"transform":{"type":"scalar"},"locs":[{"a":294,"b":301}]},{"name":"practice","required":true,"transform":{"type":"scalar"},"locs":[{"a":306,"b":315}]},{"name":"lobby_creator","required":true,"transform":{"type":"scalar"},"locs":[{"a":320,"b":334}]},{"name":"lobby_state","required":true,"transform":{"type":"scalar"},"locs":[{"a":339,"b":351}]}],"statement":"INSERT INTO lobbies(\n  lobby_id,\n  max_players,\n  num_of_rounds,\n  turn_length,\n  creation_block_height,\n  created_at,\n  hidden,\n  practice,\n  lobby_creator,\n  lobby_state\n)\nVALUES(\n  :lobby_id!,\n  :max_players!,\n  :num_of_rounds!,\n  :turn_length!,\n  :creation_block_height!,\n  :created_at!,\n  :hidden!,\n  :practice!,\n  :lobby_creator!,\n  :lobby_state!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO lobbies(
 *   lobby_id,
 *   max_players,
 *   num_of_rounds,
 *   turn_length,
 *   creation_block_height,
 *   created_at,
 *   hidden,
 *   practice,
 *   lobby_creator,
 *   lobby_state
 * )
 * VALUES(
 *   :lobby_id!,
 *   :max_players!,
 *   :num_of_rounds!,
 *   :turn_length!,
 *   :creation_block_height!,
 *   :created_at!,
 *   :hidden!,
 *   :practice!,
 *   :lobby_creator!,
 *   :lobby_state!
 * )
 * ```
 */
export const createLobby = new PreparedQuery<ICreateLobbyParams,ICreateLobbyResult>(createLobbyIR);


/** 'JoinPlayerToLobby' parameters type */
export interface IJoinPlayerToLobbyParams {
  current_deck: numberArray;
  hit_points: number;
  lobby_id: string;
  nft_id: number;
  starting_commitments: string;
  turn?: number | null | void;
}

/** 'JoinPlayerToLobby' return type */
export type IJoinPlayerToLobbyResult = void;

/** 'JoinPlayerToLobby' query type */
export interface IJoinPlayerToLobbyQuery {
  params: IJoinPlayerToLobbyParams;
  result: IJoinPlayerToLobbyResult;
}

const joinPlayerToLobbyIR: any = {"usedParamSet":{"lobby_id":true,"nft_id":true,"starting_commitments":true,"hit_points":true,"current_deck":true,"turn":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":121,"b":130}]},{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":135,"b":142}]},{"name":"starting_commitments","required":true,"transform":{"type":"scalar"},"locs":[{"a":147,"b":168}]},{"name":"hit_points","required":true,"transform":{"type":"scalar"},"locs":[{"a":173,"b":184}]},{"name":"current_deck","required":true,"transform":{"type":"scalar"},"locs":[{"a":189,"b":202}]},{"name":"turn","required":false,"transform":{"type":"scalar"},"locs":[{"a":207,"b":211}]}],"statement":"INSERT INTO lobby_player(\n  lobby_id,\n  nft_id,\n  starting_commitments,\n  hit_points,\n  current_deck,\n  turn\n)\nVALUES(\n  :lobby_id!,\n  :nft_id!,\n  :starting_commitments!,\n  :hit_points!,\n  :current_deck!,\n  :turn\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO lobby_player(
 *   lobby_id,
 *   nft_id,
 *   starting_commitments,
 *   hit_points,
 *   current_deck,
 *   turn
 * )
 * VALUES(
 *   :lobby_id!,
 *   :nft_id!,
 *   :starting_commitments!,
 *   :hit_points!,
 *   :current_deck!,
 *   :turn
 * )
 * ```
 */
export const joinPlayerToLobby = new PreparedQuery<IJoinPlayerToLobbyParams,IJoinPlayerToLobbyResult>(joinPlayerToLobbyIR);


/** 'NewMatch' parameters type */
export interface INewMatchParams {
  lobby_id: string;
  match_within_lobby: number;
  starting_block_height: number;
}

/** 'NewMatch' return type */
export interface INewMatchResult {
  id: number;
  lobby_id: string;
  match_within_lobby: number;
  starting_block_height: number;
}

/** 'NewMatch' query type */
export interface INewMatchQuery {
  params: INewMatchParams;
  result: INewMatchResult;
}

const newMatchIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true,"starting_block_height":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":96,"b":105}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":110,"b":129}]},{"name":"starting_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":134,"b":156}]}],"statement":"INSERT INTO lobby_match(\n  lobby_id,\n  match_within_lobby,\n  starting_block_height\n)\nVALUES (\n  :lobby_id!,\n  :match_within_lobby!,\n  :starting_block_height!\n)\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO lobby_match(
 *   lobby_id,
 *   match_within_lobby,
 *   starting_block_height
 * )
 * VALUES (
 *   :lobby_id!,
 *   :match_within_lobby!,
 *   :starting_block_height!
 * )
 * RETURNING *
 * ```
 */
export const newMatch = new PreparedQuery<INewMatchParams,INewMatchResult>(newMatchIR);


/** 'NewRound' parameters type */
export interface INewRoundParams {
  execution_block_height?: number | null | void;
  lobby_id: string;
  match_within_lobby: number;
  round_within_match: number;
  starting_block_height: number;
}

/** 'NewRound' return type */
export interface INewRoundResult {
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  match_within_lobby: number;
  round_within_match: number;
  starting_block_height: number;
}

/** 'NewRound' query type */
export interface INewRoundQuery {
  params: INewRoundParams;
  result: INewRoundResult;
}

const newRoundIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true,"round_within_match":true,"starting_block_height":true,"execution_block_height":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":144,"b":153}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":158,"b":177}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":182,"b":201}]},{"name":"starting_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":206,"b":228}]},{"name":"execution_block_height","required":false,"transform":{"type":"scalar"},"locs":[{"a":233,"b":255}]}],"statement":"INSERT INTO match_round(\n  lobby_id,\n  match_within_lobby,\n  round_within_match,\n  starting_block_height,\n  execution_block_height\n)\nVALUES (\n  :lobby_id!,\n  :match_within_lobby!,\n  :round_within_match!,\n  :starting_block_height!,\n  :execution_block_height\n)\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO match_round(
 *   lobby_id,
 *   match_within_lobby,
 *   round_within_match,
 *   starting_block_height,
 *   execution_block_height
 * )
 * VALUES (
 *   :lobby_id!,
 *   :match_within_lobby!,
 *   :round_within_match!,
 *   :starting_block_height!,
 *   :execution_block_height
 * )
 * RETURNING *
 * ```
 */
export const newRound = new PreparedQuery<INewRoundParams,INewRoundResult>(newRoundIR);


/** 'NewMove' parameters type */
export interface INewMoveParams {
  lobby_id: string;
  match_within_lobby: number;
  move_within_round: number;
  nft_id: number;
  round_within_match: number;
  serialized_move: string;
}

/** 'NewMove' return type */
export type INewMoveResult = void;

/** 'NewMove' query type */
export interface INewMoveQuery {
  params: INewMoveParams;
  result: INewMoveResult;
}

const newMoveIR: any = {"usedParamSet":{"lobby_id":true,"match_within_lobby":true,"round_within_match":true,"move_within_round":true,"nft_id":true,"serialized_move":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":142,"b":151}]},{"name":"match_within_lobby","required":true,"transform":{"type":"scalar"},"locs":[{"a":156,"b":175}]},{"name":"round_within_match","required":true,"transform":{"type":"scalar"},"locs":[{"a":180,"b":199}]},{"name":"move_within_round","required":true,"transform":{"type":"scalar"},"locs":[{"a":204,"b":222}]},{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":227,"b":234}]},{"name":"serialized_move","required":true,"transform":{"type":"scalar"},"locs":[{"a":239,"b":255}]}],"statement":"INSERT INTO round_move(\n  lobby_id,\n  match_within_lobby,\n  round_within_match,\n  move_within_round,\n  nft_id,\n  serialized_move\n)\nVALUES (\n  :lobby_id!,\n  :match_within_lobby!,\n  :round_within_match!,\n  :move_within_round!,\n  :nft_id!,\n  :serialized_move!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO round_move(
 *   lobby_id,
 *   match_within_lobby,
 *   round_within_match,
 *   move_within_round,
 *   nft_id,
 *   serialized_move
 * )
 * VALUES (
 *   :lobby_id!,
 *   :match_within_lobby!,
 *   :round_within_match!,
 *   :move_within_round!,
 *   :nft_id!,
 *   :serialized_move!
 * )
 * ```
 */
export const newMove = new PreparedQuery<INewMoveParams,INewMoveResult>(newMoveIR);


/** 'NewStats' parameters type */
export interface INewStatsParams {
  stats: {
    nft_id: number,
    wins: number,
    losses: number,
    ties: number
  };
}

/** 'NewStats' return type */
export type INewStatsResult = void;

/** 'NewStats' query type */
export interface INewStatsQuery {
  params: INewStatsParams;
  result: INewStatsResult;
}

const newStatsIR: any = {"usedParamSet":{"stats":true},"params":[{"name":"stats","required":false,"transform":{"type":"pick_tuple","keys":[{"name":"nft_id","required":true},{"name":"wins","required":true},{"name":"losses","required":true},{"name":"ties","required":true}]},"locs":[{"a":37,"b":42}]}],"statement":"INSERT INTO global_user_state\nVALUES :stats\nON CONFLICT (nft_id)\nDO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_user_state
 * VALUES :stats
 * ON CONFLICT (nft_id)
 * DO NOTHING
 * ```
 */
export const newStats = new PreparedQuery<INewStatsParams,INewStatsResult>(newStatsIR);


/** 'InsertNftOwnership' parameters type */
export interface IInsertNftOwnershipParams {
  nft_id: number;
  wallet_address: string;
}

/** 'InsertNftOwnership' return type */
export type IInsertNftOwnershipResult = void;

/** 'InsertNftOwnership' query type */
export interface IInsertNftOwnershipQuery {
  params: IInsertNftOwnershipParams;
  result: IInsertNftOwnershipResult;
}

const insertNftOwnershipIR: any = {"usedParamSet":{"nft_id":true,"wallet_address":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":59,"b":66}]},{"name":"wallet_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":69,"b":84}]}],"statement":"INSERT INTO nft_ownership (nft_id, wallet_address)\nVALUES (:nft_id!, :wallet_address!)\nON CONFLICT (nft_id)\nDO UPDATE SET\n  wallet_address = EXCLUDED.wallet_address"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO nft_ownership (nft_id, wallet_address)
 * VALUES (:nft_id!, :wallet_address!)
 * ON CONFLICT (nft_id)
 * DO UPDATE SET
 *   wallet_address = EXCLUDED.wallet_address
 * ```
 */
export const insertNftOwnership = new PreparedQuery<IInsertNftOwnershipParams,IInsertNftOwnershipResult>(insertNftOwnershipIR);


/** 'NewTradeNft' parameters type */
export interface INewTradeNftParams {
  nft_id: number;
}

/** 'NewTradeNft' return type */
export type INewTradeNftResult = void;

/** 'NewTradeNft' query type */
export interface INewTradeNftQuery {
  params: INewTradeNftParams;
  result: INewTradeNftResult;
}

const newTradeNftIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":44,"b":51}]}],"statement":"INSERT INTO card_trade_nft (nft_id)\nVALUES (:nft_id!)\nON CONFLICT (nft_id)\nDO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO card_trade_nft (nft_id)
 * VALUES (:nft_id!)
 * ON CONFLICT (nft_id)
 * DO NOTHING
 * ```
 */
export const newTradeNft = new PreparedQuery<INewTradeNftParams,INewTradeNftResult>(newTradeNftIR);


/** 'NewCardPack' parameters type */
export interface INewCardPackParams {
  pack: {
    buyer_nft_id: number,
    card_registry_ids: numberArray
  };
}

/** 'NewCardPack' return type */
export interface INewCardPackResult {
  buyer_nft_id: number;
  card_registry_ids: numberArray;
  id: number;
}

/** 'NewCardPack' query type */
export interface INewCardPackQuery {
  params: INewCardPackParams;
  result: INewCardPackResult;
}

const newCardPackIR: any = {"usedParamSet":{"pack":true},"params":[{"name":"pack","required":false,"transform":{"type":"pick_tuple","keys":[{"name":"buyer_nft_id","required":true},{"name":"card_registry_ids","required":true}]},"locs":[{"a":64,"b":68}]}],"statement":"INSERT INTO card_packs (buyer_nft_id, card_registry_ids)\nVALUES :pack\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO card_packs (buyer_nft_id, card_registry_ids)
 * VALUES :pack
 * RETURNING *
 * ```
 */
export const newCardPack = new PreparedQuery<INewCardPackParams,INewCardPackResult>(newCardPackIR);


/** 'NewCard' parameters type */
export interface INewCardParams {
  owner_nft_id: number;
  registry_id: number;
}

/** 'NewCard' return type */
export interface INewCardResult {
  id: number;
  owner_nft_id: number | null;
  registry_id: number;
}

/** 'NewCard' query type */
export interface INewCardQuery {
  params: INewCardParams;
  result: INewCardResult;
}

const newCardIR: any = {"usedParamSet":{"owner_nft_id":true,"registry_id":true},"params":[{"name":"owner_nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":54,"b":67}]},{"name":"registry_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":70,"b":82}]}],"statement":"INSERT INTO cards (owner_nft_id, registry_id)\nVALUES (:owner_nft_id!, :registry_id!)\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO cards (owner_nft_id, registry_id)
 * VALUES (:owner_nft_id!, :registry_id!)
 * RETURNING *
 * ```
 */
export const newCard = new PreparedQuery<INewCardParams,INewCardResult>(newCardIR);



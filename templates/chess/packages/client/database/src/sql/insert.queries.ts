/** Types generated for queries found in "src/sql/insert.sql" */
import { PreparedQuery } from "@pgtyped/runtime";

// export type lobby_status = 'active' | 'closed' | 'finished' | 'open';
// export type match_result = 'loss' | 'tie' | 'win';
import type { LobbyStatus, MatchResult } from "../common.ts";
type lobby_status = LobbyStatus;
type match_result = MatchResult;

export type DateOrString = Date | string;

/** 'CreateLobby' parameters type */
export interface ICreateLobbyParams {
  bot_difficulty: number;
  created_at: DateOrString;
  creation_block_height: number;
  current_round?: number | null | void;
  hidden: boolean;
  latest_match_state: string;
  lobby_creator: string;
  lobby_id: string;
  lobby_state: lobby_status;
  num_of_rounds: number;
  play_time_per_player: number;
  player_one_iswhite: boolean;
  player_two?: string | null | void;
  practice: boolean;
  round_length: number;
}

/** 'CreateLobby' return type */
export type ICreateLobbyResult = void;

/** 'CreateLobby' query type */
export interface ICreateLobbyQuery {
  params: ICreateLobbyParams;
  result: ICreateLobbyResult;
}

const createLobbyIR: any = {
  "usedParamSet": {
    "lobby_id": true,
    "num_of_rounds": true,
    "round_length": true,
    "play_time_per_player": true,
    "current_round": true,
    "creation_block_height": true,
    "created_at": true,
    "hidden": true,
    "practice": true,
    "bot_difficulty": true,
    "lobby_creator": true,
    "player_one_iswhite": true,
    "lobby_state": true,
    "player_two": true,
    "latest_match_state": true,
  },
  "params": [{
    "name": "lobby_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 300, "b": 309 }],
  }, {
    "name": "num_of_rounds",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 313, "b": 327 }],
  }, {
    "name": "round_length",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 331, "b": 344 }],
  }, {
    "name": "play_time_per_player",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 348, "b": 369 }],
  }, {
    "name": "current_round",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 373, "b": 386 }],
  }, {
    "name": "creation_block_height",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 390, "b": 412 }],
  }, {
    "name": "created_at",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 416, "b": 427 }],
  }, {
    "name": "hidden",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 431, "b": 438 }],
  }, {
    "name": "practice",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 442, "b": 451 }],
  }, {
    "name": "bot_difficulty",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 455, "b": 470 }],
  }, {
    "name": "lobby_creator",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 474, "b": 488 }],
  }, {
    "name": "player_one_iswhite",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 492, "b": 511 }],
  }, {
    "name": "lobby_state",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 515, "b": 527 }],
  }, {
    "name": "player_two",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 531, "b": 541 }],
  }, {
    "name": "latest_match_state",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 545, "b": 564 }],
  }],
  "statement":
    "INSERT INTO lobbies(\n   lobby_id,\n   num_of_rounds,\n   round_length,\n   play_time_per_player,\n   current_round,\n   creation_block_height,\n   created_at,\n   hidden,\n   practice,\n   bot_difficulty,\n   lobby_creator,\n   player_one_iswhite,\n   lobby_state,\n   player_two,\n   latest_match_state)\nVALUES(\n :lobby_id!,\n :num_of_rounds!,\n :round_length!,\n :play_time_per_player!,\n :current_round,\n :creation_block_height!,\n :created_at!,\n :hidden!,\n :practice!,\n :bot_difficulty!,\n :lobby_creator!,\n :player_one_iswhite!,\n :lobby_state!,\n :player_two,\n :latest_match_state!\n)",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO lobbies(
 *    lobby_id,
 *    num_of_rounds,
 *    round_length,
 *    play_time_per_player,
 *    current_round,
 *    creation_block_height,
 *    created_at,
 *    hidden,
 *    practice,
 *    bot_difficulty,
 *    lobby_creator,
 *    player_one_iswhite,
 *    lobby_state,
 *    player_two,
 *    latest_match_state)
 * VALUES(
 *  :lobby_id!,
 *  :num_of_rounds!,
 *  :round_length!,
 *  :play_time_per_player!,
 *  :current_round,
 *  :creation_block_height!,
 *  :created_at!,
 *  :hidden!,
 *  :practice!,
 *  :bot_difficulty!,
 *  :lobby_creator!,
 *  :player_one_iswhite!,
 *  :lobby_state!,
 *  :player_two,
 *  :latest_match_state!
 * )
 * ```
 */
export const createLobby = new PreparedQuery<
  ICreateLobbyParams,
  ICreateLobbyResult
>(createLobbyIR);

/** 'NewRound' parameters type */
export interface INewRoundParams {
  execution_block_height?: number | null | void;
  lobby_id: string;
  match_state: string;
  player_one_blocks_left: number;
  player_two_blocks_left: number;
  round_within_match: number;
  starting_block_height: number;
}

/** 'NewRound' return type */
export interface INewRoundResult {
  execution_block_height: number | null;
  id: number;
  lobby_id: string;
  match_state: string;
  player_one_blocks_left: number;
  player_two_blocks_left: number;
  round_within_match: number;
  starting_block_height: number;
}

/** 'NewRound' query type */
export interface INewRoundQuery {
  params: INewRoundParams;
  result: INewRoundResult;
}

const newRoundIR: any = {
  "usedParamSet": {
    "lobby_id": true,
    "round_within_match": true,
    "match_state": true,
    "player_one_blocks_left": true,
    "player_two_blocks_left": true,
    "starting_block_height": true,
    "execution_block_height": true,
  },
  "params": [{
    "name": "lobby_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 189, "b": 198 }],
  }, {
    "name": "round_within_match",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 204, "b": 223 }],
  }, {
    "name": "match_state",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 229, "b": 241 }],
  }, {
    "name": "player_one_blocks_left",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 247, "b": 270 }],
  }, {
    "name": "player_two_blocks_left",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 276, "b": 299 }],
  }, {
    "name": "starting_block_height",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 305, "b": 327 }],
  }, {
    "name": "execution_block_height",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 333, "b": 355 }],
  }],
  "statement":
    "INSERT INTO rounds(\n  lobby_id, \n  round_within_match, \n  match_state, \n  player_one_blocks_left, \n  player_two_blocks_left, \n  starting_block_height, \n  execution_block_height)\nVALUES (\n  :lobby_id!, \n  :round_within_match!, \n  :match_state!, \n  :player_one_blocks_left!, \n  :player_two_blocks_left!, \n  :starting_block_height!, \n  :execution_block_height)\nRETURNING *",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO rounds(
 *   lobby_id,
 *   round_within_match,
 *   match_state,
 *   player_one_blocks_left,
 *   player_two_blocks_left,
 *   starting_block_height,
 *   execution_block_height)
 * VALUES (
 *   :lobby_id!,
 *   :round_within_match!,
 *   :match_state!,
 *   :player_one_blocks_left!,
 *   :player_two_blocks_left!,
 *   :starting_block_height!,
 *   :execution_block_height)
 * RETURNING *
 * ```
 */
export const newRound = new PreparedQuery<INewRoundParams, INewRoundResult>(
  newRoundIR,
);

/** 'NewMatchMove' parameters type */
export interface INewMatchMoveParams {
  new_move: {
    lobby_id: string;
    wallet: string;
    round: number;
    move_pgn: string | null | void;
  };
}

/** 'NewMatchMove' return type */
export type INewMatchMoveResult = void;

/** 'NewMatchMove' query type */
export interface INewMatchMoveQuery {
  params: INewMatchMoveParams;
  result: INewMatchMoveResult;
}

const newMatchMoveIR: any = {
  "usedParamSet": { "new_move": true },
  "params": [{
    "name": "new_move",
    "required": false,
    "transform": {
      "type": "pick_tuple",
      "keys": [
        { "name": "lobby_id", "required": true },
        { "name": "wallet", "required": true },
        { "name": "round", "required": true },
        { "name": "move_pgn", "required": false },
      ],
    },
    "locs": [{ "a": 66, "b": 74 }],
  }],
  "statement":
    "INSERT INTO match_moves(lobby_id, wallet, round, move_pgn)\nVALUES :new_move",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO match_moves(lobby_id, wallet, round, move_pgn)
 * VALUES :new_move
 * ```
 */
export const newMatchMove = new PreparedQuery<
  INewMatchMoveParams,
  INewMatchMoveResult
>(newMatchMoveIR);

/** 'NewFinalState' parameters type */
export interface INewFinalStateParams {
  final_state: {
    lobby_id: string;
    player_one_iswhite: boolean;
    player_one_wallet: string;
    player_one_result: match_result;
    player_one_elapsed_time: number;
    player_two_wallet: string;
    player_two_result: match_result;
    player_two_elapsed_time: number;
    positions: string;
  };
}

/** 'NewFinalState' return type */
export type INewFinalStateResult = void;

/** 'NewFinalState' query type */
export interface INewFinalStateQuery {
  params: INewFinalStateParams;
  result: INewFinalStateResult;
}

const newFinalStateIR: any = {
  "usedParamSet": { "final_state": true },
  "params": [{
    "name": "final_state",
    "required": false,
    "transform": {
      "type": "pick_tuple",
      "keys": [
        { "name": "lobby_id", "required": true },
        { "name": "player_one_iswhite", "required": true },
        { "name": "player_one_wallet", "required": true },
        { "name": "player_one_result", "required": true },
        { "name": "player_one_elapsed_time", "required": true },
        { "name": "player_two_wallet", "required": true },
        { "name": "player_two_result", "required": true },
        { "name": "player_two_elapsed_time", "required": true },
        { "name": "positions", "required": true },
      ],
    },
    "locs": [{ "a": 204, "b": 215 }],
  }],
  "statement":
    "INSERT INTO final_match_state(lobby_id, player_one_iswhite, player_one_wallet, player_one_result, player_one_elapsed_time, player_two_wallet, player_two_result, player_two_elapsed_time, positions)\nVALUES :final_state",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO final_match_state(lobby_id, player_one_iswhite, player_one_wallet, player_one_result, player_one_elapsed_time, player_two_wallet, player_two_result, player_two_elapsed_time, positions)
 * VALUES :final_state
 * ```
 */
export const newFinalState = new PreparedQuery<
  INewFinalStateParams,
  INewFinalStateResult
>(newFinalStateIR);

/** 'NewStats' parameters type */
export interface INewStatsParams {
  stats: {
    wallet: string;
    wins: number;
    losses: number;
    ties: number;
    rating: number;
  };
}

/** 'NewStats' return type */
export type INewStatsResult = void;

/** 'NewStats' query type */
export interface INewStatsQuery {
  params: INewStatsParams;
  result: INewStatsResult;
}

const newStatsIR: any = {
  "usedParamSet": { "stats": true },
  "params": [{
    "name": "stats",
    "required": false,
    "transform": {
      "type": "pick_tuple",
      "keys": [
        { "name": "wallet", "required": true },
        { "name": "wins", "required": true },
        { "name": "losses", "required": true },
        { "name": "ties", "required": true },
        { "name": "rating", "required": true },
      ],
    },
    "locs": [{ "a": 37, "b": 42 }],
  }],
  "statement":
    "INSERT INTO global_user_state\nVALUES :stats\nON CONFLICT (wallet)\nDO NOTHING",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_user_state
 * VALUES :stats
 * ON CONFLICT (wallet)
 * DO NOTHING
 * ```
 */
export const newStats = new PreparedQuery<INewStatsParams, INewStatsResult>(
  newStatsIR,
);

/** 'UpdateStats' parameters type */
export interface IUpdateStatsParams {
  stats: {
    wallet: string;
    wins: number;
    losses: number;
    ties: number;
    rating: number;
  };
}

/** 'UpdateStats' return type */
export type IUpdateStatsResult = void;

/** 'UpdateStats' query type */
export interface IUpdateStatsQuery {
  params: IUpdateStatsParams;
  result: IUpdateStatsResult;
}

const updateStatsIR: any = {
  "usedParamSet": { "stats": true },
  "params": [{
    "name": "stats",
    "required": false,
    "transform": {
      "type": "pick_tuple",
      "keys": [
        { "name": "wallet", "required": true },
        { "name": "wins", "required": true },
        { "name": "losses", "required": true },
        { "name": "ties", "required": true },
        { "name": "rating", "required": true },
      ],
    },
    "locs": [{ "a": 37, "b": 42 }],
  }],
  "statement":
    "INSERT INTO global_user_state\nVALUES :stats\nON CONFLICT (wallet)\nDO UPDATE SET\nwins = EXCLUDED.wins,\nlosses = EXCLUDED.losses,\nties = EXCLUDED.ties,\nrating = EXCLUDED.rating",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_user_state
 * VALUES :stats
 * ON CONFLICT (wallet)
 * DO UPDATE SET
 * wins = EXCLUDED.wins,
 * losses = EXCLUDED.losses,
 * ties = EXCLUDED.ties,
 * rating = EXCLUDED.rating
 * ```
 */
export const updateStats = new PreparedQuery<
  IUpdateStatsParams,
  IUpdateStatsResult
>(updateStatsIR);

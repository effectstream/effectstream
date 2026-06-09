/** Types generated for queries found in "src/sql/insert.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'CreateLobby' parameters type */
export interface ICreateLobbyParams {
  buildings: string;
  created_at: DateOrString;
  creation_block_height: number;
  gold: number;
  init_tiles: number;
  lobby_creator: string;
  lobby_id: string;
  map: string;
  num_of_players: number;
  round_limit: number;
  time_limit: number;
  units: string;
}

/** 'CreateLobby' return type */
export type ICreateLobbyResult = void;

/** 'CreateLobby' query type */
export interface ICreateLobbyQuery {
  params: ICreateLobbyParams;
  result: ICreateLobbyResult;
}

const createLobbyIR: any = {"usedParamSet":{"lobby_id":true,"num_of_players":true,"created_at":true,"creation_block_height":true,"lobby_creator":true,"map":true,"units":true,"buildings":true,"gold":true,"init_tiles":true,"time_limit":true,"round_limit":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":292,"b":301}]},{"name":"num_of_players","required":true,"transform":{"type":"scalar"},"locs":[{"a":308,"b":323}]},{"name":"created_at","required":true,"transform":{"type":"scalar"},"locs":[{"a":337,"b":348}]},{"name":"creation_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":355,"b":377}]},{"name":"lobby_creator","required":true,"transform":{"type":"scalar"},"locs":[{"a":384,"b":398}]},{"name":"map","required":true,"transform":{"type":"scalar"},"locs":[{"a":435,"b":439}]},{"name":"units","required":true,"transform":{"type":"scalar"},"locs":[{"a":446,"b":452}]},{"name":"buildings","required":true,"transform":{"type":"scalar"},"locs":[{"a":459,"b":469}]},{"name":"gold","required":true,"transform":{"type":"scalar"},"locs":[{"a":476,"b":481}]},{"name":"init_tiles","required":true,"transform":{"type":"scalar"},"locs":[{"a":488,"b":499}]},{"name":"time_limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":506,"b":517}]},{"name":"round_limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":524,"b":536}]}],"statement":"INSERT INTO lobby(\n    lobby_id,\n    num_of_players,\n    current_round,\n    created_at,\n    creation_block_height,\n    lobby_creator,\n    lobby_state,\n    game_state,\n    game_winner,\n    map,\n    units,\n    buildings,\n    gold,\n    init_tiles,\n    time_limit,\n    round_limit\n) VALUES (\n    :lobby_id!,\n    :num_of_players!,\n    0,\n    :created_at!,\n    :creation_block_height!,\n    :lobby_creator!,\n    'open',\n    '',\n    NULL,\n    :map!,\n    :units!,\n    :buildings!,\n    :gold!,\n    :init_tiles!,\n    :time_limit!,\n    :round_limit!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO lobby(
 *     lobby_id,
 *     num_of_players,
 *     current_round,
 *     created_at,
 *     creation_block_height,
 *     lobby_creator,
 *     lobby_state,
 *     game_state,
 *     game_winner,
 *     map,
 *     units,
 *     buildings,
 *     gold,
 *     init_tiles,
 *     time_limit,
 *     round_limit
 * ) VALUES (
 *     :lobby_id!,
 *     :num_of_players!,
 *     0,
 *     :created_at!,
 *     :creation_block_height!,
 *     :lobby_creator!,
 *     'open',
 *     '',
 *     NULL,
 *     :map!,
 *     :units!,
 *     :buildings!,
 *     :gold!,
 *     :init_tiles!,
 *     :time_limit!,
 *     :round_limit!
 * )
 * ```
 */
export const createLobby = new PreparedQuery<ICreateLobbyParams,ICreateLobbyResult>(createLobbyIR);


/** 'AddPlayerToLobby' parameters type */
export interface IAddPlayerToLobbyParams {
  lobby_id: string;
  player_wallet: string;
}

/** 'AddPlayerToLobby' return type */
export type IAddPlayerToLobbyResult = void;

/** 'AddPlayerToLobby' query type */
export interface IAddPlayerToLobbyQuery {
  params: IAddPlayerToLobbyParams;
  result: IAddPlayerToLobbyResult;
}

const addPlayerToLobbyIR: any = {"usedParamSet":{"lobby_id":true,"player_wallet":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":58,"b":67}]},{"name":"player_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":70,"b":84}]}],"statement":"INSERT INTO lobby_player(lobby_id, player_wallet)\nVALUES (:lobby_id!, :player_wallet!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO lobby_player(lobby_id, player_wallet)
 * VALUES (:lobby_id!, :player_wallet!)
 * ```
 */
export const addPlayerToLobby = new PreparedQuery<IAddPlayerToLobbyParams,IAddPlayerToLobbyResult>(addPlayerToLobbyIR);


/** 'CreateRound' parameters type */
export interface ICreateRoundParams {
  block_height: number;
  lobby_id: string;
  move: string;
  round: number;
  seed?: string | null | void;
  wallet: string;
}

/** 'CreateRound' return type */
export type ICreateRoundResult = void;

/** 'CreateRound' query type */
export interface ICreateRoundQuery {
  params: ICreateRoundParams;
  result: ICreateRoundResult;
}

const createRoundIR: any = {"usedParamSet":{"lobby_id":true,"wallet":true,"move":true,"round":true,"block_height":true,"seed":true},"params":[{"name":"lobby_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":77,"b":86}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":89,"b":96}]},{"name":"move","required":true,"transform":{"type":"scalar"},"locs":[{"a":99,"b":104}]},{"name":"round","required":true,"transform":{"type":"scalar"},"locs":[{"a":107,"b":113}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":116,"b":129}]},{"name":"seed","required":false,"transform":{"type":"scalar"},"locs":[{"a":132,"b":136}]}],"statement":"INSERT INTO round(lobby_id, wallet, move, round, block_height, seed)\nVALUES (:lobby_id!, :wallet!, :move!, :round!, :block_height!, :seed)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO round(lobby_id, wallet, move, round, block_height, seed)
 * VALUES (:lobby_id!, :wallet!, :move!, :round!, :block_height!, :seed)
 * ```
 */
export const createRound = new PreparedQuery<ICreateRoundParams,ICreateRoundResult>(createRoundIR);


/** 'CreatePlayer' parameters type */
export interface ICreatePlayerParams {
  block_height: number;
  wallet: string;
}

/** 'CreatePlayer' return type */
export type ICreatePlayerResult = void;

/** 'CreatePlayer' query type */
export interface ICreatePlayerQuery {
  params: ICreatePlayerParams;
  result: ICreatePlayerResult;
}

const createPlayerIR: any = {"usedParamSet":{"wallet":true,"block_height":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":54,"b":61}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":77}]}],"statement":"INSERT INTO player(wallet, last_block_height)\nVALUES (:wallet!, :block_height!)\nON CONFLICT (wallet) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO player(wallet, last_block_height)
 * VALUES (:wallet!, :block_height!)
 * ON CONFLICT (wallet) DO NOTHING
 * ```
 */
export const createPlayer = new PreparedQuery<ICreatePlayerParams,ICreatePlayerResult>(createPlayerIR);



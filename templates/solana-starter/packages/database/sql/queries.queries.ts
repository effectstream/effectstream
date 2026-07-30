/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type NumberOrString = number | string;

/** 'UpsertCounterState' parameters type */
export interface IUpsertCounterStateParams {
  authority: string;
  block_height: number;
  slot: NumberOrString;
  value: NumberOrString;
}

/** 'UpsertCounterState' return type */
export interface IUpsertCounterStateResult {
  authority: string;
  block_height: number;
  slot: string;
  value: string;
}

/** 'UpsertCounterState' query type */
export interface IUpsertCounterStateQuery {
  params: IUpsertCounterStateParams;
  result: IUpsertCounterStateResult;
}

const upsertCounterStateIR: any = {"usedParamSet":{"authority":true,"value":true,"slot":true,"block_height":true},"params":[{"name":"authority","required":true,"transform":{"type":"scalar"},"locs":[{"a":85,"b":95}]},{"name":"value","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":104}]},{"name":"slot","required":true,"transform":{"type":"scalar"},"locs":[{"a":107,"b":112}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":115,"b":128}]}],"statement":"INSERT INTO counter_state (authority, value, slot, block_height, updated_at)\nVALUES (:authority!, :value!, :slot!, :block_height!, NOW())\nON CONFLICT (authority) DO UPDATE\n  SET value = EXCLUDED.value,\n      slot = EXCLUDED.slot,\n      block_height = EXCLUDED.block_height,\n      updated_at = NOW()\nRETURNING authority, value, slot, block_height"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO counter_state (authority, value, slot, block_height, updated_at)
 * VALUES (:authority!, :value!, :slot!, :block_height!, NOW())
 * ON CONFLICT (authority) DO UPDATE
 *   SET value = EXCLUDED.value,
 *       slot = EXCLUDED.slot,
 *       block_height = EXCLUDED.block_height,
 *       updated_at = NOW()
 * RETURNING authority, value, slot, block_height
 * ```
 */
export const upsertCounterState = new PreparedQuery<IUpsertCounterStateParams,IUpsertCounterStateResult>(upsertCounterStateIR);


/** 'InsertCounterEvent' parameters type */
export interface IInsertCounterEventParams {
  authority: string;
  block_height: number;
  delta: NumberOrString;
  kind: string;
  slot: NumberOrString;
  value: NumberOrString;
}

/** 'InsertCounterEvent' return type */
export type IInsertCounterEventResult = void;

/** 'InsertCounterEvent' query type */
export interface IInsertCounterEventQuery {
  params: IInsertCounterEventParams;
  result: IInsertCounterEventResult;
}

const insertCounterEventIR: any = {"usedParamSet":{"authority":true,"value":true,"slot":true,"block_height":true,"kind":true,"delta":true},"params":[{"name":"authority","required":true,"transform":{"type":"scalar"},"locs":[{"a":87,"b":97}]},{"name":"value","required":true,"transform":{"type":"scalar"},"locs":[{"a":100,"b":106}]},{"name":"slot","required":true,"transform":{"type":"scalar"},"locs":[{"a":109,"b":114}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":117,"b":130}]},{"name":"kind","required":true,"transform":{"type":"scalar"},"locs":[{"a":133,"b":138}]},{"name":"delta","required":true,"transform":{"type":"scalar"},"locs":[{"a":141,"b":147}]}],"statement":"INSERT INTO counter_events (authority, value, slot, block_height, kind, delta)\nVALUES (:authority!, :value!, :slot!, :block_height!, :kind!, :delta!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO counter_events (authority, value, slot, block_height, kind, delta)
 * VALUES (:authority!, :value!, :slot!, :block_height!, :kind!, :delta!)
 * ```
 */
export const insertCounterEvent = new PreparedQuery<IInsertCounterEventParams,IInsertCounterEventResult>(insertCounterEventIR);


/** 'GetCounterByAuthority' parameters type */
export interface IGetCounterByAuthorityParams {
  authority: string;
}

/** 'GetCounterByAuthority' return type */
export interface IGetCounterByAuthorityResult {
  authority: string;
  block_height: number;
  slot: string;
  updated_at: Date;
  value: string;
}

/** 'GetCounterByAuthority' query type */
export interface IGetCounterByAuthorityQuery {
  params: IGetCounterByAuthorityParams;
  result: IGetCounterByAuthorityResult;
}

const getCounterByAuthorityIR: any = {"usedParamSet":{"authority":true},"params":[{"name":"authority","required":true,"transform":{"type":"scalar"},"locs":[{"a":93,"b":103}]}],"statement":"SELECT authority, value, slot, block_height, updated_at\nFROM counter_state\nWHERE authority = :authority!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT authority, value, slot, block_height, updated_at
 * FROM counter_state
 * WHERE authority = :authority!
 * ```
 */
export const getCounterByAuthority = new PreparedQuery<IGetCounterByAuthorityParams,IGetCounterByAuthorityResult>(getCounterByAuthorityIR);


/** 'GetAllCounters' parameters type */
export type IGetAllCountersParams = void;

/** 'GetAllCounters' return type */
export interface IGetAllCountersResult {
  authority: string;
  block_height: number;
  slot: string;
  updated_at: Date;
  value: string;
}

/** 'GetAllCounters' query type */
export interface IGetAllCountersQuery {
  params: IGetAllCountersParams;
  result: IGetAllCountersResult;
}

const getAllCountersIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT authority, value, slot, block_height, updated_at\nFROM counter_state\nORDER BY value DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT authority, value, slot, block_height, updated_at
 * FROM counter_state
 * ORDER BY value DESC
 * ```
 */
export const getAllCounters = new PreparedQuery<IGetAllCountersParams,IGetAllCountersResult>(getAllCountersIR);


/** 'GetRecentEvents' parameters type */
export interface IGetRecentEventsParams {
  limit?: NumberOrString | null | void;
}

/** 'GetRecentEvents' return type */
export interface IGetRecentEventsResult {
  authority: string;
  block_height: number;
  delta: string;
  emitted_at: Date;
  id: number;
  kind: string;
  slot: string;
  value: string;
}

/** 'GetRecentEvents' query type */
export interface IGetRecentEventsQuery {
  params: IGetRecentEventsParams;
  result: IGetRecentEventsResult;
}

const getRecentEventsIR: any = {"usedParamSet":{"limit":true},"params":[{"name":"limit","required":false,"transform":{"type":"scalar"},"locs":[{"a":116,"b":121}]}],"statement":"SELECT id, authority, value, slot, block_height, kind, delta, emitted_at\nFROM counter_events\nORDER BY id DESC\nLIMIT :limit"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, authority, value, slot, block_height, kind, delta, emitted_at
 * FROM counter_events
 * ORDER BY id DESC
 * LIMIT :limit
 * ```
 */
export const getRecentEvents = new PreparedQuery<IGetRecentEventsParams,IGetRecentEventsResult>(getRecentEventsIR);



/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type NumberOrString = number | string;

/** 'InsertEvent' parameters type */
export interface IInsertEventParams {
  amount?: string | null | void;
  block_height: number;
  chain: string;
  event_type: string;
  from_address?: string | null | void;
  to_address?: string | null | void;
  tx_hash: string;
}

/** 'InsertEvent' return type */
export interface IInsertEventResult {
  amount: string | null;
  block_height: number;
  chain: string;
  created_at: Date | null;
  event_type: string;
  from_address: string | null;
  id: number;
  to_address: string | null;
  tx_hash: string;
}

/** 'InsertEvent' query type */
export interface IInsertEventQuery {
  params: IInsertEventParams;
  result: IInsertEventResult;
}

const insertEventIR: any = {"usedParamSet":{"chain":true,"event_type":true,"from_address":true,"to_address":true,"amount":true,"tx_hash":true,"block_height":true},"params":[{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":110}]},{"name":"event_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":113,"b":124}]},{"name":"from_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":127,"b":139}]},{"name":"to_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":142,"b":152}]},{"name":"amount","required":false,"transform":{"type":"scalar"},"locs":[{"a":155,"b":161}]},{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":164,"b":172}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":175,"b":188}]}],"statement":"INSERT INTO events (chain, event_type, from_address, to_address, amount, tx_hash, block_height)\nVALUES (:chain!, :event_type!, :from_address, :to_address, :amount, :tx_hash!, :block_height!)\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO events (chain, event_type, from_address, to_address, amount, tx_hash, block_height)
 * VALUES (:chain!, :event_type!, :from_address, :to_address, :amount, :tx_hash!, :block_height!)
 * RETURNING *
 * ```
 */
export const insertEvent = new PreparedQuery<IInsertEventParams,IInsertEventResult>(insertEventIR);


/** 'GetEvents' parameters type */
export interface IGetEventsParams {
  limit?: NumberOrString | null | void;
  offset?: NumberOrString | null | void;
}

/** 'GetEvents' return type */
export interface IGetEventsResult {
  amount: string | null;
  block_height: number;
  chain: string;
  created_at: Date | null;
  event_type: string;
  from_address: string | null;
  id: number;
  to_address: string | null;
  tx_hash: string;
}

/** 'GetEvents' query type */
export interface IGetEventsQuery {
  params: IGetEventsParams;
  result: IGetEventsResult;
}

const getEventsIR: any = {"usedParamSet":{"limit":true,"offset":true},"params":[{"name":"limit","required":false,"transform":{"type":"scalar"},"locs":[{"a":44,"b":49}]},{"name":"offset","required":false,"transform":{"type":"scalar"},"locs":[{"a":58,"b":64}]}],"statement":"SELECT * FROM events ORDER BY id DESC LIMIT :limit OFFSET :offset"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM events ORDER BY id DESC LIMIT :limit OFFSET :offset
 * ```
 */
export const getEvents = new PreparedQuery<IGetEventsParams,IGetEventsResult>(getEventsIR);


/** 'GetEventsByChain' parameters type */
export interface IGetEventsByChainParams {
  chain: string;
  limit?: NumberOrString | null | void;
  offset?: NumberOrString | null | void;
}

/** 'GetEventsByChain' return type */
export interface IGetEventsByChainResult {
  amount: string | null;
  block_height: number;
  chain: string;
  created_at: Date | null;
  event_type: string;
  from_address: string | null;
  id: number;
  to_address: string | null;
  tx_hash: string;
}

/** 'GetEventsByChain' query type */
export interface IGetEventsByChainQuery {
  params: IGetEventsByChainParams;
  result: IGetEventsByChainResult;
}

const getEventsByChainIR: any = {"usedParamSet":{"chain":true,"limit":true,"offset":true},"params":[{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":35,"b":41}]},{"name":"limit","required":false,"transform":{"type":"scalar"},"locs":[{"a":66,"b":71}]},{"name":"offset","required":false,"transform":{"type":"scalar"},"locs":[{"a":80,"b":86}]}],"statement":"SELECT * FROM events WHERE chain = :chain! ORDER BY id DESC LIMIT :limit OFFSET :offset"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM events WHERE chain = :chain! ORDER BY id DESC LIMIT :limit OFFSET :offset
 * ```
 */
export const getEventsByChain = new PreparedQuery<IGetEventsByChainParams,IGetEventsByChainResult>(getEventsByChainIR);


/** 'GetChainStats' parameters type */
export type IGetChainStatsParams = void;

/** 'GetChainStats' return type */
export interface IGetChainStatsResult {
  chain: string;
  latest_block: number;
  total_events: number;
}

/** 'GetChainStats' query type */
export interface IGetChainStatsQuery {
  params: IGetChainStatsParams;
  result: IGetChainStatsResult;
}

const getChainStatsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM chain_stats ORDER BY chain"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM chain_stats ORDER BY chain
 * ```
 */
export const getChainStats = new PreparedQuery<IGetChainStatsParams,IGetChainStatsResult>(getChainStatsIR);


/** 'UpdateChainStats' parameters type */
export interface IUpdateChainStatsParams {
  block_height: number;
  chain: string;
}

/** 'UpdateChainStats' return type */
export type IUpdateChainStatsResult = void;

/** 'UpdateChainStats' query type */
export interface IUpdateChainStatsQuery {
  params: IUpdateChainStatsParams;
  result: IUpdateChainStatsResult;
}

const updateChainStatsIR: any = {"usedParamSet":{"block_height":true,"chain":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":74}]},{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":128,"b":134}]}],"statement":"UPDATE chain_stats\nSET latest_block = GREATEST(latest_block, :block_height!),\n    total_events = total_events + 1\nWHERE chain = :chain!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE chain_stats
 * SET latest_block = GREATEST(latest_block, :block_height!),
 *     total_events = total_events + 1
 * WHERE chain = :chain!
 * ```
 */
export const updateChainStats = new PreparedQuery<IUpdateChainStatsParams,IUpdateChainStatsResult>(updateChainStatsIR);



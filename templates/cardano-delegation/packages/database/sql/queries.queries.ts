/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type NumberOrString = number | string;

/** 'InsertDelegation' parameters type */
export interface IInsertDelegationParams {
  address: string;
  block_height: number;
  epoch: string;
  pool: string;
  tx_hash?: string | null | void;
}

/** 'InsertDelegation' return type */
export interface IInsertDelegationResult {
  address: string;
  block_height: number;
  created_at: Date | null;
  epoch: string;
  id: number;
  pool: string;
  tx_hash: string | null;
}

/** 'InsertDelegation' query type */
export interface IInsertDelegationQuery {
  params: IInsertDelegationParams;
  result: IInsertDelegationResult;
}

const insertDelegationIR: any = {"usedParamSet":{"block_height":true,"address":true,"pool":true,"epoch":true,"tx_hash":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":91}]},{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":94,"b":102}]},{"name":"pool","required":true,"transform":{"type":"scalar"},"locs":[{"a":105,"b":110}]},{"name":"epoch","required":true,"transform":{"type":"scalar"},"locs":[{"a":113,"b":119}]},{"name":"tx_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":122,"b":129}]}],"statement":"INSERT INTO delegations (block_height, address, pool, epoch, tx_hash)\nVALUES (:block_height!, :address!, :pool!, :epoch!, :tx_hash)\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO delegations (block_height, address, pool, epoch, tx_hash)
 * VALUES (:block_height!, :address!, :pool!, :epoch!, :tx_hash)
 * RETURNING *
 * ```
 */
export const insertDelegation = new PreparedQuery<IInsertDelegationParams,IInsertDelegationResult>(insertDelegationIR);


/** 'GetDelegations' parameters type */
export interface IGetDelegationsParams {
  limit?: NumberOrString | null | void;
  offset?: NumberOrString | null | void;
}

/** 'GetDelegations' return type */
export interface IGetDelegationsResult {
  address: string;
  block_height: number;
  created_at: Date | null;
  epoch: string;
  id: number;
  pool: string;
  tx_hash: string | null;
}

/** 'GetDelegations' query type */
export interface IGetDelegationsQuery {
  params: IGetDelegationsParams;
  result: IGetDelegationsResult;
}

const getDelegationsIR: any = {"usedParamSet":{"limit":true,"offset":true},"params":[{"name":"limit","required":false,"transform":{"type":"scalar"},"locs":[{"a":49,"b":54}]},{"name":"offset","required":false,"transform":{"type":"scalar"},"locs":[{"a":63,"b":69}]}],"statement":"SELECT * FROM delegations ORDER BY id DESC LIMIT :limit OFFSET :offset"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM delegations ORDER BY id DESC LIMIT :limit OFFSET :offset
 * ```
 */
export const getDelegations = new PreparedQuery<IGetDelegationsParams,IGetDelegationsResult>(getDelegationsIR);


/** 'GetDelegationsByPool' parameters type */
export interface IGetDelegationsByPoolParams {
  limit?: NumberOrString | null | void;
  offset?: NumberOrString | null | void;
  pool: string;
}

/** 'GetDelegationsByPool' return type */
export interface IGetDelegationsByPoolResult {
  address: string;
  block_height: number;
  created_at: Date | null;
  epoch: string;
  id: number;
  pool: string;
  tx_hash: string | null;
}

/** 'GetDelegationsByPool' query type */
export interface IGetDelegationsByPoolQuery {
  params: IGetDelegationsByPoolParams;
  result: IGetDelegationsByPoolResult;
}

const getDelegationsByPoolIR: any = {"usedParamSet":{"pool":true,"limit":true,"offset":true},"params":[{"name":"pool","required":true,"transform":{"type":"scalar"},"locs":[{"a":39,"b":44}]},{"name":"limit","required":false,"transform":{"type":"scalar"},"locs":[{"a":69,"b":74}]},{"name":"offset","required":false,"transform":{"type":"scalar"},"locs":[{"a":83,"b":89}]}],"statement":"SELECT * FROM delegations WHERE pool = :pool! ORDER BY id DESC LIMIT :limit OFFSET :offset"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM delegations WHERE pool = :pool! ORDER BY id DESC LIMIT :limit OFFSET :offset
 * ```
 */
export const getDelegationsByPool = new PreparedQuery<IGetDelegationsByPoolParams,IGetDelegationsByPoolResult>(getDelegationsByPoolIR);


/** 'GetDelegationsByAddress' parameters type */
export interface IGetDelegationsByAddressParams {
  address: string;
}

/** 'GetDelegationsByAddress' return type */
export interface IGetDelegationsByAddressResult {
  address: string;
  block_height: number;
  created_at: Date | null;
  epoch: string;
  id: number;
  pool: string;
  tx_hash: string | null;
}

/** 'GetDelegationsByAddress' query type */
export interface IGetDelegationsByAddressQuery {
  params: IGetDelegationsByAddressParams;
  result: IGetDelegationsByAddressResult;
}

const getDelegationsByAddressIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":42,"b":50}]}],"statement":"SELECT * FROM delegations WHERE address = :address! ORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM delegations WHERE address = :address! ORDER BY id DESC
 * ```
 */
export const getDelegationsByAddress = new PreparedQuery<IGetDelegationsByAddressParams,IGetDelegationsByAddressResult>(getDelegationsByAddressIR);


/** 'GetPoolStats' parameters type */
export type IGetPoolStatsParams = void;

/** 'GetPoolStats' return type */
export interface IGetPoolStatsResult {
  latest_block: number;
  latest_epoch: string;
  pool: string;
  total_delegators: number;
}

/** 'GetPoolStats' query type */
export interface IGetPoolStatsQuery {
  params: IGetPoolStatsParams;
  result: IGetPoolStatsResult;
}

const getPoolStatsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM pool_stats ORDER BY pool"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM pool_stats ORDER BY pool
 * ```
 */
export const getPoolStats = new PreparedQuery<IGetPoolStatsParams,IGetPoolStatsResult>(getPoolStatsIR);


/** 'GetBlockHeights' parameters type */
export type IGetBlockHeightsParams = void;

/** 'GetBlockHeights' return type */
export interface IGetBlockHeightsResult {
  protocol_name: string;
  synced_page: number | null;
}

/** 'GetBlockHeights' query type */
export interface IGetBlockHeightsQuery {
  params: IGetBlockHeightsParams;
  result: IGetBlockHeightsResult;
}

const getBlockHeightsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT protocol_name, MAX(page_number) AS synced_page\nFROM effectstream.sync_protocol_pagination\nGROUP BY protocol_name\nORDER BY protocol_name"};

/**
 * Query generated from SQL:
 * ```
 * SELECT protocol_name, MAX(page_number) AS synced_page
 * FROM effectstream.sync_protocol_pagination
 * GROUP BY protocol_name
 * ORDER BY protocol_name
 * ```
 */
export const getBlockHeights = new PreparedQuery<IGetBlockHeightsParams,IGetBlockHeightsResult>(getBlockHeightsIR);


/** 'GetSyncPagination' parameters type */
export interface IGetSyncPaginationParams {
  protocol_name: string;
}

/** 'GetSyncPagination' return type */
export interface IGetSyncPaginationResult {
  page: Json;
  page_number: number;
  protocol_name: string;
}

/** 'GetSyncPagination' query type */
export interface IGetSyncPaginationQuery {
  params: IGetSyncPaginationParams;
  result: IGetSyncPaginationResult;
}

const getSyncPaginationIR: any = {"usedParamSet":{"protocol_name":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":88}]}],"statement":"SELECT * FROM effectstream.sync_protocol_pagination\nWHERE protocol_name = :protocol_name!\nORDER BY page_number ASC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.sync_protocol_pagination
 * WHERE protocol_name = :protocol_name!
 * ORDER BY page_number ASC
 * LIMIT 1
 * ```
 */
export const getSyncPagination = new PreparedQuery<IGetSyncPaginationParams,IGetSyncPaginationResult>(getSyncPaginationIR);


/** 'UpdatePoolStats' parameters type */
export interface IUpdatePoolStatsParams {
  latest_block: number;
  latest_epoch: string;
  pool: string;
}

/** 'UpdatePoolStats' return type */
export type IUpdatePoolStatsResult = void;

/** 'UpdatePoolStats' query type */
export interface IUpdatePoolStatsQuery {
  params: IUpdatePoolStatsParams;
  result: IUpdatePoolStatsResult;
}

const updatePoolStatsIR: any = {"usedParamSet":{"pool":true,"latest_epoch":true,"latest_block":true},"params":[{"name":"pool","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":89},{"a":243,"b":248}]},{"name":"latest_epoch","required":true,"transform":{"type":"scalar"},"locs":[{"a":95,"b":108},{"a":303,"b":316}]},{"name":"latest_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":111,"b":124},{"a":371,"b":384}]}],"statement":"INSERT INTO pool_stats (pool, total_delegators, latest_epoch, latest_block)\nVALUES (:pool!, 1, :latest_epoch!, :latest_block!)\nON CONFLICT (pool) DO UPDATE SET\n  total_delegators = (SELECT COUNT(DISTINCT address) FROM delegations WHERE pool = :pool!),\n  latest_epoch = GREATEST(pool_stats.latest_epoch, :latest_epoch!),\n  latest_block = GREATEST(pool_stats.latest_block, :latest_block!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO pool_stats (pool, total_delegators, latest_epoch, latest_block)
 * VALUES (:pool!, 1, :latest_epoch!, :latest_block!)
 * ON CONFLICT (pool) DO UPDATE SET
 *   total_delegators = (SELECT COUNT(DISTINCT address) FROM delegations WHERE pool = :pool!),
 *   latest_epoch = GREATEST(pool_stats.latest_epoch, :latest_epoch!),
 *   latest_block = GREATEST(pool_stats.latest_block, :latest_block!)
 * ```
 */
export const updatePoolStats = new PreparedQuery<IUpdatePoolStatsParams,IUpdatePoolStatsResult>(updatePoolStatsIR);



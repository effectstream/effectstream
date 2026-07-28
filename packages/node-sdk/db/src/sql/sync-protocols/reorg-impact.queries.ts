/** Types generated for queries found in "src/sql/sync-protocols/reorg-impact.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'CountPrimitivesInRange' parameters type */
export interface ICountPrimitivesInRangeParams {
  from_height: number;
  to_height: number;
}

/** 'CountPrimitivesInRange' return type */
export interface ICountPrimitivesInRangeResult {
  count: number | null;
  primitive_name: string;
}

/** 'CountPrimitivesInRange' query type */
export interface ICountPrimitivesInRangeQuery {
  params: ICountPrimitivesInRangeParams;
  result: ICountPrimitivesInRangeResult;
}

const countPrimitivesInRangeIR: any = {"usedParamSet":{"from_height":true,"to_height":true},"params":[{"name":"from_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":120,"b":132}]},{"name":"to_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":179}]}],"statement":"SELECT primitive_name, COUNT(*)::int AS count\nFROM effectstream.primitive_accounting\nWHERE effectstream_block_height >= :from_height!\n  AND effectstream_block_height <= :to_height!\nGROUP BY primitive_name\nORDER BY primitive_name"};

/**
 * Query generated from SQL:
 * ```
 * SELECT primitive_name, COUNT(*)::int AS count
 * FROM effectstream.primitive_accounting
 * WHERE effectstream_block_height >= :from_height!
 *   AND effectstream_block_height <= :to_height!
 * GROUP BY primitive_name
 * ORDER BY primitive_name
 * ```
 */
export const countPrimitivesInRange = new PreparedQuery<ICountPrimitivesInRangeParams,ICountPrimitivesInRangeResult>(countPrimitivesInRangeIR);


/** 'CountInputResultsInRange' parameters type */
export interface ICountInputResultsInRangeParams {
  from_height: number;
  to_height: number;
}

/** 'CountInputResultsInRange' return type */
export interface ICountInputResultsInRangeResult {
  failed: number | null;
  succeeded: number | null;
  total: number | null;
}

/** 'CountInputResultsInRange' query type */
export interface ICountInputResultsInRangeQuery {
  params: ICountInputResultsInRangeParams;
  result: ICountInputResultsInRangeResult;
}

const countInputResultsInRangeIR: any = {"usedParamSet":{"from_height":true,"to_height":true},"params":[{"name":"from_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":199,"b":211}]},{"name":"to_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":235,"b":245}]}],"statement":"SELECT\n  COUNT(*)::int AS total,\n  COUNT(*) FILTER (WHERE success)::int AS succeeded,\n  COUNT(*) FILTER (WHERE NOT success)::int AS failed\nFROM effectstream.rollup_input_result\nWHERE block_height >= :from_height!\n  AND block_height <= :to_height!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   COUNT(*)::int AS total,
 *   COUNT(*) FILTER (WHERE success)::int AS succeeded,
 *   COUNT(*) FILTER (WHERE NOT success)::int AS failed
 * FROM effectstream.rollup_input_result
 * WHERE block_height >= :from_height!
 *   AND block_height <= :to_height!
 * ```
 */
export const countInputResultsInRange = new PreparedQuery<ICountInputResultsInRangeParams,ICountInputResultsInRangeResult>(countInputResultsInRangeIR);


/** 'CountAppEventsInRange' parameters type */
export interface ICountAppEventsInRangeParams {
  from_height: number;
  to_height: number;
}

/** 'CountAppEventsInRange' return type */
export interface ICountAppEventsInRangeResult {
  count: number | null;
}

/** 'CountAppEventsInRange' query type */
export interface ICountAppEventsInRangeQuery {
  params: ICountAppEventsInRangeParams;
  result: ICountAppEventsInRangeResult;
}

const countAppEventsInRangeIR: any = {"usedParamSet":{"from_height":true,"to_height":true},"params":[{"name":"from_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":76,"b":88}]},{"name":"to_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":122}]}],"statement":"SELECT COUNT(*)::int AS count\nFROM effectstream.event\nWHERE block_height >= :from_height!\n  AND block_height <= :to_height!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT COUNT(*)::int AS count
 * FROM effectstream.event
 * WHERE block_height >= :from_height!
 *   AND block_height <= :to_height!
 * ```
 */
export const countAppEventsInRange = new PreparedQuery<ICountAppEventsInRangeParams,ICountAppEventsInRangeResult>(countAppEventsInRangeIR);


/** 'CountNoncesInRange' parameters type */
export interface ICountNoncesInRangeParams {
  from_height: number;
  to_height: number;
}

/** 'CountNoncesInRange' return type */
export interface ICountNoncesInRangeResult {
  count: number | null;
}

/** 'CountNoncesInRange' query type */
export interface ICountNoncesInRangeQuery {
  params: ICountNoncesInRangeParams;
  result: ICountNoncesInRangeResult;
}

const countNoncesInRangeIR: any = {"usedParamSet":{"from_height":true,"to_height":true},"params":[{"name":"from_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":77,"b":89}]},{"name":"to_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":113,"b":123}]}],"statement":"SELECT COUNT(*)::int AS count\nFROM effectstream.nonces\nWHERE block_height >= :from_height!\n  AND block_height <= :to_height!                                                      "};

/**
 * Query generated from SQL:
 * ```
 * SELECT COUNT(*)::int AS count
 * FROM effectstream.nonces
 * WHERE block_height >= :from_height!
 *   AND block_height <= :to_height!                                                      
 * ```
 */
export const countNoncesInRange = new PreparedQuery<ICountNoncesInRangeParams,ICountNoncesInRangeResult>(countNoncesInRangeIR);


/** 'GetBlockRangeInfo' parameters type */
export interface IGetBlockRangeInfoParams {
  from_height: number;
  to_height: number;
}

/** 'GetBlockRangeInfo' return type */
export interface IGetBlockRangeInfoResult {
  block_count: number | null;
  max_height: number | null;
  min_height: number | null;
}

/** 'GetBlockRangeInfo' query type */
export interface IGetBlockRangeInfoQuery {
  params: IGetBlockRangeInfoParams;
  result: IGetBlockRangeInfoResult;
}

const getBlockRangeInfoIR: any = {"usedParamSet":{"from_height":true,"to_height":true},"params":[{"name":"from_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":178,"b":190}]},{"name":"to_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":214,"b":224}]}],"statement":"SELECT\n  MIN(block_height)::int AS min_height,\n  MAX(block_height)::int AS max_height,\n  COUNT(*)::int AS block_count\nFROM effectstream.effectstream_blocks\nWHERE block_height >= :from_height!\n  AND block_height <= :to_height!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   MIN(block_height)::int AS min_height,
 *   MAX(block_height)::int AS max_height,
 *   COUNT(*)::int AS block_count
 * FROM effectstream.effectstream_blocks
 * WHERE block_height >= :from_height!
 *   AND block_height <= :to_height!
 * ```
 */
export const getBlockRangeInfo = new PreparedQuery<IGetBlockRangeInfoParams,IGetBlockRangeInfoResult>(getBlockRangeInfoIR);



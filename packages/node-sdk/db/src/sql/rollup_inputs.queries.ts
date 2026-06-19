/** Types generated for queries found in "src/sql/rollup_inputs.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { Buffer } from 'node:buffer';

export type DateOrString = Date | string;

/** 'NewScheduledHeightData' parameters type */
export interface INewScheduledHeightDataParams {
  caip2?: string | null | void;
  from_address: string;
  from_address_type: number;
  future_block_height: number;
  input_data: string;
  origin_contract_address?: string | null | void;
  origin_tx_hash?: Buffer | null | void;
  primitive_name?: string | null | void;
}

/** 'NewScheduledHeightData' return type */
export type INewScheduledHeightDataResult = void;

/** 'NewScheduledHeightData' query type */
export interface INewScheduledHeightDataQuery {
  params: INewScheduledHeightDataParams;
  result: INewScheduledHeightDataResult;
}

const newScheduledHeightDataIR: any = {"usedParamSet":{"from_address":true,"from_address_type":true,"input_data":true,"primitive_name":true,"caip2":true,"origin_tx_hash":true,"origin_contract_address":true,"future_block_height":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":120,"b":133}]},{"name":"from_address_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":154}]},{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":157,"b":168}]},{"name":"primitive_name","required":false,"transform":{"type":"scalar"},"locs":[{"a":354,"b":368}]},{"name":"caip2","required":false,"transform":{"type":"scalar"},"locs":[{"a":371,"b":376}]},{"name":"origin_tx_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":379,"b":393}]},{"name":"origin_contract_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":403,"b":426}]},{"name":"future_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":541,"b":561}]}],"statement":"WITH\n  new_row AS (\n    INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)\n    VALUES (:from_address!, :from_address_type!, :input_data!)\n    RETURNING id\n  ),\n  insert_origin AS (\n    INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)\n    SELECT (SELECT id FROM new_row), :primitive_name, :caip2, :origin_tx_hash::BYTEA, :origin_contract_address\n  )\nINSERT INTO effectstream.rollup_input_future_block(id, future_block_height)\nSELECT (SELECT id FROM new_row), :future_block_height!"};

/**
 * Query generated from SQL:
 * ```
 * WITH
 *   new_row AS (
 *     INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)
 *     VALUES (:from_address!, :from_address_type!, :input_data!)
 *     RETURNING id
 *   ),
 *   insert_origin AS (
 *     INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
 *     SELECT (SELECT id FROM new_row), :primitive_name, :caip2, :origin_tx_hash::BYTEA, :origin_contract_address
 *   )
 * INSERT INTO effectstream.rollup_input_future_block(id, future_block_height)
 * SELECT (SELECT id FROM new_row), :future_block_height!
 * ```
 */
export const newScheduledHeightData = new PreparedQuery<INewScheduledHeightDataParams,INewScheduledHeightDataResult>(newScheduledHeightDataIR);


/** 'NewScheduledTimestampData' parameters type */
export interface INewScheduledTimestampDataParams {
  from_address: string;
  from_address_type: number;
  future_ms_timestamp: DateOrString;
  input_data: string;
}

/** 'NewScheduledTimestampData' return type */
export type INewScheduledTimestampDataResult = void;

/** 'NewScheduledTimestampData' query type */
export interface INewScheduledTimestampDataQuery {
  params: INewScheduledTimestampDataParams;
  result: INewScheduledTimestampDataResult;
}

const newScheduledTimestampDataIR: any = {"usedParamSet":{"from_address":true,"from_address_type":true,"input_data":true,"future_ms_timestamp":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":120,"b":133}]},{"name":"from_address_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":154}]},{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":157,"b":168}]},{"name":"future_ms_timestamp","required":true,"transform":{"type":"scalar"},"locs":[{"a":490,"b":510}]}],"statement":"WITH\n  new_row AS (\n    INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)\n    VALUES (:from_address!, :from_address_type!, :input_data!)\n    RETURNING id\n  ),\n  insert_origin AS (\n    INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)\n    SELECT (SELECT id FROM new_row),null,null,null,null\n  )\nINSERT INTO effectstream.rollup_input_future_timestamp(id, future_ms_timestamp)\nSELECT (SELECT id FROM new_row), :future_ms_timestamp!"};

/**
 * Query generated from SQL:
 * ```
 * WITH
 *   new_row AS (
 *     INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)
 *     VALUES (:from_address!, :from_address_type!, :input_data!)
 *     RETURNING id
 *   ),
 *   insert_origin AS (
 *     INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
 *     SELECT (SELECT id FROM new_row),null,null,null,null
 *   )
 * INSERT INTO effectstream.rollup_input_future_timestamp(id, future_ms_timestamp)
 * SELECT (SELECT id FROM new_row), :future_ms_timestamp!
 * ```
 */
export const newScheduledTimestampData = new PreparedQuery<INewScheduledTimestampDataParams,INewScheduledTimestampDataResult>(newScheduledTimestampDataIR);


/** 'NewGameInput' parameters type */
export interface INewGameInputParams {
  block_height: number;
  caip2: string;
  effectstream_tx_hash: Buffer;
  from_address: string;
  from_address_type: number;
  index_in_block: number;
  input_data: string;
  origin_contract_address?: string | null | void;
  origin_tx_hash: Buffer;
  primitive_name: string;
  success: boolean;
}

/** 'NewGameInput' return type */
export type INewGameInputResult = void;

/** 'NewGameInput' query type */
export interface INewGameInputQuery {
  params: INewGameInputParams;
  result: INewGameInputResult;
}

const newGameInputIR: any = {"usedParamSet":{"from_address":true,"from_address_type":true,"input_data":true,"primitive_name":true,"caip2":true,"origin_tx_hash":true,"origin_contract_address":true,"success":true,"effectstream_tx_hash":true,"index_in_block":true,"block_height":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":120,"b":133}]},{"name":"from_address_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":154}]},{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":157,"b":168}]},{"name":"primitive_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":354,"b":369}]},{"name":"caip2","required":true,"transform":{"type":"scalar"},"locs":[{"a":372,"b":378}]},{"name":"origin_tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":381,"b":396}]},{"name":"origin_contract_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":406,"b":429}]},{"name":"success","required":true,"transform":{"type":"scalar"},"locs":[{"a":578,"b":586}]},{"name":"effectstream_tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":589,"b":610}]},{"name":"index_in_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":620,"b":635}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":638,"b":651}]}],"statement":"WITH\n  new_row AS (\n    INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)\n    VALUES (:from_address!, :from_address_type!, :input_data!)\n    RETURNING id\n  ),\n  insert_origin AS (\n    INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)\n    SELECT (SELECT id FROM new_row), :primitive_name!, :caip2!, :origin_tx_hash!::BYTEA, :origin_contract_address\n  )\nINSERT INTO effectstream.rollup_input_result(id, success, effectstream_tx_hash, index_in_block, block_height)\nSELECT (SELECT id FROM new_row), :success!, :effectstream_tx_hash!::BYTEA, :index_in_block!, :block_height!"};

/**
 * Query generated from SQL:
 * ```
 * WITH
 *   new_row AS (
 *     INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)
 *     VALUES (:from_address!, :from_address_type!, :input_data!)
 *     RETURNING id
 *   ),
 *   insert_origin AS (
 *     INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
 *     SELECT (SELECT id FROM new_row), :primitive_name!, :caip2!, :origin_tx_hash!::BYTEA, :origin_contract_address
 *   )
 * INSERT INTO effectstream.rollup_input_result(id, success, effectstream_tx_hash, index_in_block, block_height)
 * SELECT (SELECT id FROM new_row), :success!, :effectstream_tx_hash!::BYTEA, :index_in_block!, :block_height!
 * ```
 */
export const newGameInput = new PreparedQuery<INewGameInputParams,INewGameInputResult>(newGameInputIR);


/** 'InsertGameInputResult' parameters type */
export interface IInsertGameInputResultParams {
  block_height: number;
  effectstream_tx_hash: Buffer;
  id: number;
  index_in_block: number;
  success: boolean;
}

/** 'InsertGameInputResult' return type */
export type IInsertGameInputResultResult = void;

/** 'InsertGameInputResult' query type */
export interface IInsertGameInputResultQuery {
  params: IInsertGameInputResultParams;
  result: IInsertGameInputResultResult;
}

const insertGameInputResultIR: any = {"usedParamSet":{"id":true,"success":true,"effectstream_tx_hash":true,"index_in_block":true,"block_height":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":118,"b":121}]},{"name":"success","required":true,"transform":{"type":"scalar"},"locs":[{"a":124,"b":132}]},{"name":"effectstream_tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":135,"b":156}]},{"name":"index_in_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":166,"b":181}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":184,"b":197}]}],"statement":"INSERT INTO effectstream.rollup_input_result(id, success, effectstream_tx_hash, index_in_block, block_height)\nVALUES (:id!, :success!, :effectstream_tx_hash!::BYTEA, :index_in_block!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO effectstream.rollup_input_result(id, success, effectstream_tx_hash, index_in_block, block_height)
 * VALUES (:id!, :success!, :effectstream_tx_hash!::BYTEA, :index_in_block!, :block_height!)
 * ```
 */
export const insertGameInputResult = new PreparedQuery<IInsertGameInputResultParams,IInsertGameInputResultResult>(insertGameInputResultIR);


/** 'GetAllScheduledData' parameters type */
export interface IGetAllScheduledDataParams {
  after_id?: number | null | void;
  limit?: number | null | void;
}

/** 'GetAllScheduledData' return type */
export interface IGetAllScheduledDataResult {
  caip2: string | null;
  contract_address: string | null;
  from_address: string | null;
  from_address_type: number | null;
  future_block_height: number | null;
  future_ms_timestamp: Date | null;
  id: number | null;
  input_data: string | null;
  origin_tx_hash: Buffer | null;
  primitive_name: string | null;
}

/** 'GetAllScheduledData' query type */
export interface IGetAllScheduledDataQuery {
  params: IGetAllScheduledDataParams;
  result: IGetAllScheduledDataResult;
}

const getAllScheduledDataIR: any = {"usedParamSet":{"after_id":true,"limit":true},"params":[{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":817,"b":826},{"a":1724,"b":1733}]},{"name":"limit","required":false,"transform":{"type":"scalar"},"locs":[{"a":1835,"b":1841}]}],"statement":"(\nSELECT\n  rollup_inputs.id,\n  NULL AS future_ms_timestamp,\n  rollup_input_future_block.future_block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_inputs.from_address_type,\n  rollup_input_origin.primitive_name,\n  rollup_input_origin.contract_address,\n  rollup_input_origin.caip2,\n  rollup_input_origin.tx_hash as \"origin_tx_hash\"\nFROM effectstream.rollup_inputs\nJOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id\nJOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id\nLEFT OUTER JOIN effectstream.rollup_input_result\n  ON effectstream.rollup_input_result.id = effectstream.rollup_inputs.id\nWHERE effectstream.rollup_input_result.id IS NULL AND\n rollup_inputs.id > :after_id::INT\nORDER BY rollup_inputs.id ASC\n)\n\tUNION ALL \n(\nSELECT\n  rollup_inputs.id,\n  rollup_input_future_timestamp.future_ms_timestamp,\n  NULL AS \"future_block_height\",\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_inputs.from_address_type,\n  rollup_input_origin.primitive_name,\n  rollup_input_origin.contract_address,\n  rollup_input_origin.caip2,\n  rollup_input_origin.tx_hash as \"origin_tx_hash\"\nFROM effectstream.rollup_inputs\nJOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id\nJOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id\nLEFT OUTER JOIN effectstream.rollup_input_result\n  ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)\nWHERE \n effectstream.rollup_input_result.id IS NULL AND\n effectstream.rollup_inputs.id > :after_id::INT\nORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC\n)\nORDER BY id ASC\nLIMIT COALESCE(:limit, 999999)"};

/**
 * Query generated from SQL:
 * ```
 * (
 * SELECT
 *   rollup_inputs.id,
 *   NULL AS future_ms_timestamp,
 *   rollup_input_future_block.future_block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_inputs.from_address_type,
 *   rollup_input_origin.primitive_name,
 *   rollup_input_origin.contract_address,
 *   rollup_input_origin.caip2,
 *   rollup_input_origin.tx_hash as "origin_tx_hash"
 * FROM effectstream.rollup_inputs
 * JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
 * JOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id
 * WHERE rollup_inputs.id > :after_id::INT
 * ORDER BY rollup_inputs.id ASC
 * )
 * 	UNION ALL 
 * (
 * SELECT
 *   rollup_inputs.id,
 *   rollup_input_future_timestamp.future_ms_timestamp,
 *   NULL AS "future_block_height",
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_inputs.from_address_type,
 *   rollup_input_origin.primitive_name,
 *   rollup_input_origin.contract_address,
 *   rollup_input_origin.caip2,
 *   rollup_input_origin.tx_hash as "origin_tx_hash"
 * FROM effectstream.rollup_inputs
 * JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
 * JOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id
 * LEFT OUTER JOIN effectstream.rollup_input_result
 *   ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)
 * WHERE 
 *  effectstream.rollup_input_result.id IS NULL AND
 *  effectstream.rollup_inputs.id > :after_id::INT
 * ORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC
 * )
 * ORDER BY id ASC
 * LIMIT COALESCE(:limit, 999999)
 * ```
 */
export const getAllScheduledData = new PreparedQuery<IGetAllScheduledDataParams,IGetAllScheduledDataResult>(getAllScheduledDataIR);


/** 'GetAllScheduledDataCount' parameters type */
export type IGetAllScheduledDataCountParams = void;

/** 'GetAllScheduledDataCount' return type */
export interface IGetAllScheduledDataCountResult {
  total: string | null;
}

/** 'GetAllScheduledDataCount' query type */
export interface IGetAllScheduledDataCountQuery {
  params: IGetAllScheduledDataCountParams;
  result: IGetAllScheduledDataCountResult;
}

const getAllScheduledDataCountIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT COUNT(*) as total FROM (\n  (\n  SELECT rollup_inputs.id\n  FROM effectstream.rollup_inputs\n  JOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id\n  LEFT OUTER JOIN effectstream.rollup_input_result\n    ON effectstream.rollup_input_result.id = effectstream.rollup_inputs.id\n  WHERE rollup_input_result.id IS NULL\n  )\n  UNION ALL\n  (\n  SELECT rollup_inputs.id\n  FROM effectstream.rollup_inputs\n  JOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id\n  LEFT OUTER JOIN effectstream.rollup_input_result\n    ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)\n  WHERE rollup_input_result.id IS NULL\n  )\n) AS scheduled_data"};

/**
 * Query generated from SQL:
 * ```
 * SELECT COUNT(*) as total FROM (
 *   (
 *   SELECT rollup_inputs.id
 *   FROM effectstream.rollup_inputs
 *   JOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id
 *   )
 *   UNION ALL 
 *   (
 *   SELECT rollup_inputs.id
 *   FROM effectstream.rollup_inputs
 *   JOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id
 *   LEFT OUTER JOIN effectstream.rollup_input_result
 *     ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)
 *   WHERE rollup_input_result.id IS NULL
 *   )
 * ) AS scheduled_data
 * ```
 */
export const getAllScheduledDataCount = new PreparedQuery<IGetAllScheduledDataCountParams,IGetAllScheduledDataCountResult>(getAllScheduledDataCountIR);


/** 'GetFutureGameInputByBlockHeight' parameters type */
export interface IGetFutureGameInputByBlockHeightParams {
  block_height: number;
}

/** 'GetFutureGameInputByBlockHeight' return type */
export interface IGetFutureGameInputByBlockHeightResult {
  caip2: string | null;
  contract_address: string | null;
  from_address: string;
  from_address_type: number;
  future_block_height: number;
  id: number;
  input_data: string;
  origin_tx_hash: Buffer | null;
  primitive_name: string | null;
}

/** 'GetFutureGameInputByBlockHeight' query type */
export interface IGetFutureGameInputByBlockHeightQuery {
  params: IGetFutureGameInputByBlockHeightParams;
  result: IGetFutureGameInputByBlockHeightResult;
}

const getFutureGameInputByBlockHeightIR: any = {"usedParamSet":{"block_height":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":642,"b":655}]}],"statement":"SELECT\n  rollup_inputs.id,\n  rollup_input_future_block.future_block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_inputs.from_address_type,\n  rollup_input_origin.primitive_name,\n  rollup_input_origin.contract_address,\n  rollup_input_origin.caip2,\n  rollup_input_origin.tx_hash as \"origin_tx_hash\"\nFROM effectstream.rollup_inputs\nJOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id\nJOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id\nWHERE rollup_input_future_block.future_block_height = :block_height!\nORDER BY rollup_inputs.id ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   rollup_input_future_block.future_block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_inputs.from_address_type,
 *   rollup_input_origin.primitive_name,
 *   rollup_input_origin.contract_address,
 *   rollup_input_origin.caip2,
 *   rollup_input_origin.tx_hash as "origin_tx_hash"
 * FROM effectstream.rollup_inputs
 * JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
 * JOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id
 * WHERE rollup_input_future_block.future_block_height = :block_height!
 * ORDER BY rollup_inputs.id ASC
 * ```
 */
export const getFutureGameInputByBlockHeight = new PreparedQuery<IGetFutureGameInputByBlockHeightParams,IGetFutureGameInputByBlockHeightResult>(getFutureGameInputByBlockHeightIR);


/** 'GetFutureGameInputByMaxTimestamp' parameters type */
export interface IGetFutureGameInputByMaxTimestampParams {
  max_timestamp: DateOrString;
}

/** 'GetFutureGameInputByMaxTimestamp' return type */
export interface IGetFutureGameInputByMaxTimestampResult {
  caip2: string | null;
  contract_address: string | null;
  from_address: string;
  from_address_type: number;
  future_ms_timestamp: Date;
  id: number;
  input_data: string;
  origin_tx_hash: Buffer | null;
  primitive_name: string | null;
}

/** 'GetFutureGameInputByMaxTimestamp' query type */
export interface IGetFutureGameInputByMaxTimestampQuery {
  params: IGetFutureGameInputByMaxTimestampParams;
  result: IGetFutureGameInputByMaxTimestampResult;
}

const getFutureGameInputByMaxTimestampIR: any = {"usedParamSet":{"max_timestamp":true},"params":[{"name":"max_timestamp","required":true,"transform":{"type":"scalar"},"locs":[{"a":783,"b":797}]}],"statement":"SELECT\n  rollup_inputs.id,\n  rollup_input_future_timestamp.future_ms_timestamp,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_inputs.from_address_type,\n  rollup_input_origin.primitive_name,\n  rollup_input_origin.contract_address,\n  rollup_input_origin.caip2,\n  rollup_input_origin.tx_hash as \"origin_tx_hash\"\nFROM effectstream.rollup_inputs\nJOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id\nJOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id\nLEFT OUTER JOIN effectstream.rollup_input_result\n  ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)\nWHERE rollup_input_future_timestamp.future_ms_timestamp <= :max_timestamp! AND\n     effectstream.rollup_input_result.id IS NULL\nORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   rollup_input_future_timestamp.future_ms_timestamp,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_inputs.from_address_type,
 *   rollup_input_origin.primitive_name,
 *   rollup_input_origin.contract_address,
 *   rollup_input_origin.caip2,
 *   rollup_input_origin.tx_hash as "origin_tx_hash"
 * FROM effectstream.rollup_inputs
 * JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
 * JOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id
 * LEFT OUTER JOIN effectstream.rollup_input_result
 *   ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)
 * WHERE rollup_input_future_timestamp.future_ms_timestamp <= :max_timestamp! AND
 *      effectstream.rollup_input_result.id IS NULL
 * ORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC
 * ```
 */
export const getFutureGameInputByMaxTimestamp = new PreparedQuery<IGetFutureGameInputByMaxTimestampParams,IGetFutureGameInputByMaxTimestampResult>(getFutureGameInputByMaxTimestampIR);


/** 'GetEarliestScheduledBlockHeight' parameters type */
export type IGetEarliestScheduledBlockHeightParams = void;

/** 'GetEarliestScheduledBlockHeight' return type */
export interface IGetEarliestScheduledBlockHeightResult {
  min_block_height: number | null;
}

/** 'GetEarliestScheduledBlockHeight' query type */
export interface IGetEarliestScheduledBlockHeightQuery {
  params: IGetEarliestScheduledBlockHeightParams;
  result: IGetEarliestScheduledBlockHeightResult;
}

const getEarliestScheduledBlockHeightIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT MIN(rollup_input_future_block.future_block_height) AS min_block_height\nFROM effectstream.rollup_input_future_block\nLEFT OUTER JOIN effectstream.rollup_input_result\n  ON rollup_input_result.id = rollup_input_future_block.id\nWHERE rollup_input_result.id IS NULL"};

/**
 * Query generated from SQL:
 * ```
 * SELECT MIN(rollup_input_future_block.future_block_height) AS min_block_height
 * FROM effectstream.rollup_input_future_block
 * LEFT OUTER JOIN effectstream.rollup_input_result
 *   ON rollup_input_result.id = rollup_input_future_block.id
 * WHERE rollup_input_result.id IS NULL
 * ```
 */
export const getEarliestScheduledBlockHeight = new PreparedQuery<IGetEarliestScheduledBlockHeightParams,IGetEarliestScheduledBlockHeightResult>(getEarliestScheduledBlockHeightIR);


/** 'GetEarliestScheduledTimestamp' parameters type */
export type IGetEarliestScheduledTimestampParams = void;

/** 'GetEarliestScheduledTimestamp' return type */
export interface IGetEarliestScheduledTimestampResult {
  min_timestamp: Date | null;
}

/** 'GetEarliestScheduledTimestamp' query type */
export interface IGetEarliestScheduledTimestampQuery {
  params: IGetEarliestScheduledTimestampParams;
  result: IGetEarliestScheduledTimestampResult;
}

const getEarliestScheduledTimestampIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT MIN(rollup_input_future_timestamp.future_ms_timestamp) AS min_timestamp\nFROM effectstream.rollup_input_future_timestamp\nLEFT OUTER JOIN effectstream.rollup_input_result\n  ON (effectstream.rollup_input_result.id = effectstream.rollup_input_future_timestamp.id)\nWHERE effectstream.rollup_input_result.id IS NULL"};

/**
 * Query generated from SQL:
 * ```
 * SELECT MIN(rollup_input_future_timestamp.future_ms_timestamp) AS min_timestamp
 * FROM effectstream.rollup_input_future_timestamp
 * LEFT OUTER JOIN effectstream.rollup_input_result
 *   ON (effectstream.rollup_input_result.id = effectstream.rollup_input_future_timestamp.id)
 * WHERE effectstream.rollup_input_result.id IS NULL
 * ```
 */
export const getEarliestScheduledTimestamp = new PreparedQuery<IGetEarliestScheduledTimestampParams,IGetEarliestScheduledTimestampResult>(getEarliestScheduledTimestampIR);


/** 'GetGameInputResultByBlockHeight' parameters type */
export interface IGetGameInputResultByBlockHeightParams {
  block_height: number;
}

/** 'GetGameInputResultByBlockHeight' return type */
export interface IGetGameInputResultByBlockHeightResult {
  block_height: number;
  contract_address: string | null;
  effectstream_block_hash: Buffer | null;
  effectstream_tx_hash: Buffer;
  from_address: string;
  from_address_type: number;
  id: number;
  index_in_block: number;
  input_data: string;
  success: boolean;
}

/** 'GetGameInputResultByBlockHeight' query type */
export interface IGetGameInputResultByBlockHeightQuery {
  params: IGetGameInputResultByBlockHeightParams;
  result: IGetGameInputResultByBlockHeightResult;
}

const getGameInputResultByBlockHeightIR: any = {"usedParamSet":{"block_height":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":781,"b":794}]}],"statement":"SELECT\n  rollup_inputs.id,\n  effectstream_blocks.block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_inputs.from_address_type,\n  effectstream_blocks.effectstream_block_hash,\n  rollup_input_origin.contract_address,\n  rollup_input_result.effectstream_tx_hash,\n  rollup_input_result.index_in_block,\n  rollup_input_result.success\nFROM effectstream.rollup_inputs\nJOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id\nJOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id\nJOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height\nWHERE effectstream_blocks.block_height = :block_height!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   effectstream_blocks.block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_inputs.from_address_type,
 *   effectstream_blocks.effectstream_block_hash,
 *   rollup_input_origin.contract_address,
 *   rollup_input_result.effectstream_tx_hash,
 *   rollup_input_result.index_in_block,
 *   rollup_input_result.success
 * FROM effectstream.rollup_inputs
 * JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
 * JOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id
 * JOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height
 * WHERE effectstream_blocks.block_height = :block_height!
 * ```
 */
export const getGameInputResultByBlockHeight = new PreparedQuery<IGetGameInputResultByBlockHeightParams,IGetGameInputResultByBlockHeightResult>(getGameInputResultByBlockHeightIR);


/** 'GetGameInputResultByTxHash' parameters type */
export interface IGetGameInputResultByTxHashParams {
  tx_hash: Buffer;
}

/** 'GetGameInputResultByTxHash' return type */
export interface IGetGameInputResultByTxHashResult {
  block_height: number;
  effectstream_block_hash: Buffer | null;
  effectstream_tx_hash: Buffer;
  from_address: string;
  from_address_type: number;
  id: number;
  index_in_block: number;
  input_data: string;
  success: boolean;
}

/** 'GetGameInputResultByTxHash' query type */
export interface IGetGameInputResultByTxHashQuery {
  params: IGetGameInputResultByTxHashParams;
  result: IGetGameInputResultByTxHashResult;
}

const getGameInputResultByTxHashIR: any = {"usedParamSet":{"tx_hash":true},"params":[{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":640,"b":648}]}],"statement":"SELECT\n  rollup_inputs.id,\n  effectstream_blocks.block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_inputs.from_address_type,\n  effectstream_blocks.effectstream_block_hash,\n  rollup_input_result.effectstream_tx_hash,\n  rollup_input_result.index_in_block,\n  rollup_input_result.success\nFROM effectstream.rollup_inputs\nJOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id\nJOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height\nWHERE rollup_input_result.effectstream_tx_hash = :tx_hash!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   effectstream_blocks.block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_inputs.from_address_type,
 *   effectstream_blocks.effectstream_block_hash,
 *   rollup_input_result.effectstream_tx_hash,
 *   rollup_input_result.index_in_block,
 *   rollup_input_result.success
 * FROM effectstream.rollup_inputs
 * JOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id
 * JOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height
 * WHERE rollup_input_result.effectstream_tx_hash = :tx_hash!
 * ```
 */
export const getGameInputResultByTxHash = new PreparedQuery<IGetGameInputResultByTxHashParams,IGetGameInputResultByTxHashResult>(getGameInputResultByTxHashIR);


/** 'GetGameInputResultByAddress' parameters type */
export interface IGetGameInputResultByAddressParams {
  block_height: number;
  from_address: string;
}

/** 'GetGameInputResultByAddress' return type */
export interface IGetGameInputResultByAddressResult {
  block_height: number;
  effectstream_block_hash: Buffer | null;
  effectstream_tx_hash: Buffer;
  from_address: string;
  from_address_type: number;
  id: number;
  index_in_block: number;
  input_data: string;
  success: boolean;
}

/** 'GetGameInputResultByAddress' query type */
export interface IGetGameInputResultByAddressQuery {
  params: IGetGameInputResultByAddressParams;
  result: IGetGameInputResultByAddressResult;
}

const getGameInputResultByAddressIR: any = {"usedParamSet":{"block_height":true,"from_address":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":634,"b":647}]},{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":738,"b":751}]}],"statement":"SELECT\n  rollup_inputs.id,\n  effectstream_blocks.block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_inputs.from_address_type,\n  effectstream_blocks.effectstream_block_hash,\n  rollup_input_result.effectstream_tx_hash,\n  rollup_input_result.index_in_block,\n  rollup_input_result.success\nFROM effectstream.rollup_inputs\nJOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id\nJOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height\nWHERE\n  rollup_input_result.block_height = :block_height! AND\n  rollup_input_result.success = TRUE AND\n  lower(rollup_inputs.from_address) = lower(:from_address!)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   effectstream_blocks.block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_inputs.from_address_type,
 *   effectstream_blocks.effectstream_block_hash,
 *   rollup_input_result.effectstream_tx_hash,
 *   rollup_input_result.index_in_block,
 *   rollup_input_result.success
 * FROM effectstream.rollup_inputs
 * JOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id
 * JOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height
 * WHERE
 *   rollup_input_result.block_height = :block_height! AND
 *   rollup_input_result.success = TRUE AND
 *   lower(rollup_inputs.from_address) = lower(:from_address!)
 * ```
 */
export const getGameInputResultByAddress = new PreparedQuery<IGetGameInputResultByAddressParams,IGetGameInputResultByAddressResult>(getGameInputResultByAddressIR);


/** 'RemoveScheduledBlockData' parameters type */
export interface IRemoveScheduledBlockDataParams {
  block_height: number;
  input_data: string;
}

/** 'RemoveScheduledBlockData' return type */
export type IRemoveScheduledBlockDataResult = void;

/** 'RemoveScheduledBlockData' query type */
export interface IRemoveScheduledBlockDataQuery {
  params: IRemoveScheduledBlockDataParams;
  result: IRemoveScheduledBlockDataResult;
}

const removeScheduledBlockDataIR: any = {"usedParamSet":{"input_data":true,"block_height":true},"params":[{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":71}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":260,"b":273}]}],"statement":"DELETE FROM effectstream.rollup_inputs\nWHERE\n  input_data = :input_data! AND\n  rollup_inputs.id IN (\n    SELECT rollup_input_future_block.id\n    FROM effectstream.rollup_input_future_block\n    WHERE effectstream.rollup_input_future_block.future_block_height = :block_height!\n)"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM effectstream.rollup_inputs
 * WHERE
 *   input_data = :input_data! AND
 *   rollup_inputs.id IN (
 *     SELECT rollup_input_future_block.id
 *     FROM effectstream.rollup_input_future_block
 *     WHERE effectstream.rollup_input_future_block.future_block_height = :block_height!
 * )
 * ```
 */
export const removeScheduledBlockData = new PreparedQuery<IRemoveScheduledBlockDataParams,IRemoveScheduledBlockDataResult>(removeScheduledBlockDataIR);


/** 'RemoveScheduledTimestampData' parameters type */
export interface IRemoveScheduledTimestampDataParams {
  input_data: string;
  ms_timestamp: DateOrString;
}

/** 'RemoveScheduledTimestampData' return type */
export type IRemoveScheduledTimestampDataResult = void;

/** 'RemoveScheduledTimestampData' query type */
export interface IRemoveScheduledTimestampDataQuery {
  params: IRemoveScheduledTimestampDataParams;
  result: IRemoveScheduledTimestampDataResult;
}

const removeScheduledTimestampDataIR: any = {"usedParamSet":{"input_data":true,"ms_timestamp":true},"params":[{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":71}]},{"name":"ms_timestamp","required":true,"transform":{"type":"scalar"},"locs":[{"a":272,"b":285}]}],"statement":"DELETE FROM effectstream.rollup_inputs\nWHERE\n  input_data = :input_data! AND\n  rollup_inputs.id IN (\n    SELECT rollup_input_future_timestamp.id\n    FROM effectstream.rollup_input_future_timestamp\n    WHERE effectstream.rollup_input_future_timestamp.future_ms_timestamp = :ms_timestamp!\n)"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM effectstream.rollup_inputs
 * WHERE
 *   input_data = :input_data! AND
 *   rollup_inputs.id IN (
 *     SELECT rollup_input_future_timestamp.id
 *     FROM effectstream.rollup_input_future_timestamp
 *     WHERE effectstream.rollup_input_future_timestamp.future_ms_timestamp = :ms_timestamp!
 * )
 * ```
 */
export const removeScheduledTimestampData = new PreparedQuery<IRemoveScheduledTimestampDataParams,IRemoveScheduledTimestampDataResult>(removeScheduledTimestampDataIR);


/** 'RemoveAllScheduledDataByInputData' parameters type */
export interface IRemoveAllScheduledDataByInputDataParams {
  input_data: string;
}

/** 'RemoveAllScheduledDataByInputData' return type */
export type IRemoveAllScheduledDataByInputDataResult = void;

/** 'RemoveAllScheduledDataByInputData' query type */
export interface IRemoveAllScheduledDataByInputDataQuery {
  params: IRemoveAllScheduledDataByInputDataParams;
  result: IRemoveAllScheduledDataByInputDataResult;
}

const removeAllScheduledDataByInputDataIR: any = {"usedParamSet":{"input_data":true},"params":[{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":58,"b":69}]}],"statement":"DELETE FROM effectstream.rollup_inputs\nWHERE input_data = :input_data!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM effectstream.rollup_inputs
 * WHERE input_data = :input_data!
 * ```
 */
export const removeAllScheduledDataByInputData = new PreparedQuery<IRemoveAllScheduledDataByInputDataParams,IRemoveAllScheduledDataByInputDataResult>(removeAllScheduledDataByInputDataIR);


/** 'DeleteScheduled' parameters type */
export interface IDeleteScheduledParams {
  id: number;
}

/** 'DeleteScheduled' return type */
export type IDeleteScheduledResult = void;

/** 'DeleteScheduled' query type */
export interface IDeleteScheduledQuery {
  params: IDeleteScheduledParams;
  result: IDeleteScheduledResult;
}

const deleteScheduledIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":50,"b":53}]}],"statement":"DELETE FROM effectstream.rollup_inputs\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM effectstream.rollup_inputs
 * WHERE id = :id!
 * ```
 */
export const deleteScheduled = new PreparedQuery<IDeleteScheduledParams,IDeleteScheduledResult>(deleteScheduledIR);



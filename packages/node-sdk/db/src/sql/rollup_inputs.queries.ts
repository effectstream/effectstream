/** Types generated for queries found in "src/sql/rollup_inputs.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'NewScheduledHeightData' parameters type */
export interface INewScheduledHeightDataParams {
  caip2?: string | null | void;
  from_address: string;
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

const newScheduledHeightDataIR: any = {"usedParamSet":{"from_address":true,"input_data":true,"primitive_name":true,"caip2":true,"origin_tx_hash":true,"origin_contract_address":true,"future_block_height":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":88,"b":101}]},{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":115}]},{"name":"primitive_name","required":false,"transform":{"type":"scalar"},"locs":[{"a":288,"b":302}]},{"name":"caip2","required":false,"transform":{"type":"scalar"},"locs":[{"a":305,"b":310}]},{"name":"origin_tx_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":313,"b":327}]},{"name":"origin_contract_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":337,"b":360}]},{"name":"future_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":462,"b":482}]}],"statement":"WITH\n  new_row AS (\n    INSERT INTO rollup_inputs(from_address, input_data)\n    VALUES (:from_address!, :input_data!)\n    RETURNING id\n  ),\n  insert_origin AS (\n    INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)\n    SELECT (SELECT id FROM new_row), :primitive_name, :caip2, :origin_tx_hash::BYTEA, :origin_contract_address\n  )\nINSERT INTO rollup_input_future_block(id, future_block_height)\nSELECT (SELECT id FROM new_row), :future_block_height!"};

/**
 * Query generated from SQL:
 * ```
 * WITH
 *   new_row AS (
 *     INSERT INTO rollup_inputs(from_address, input_data)
 *     VALUES (:from_address!, :input_data!)
 *     RETURNING id
 *   ),
 *   insert_origin AS (
 *     INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
 *     SELECT (SELECT id FROM new_row), :primitive_name, :caip2, :origin_tx_hash::BYTEA, :origin_contract_address
 *   )
 * INSERT INTO rollup_input_future_block(id, future_block_height)
 * SELECT (SELECT id FROM new_row), :future_block_height!
 * ```
 */
export const newScheduledHeightData = new PreparedQuery<INewScheduledHeightDataParams,INewScheduledHeightDataResult>(newScheduledHeightDataIR);


/** 'NewScheduledTimestampData' parameters type */
export interface INewScheduledTimestampDataParams {
  from_address: string;
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

const newScheduledTimestampDataIR: any = {"usedParamSet":{"from_address":true,"input_data":true,"future_ms_timestamp":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":88,"b":101}]},{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":115}]},{"name":"future_ms_timestamp","required":true,"transform":{"type":"scalar"},"locs":[{"a":411,"b":431}]}],"statement":"WITH\n  new_row AS (\n    INSERT INTO rollup_inputs(from_address, input_data)\n    VALUES (:from_address!, :input_data!)\n    RETURNING id\n  ),\n  insert_origin AS (\n    INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)\n    SELECT (SELECT id FROM new_row),null,null,null,null\n  )\nINSERT INTO rollup_input_future_timestamp(id, future_ms_timestamp)\nSELECT (SELECT id FROM new_row), :future_ms_timestamp!"};

/**
 * Query generated from SQL:
 * ```
 * WITH
 *   new_row AS (
 *     INSERT INTO rollup_inputs(from_address, input_data)
 *     VALUES (:from_address!, :input_data!)
 *     RETURNING id
 *   ),
 *   insert_origin AS (
 *     INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
 *     SELECT (SELECT id FROM new_row),null,null,null,null
 *   )
 * INSERT INTO rollup_input_future_timestamp(id, future_ms_timestamp)
 * SELECT (SELECT id FROM new_row), :future_ms_timestamp!
 * ```
 */
export const newScheduledTimestampData = new PreparedQuery<INewScheduledTimestampDataParams,INewScheduledTimestampDataResult>(newScheduledTimestampDataIR);


/** 'NewGameInput' parameters type */
export interface INewGameInputParams {
  block_height: number;
  caip2: string;
  from_address: string;
  index_in_block: number;
  input_data: string;
  origin_contract_address?: string | null | void;
  origin_tx_hash: Buffer;
  paima_tx_hash: Buffer;
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

const newGameInputIR: any = {"usedParamSet":{"from_address":true,"input_data":true,"primitive_name":true,"caip2":true,"origin_tx_hash":true,"origin_contract_address":true,"success":true,"paima_tx_hash":true,"index_in_block":true,"block_height":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":88,"b":101}]},{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":115}]},{"name":"primitive_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":288,"b":303}]},{"name":"caip2","required":true,"transform":{"type":"scalar"},"locs":[{"a":306,"b":312}]},{"name":"origin_tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":315,"b":330}]},{"name":"origin_contract_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":340,"b":363}]},{"name":"success","required":true,"transform":{"type":"scalar"},"locs":[{"a":492,"b":500}]},{"name":"paima_tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":503,"b":517}]},{"name":"index_in_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":527,"b":542}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":545,"b":558}]}],"statement":"WITH\n  new_row AS (\n    INSERT INTO rollup_inputs(from_address, input_data)\n    VALUES (:from_address!, :input_data!)\n    RETURNING id\n  ),\n  insert_origin AS (\n    INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)\n    SELECT (SELECT id FROM new_row), :primitive_name!, :caip2!, :origin_tx_hash!::BYTEA, :origin_contract_address\n  )\nINSERT INTO rollup_input_result(id, success, paima_tx_hash, index_in_block, block_height)\nSELECT (SELECT id FROM new_row), :success!, :paima_tx_hash!::BYTEA, :index_in_block!, :block_height!"};

/**
 * Query generated from SQL:
 * ```
 * WITH
 *   new_row AS (
 *     INSERT INTO rollup_inputs(from_address, input_data)
 *     VALUES (:from_address!, :input_data!)
 *     RETURNING id
 *   ),
 *   insert_origin AS (
 *     INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
 *     SELECT (SELECT id FROM new_row), :primitive_name!, :caip2!, :origin_tx_hash!::BYTEA, :origin_contract_address
 *   )
 * INSERT INTO rollup_input_result(id, success, paima_tx_hash, index_in_block, block_height)
 * SELECT (SELECT id FROM new_row), :success!, :paima_tx_hash!::BYTEA, :index_in_block!, :block_height!
 * ```
 */
export const newGameInput = new PreparedQuery<INewGameInputParams,INewGameInputResult>(newGameInputIR);


/** 'InsertGameInputResult' parameters type */
export interface IInsertGameInputResultParams {
  block_height: number;
  id: number;
  index_in_block: number;
  paima_tx_hash: Buffer;
  success: boolean;
}

/** 'InsertGameInputResult' return type */
export type IInsertGameInputResultResult = void;

/** 'InsertGameInputResult' query type */
export interface IInsertGameInputResultQuery {
  params: IInsertGameInputResultParams;
  result: IInsertGameInputResultResult;
}

const insertGameInputResultIR: any = {"usedParamSet":{"id":true,"success":true,"paima_tx_hash":true,"index_in_block":true,"block_height":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":101}]},{"name":"success","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":112}]},{"name":"paima_tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":115,"b":129}]},{"name":"index_in_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":139,"b":154}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":157,"b":170}]}],"statement":"INSERT INTO rollup_input_result(id, success, paima_tx_hash, index_in_block, block_height)\nVALUES (:id!, :success!, :paima_tx_hash!::BYTEA, :index_in_block!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO rollup_input_result(id, success, paima_tx_hash, index_in_block, block_height)
 * VALUES (:id!, :success!, :paima_tx_hash!::BYTEA, :index_in_block!, :block_height!)
 * ```
 */
export const insertGameInputResult = new PreparedQuery<IInsertGameInputResultParams,IInsertGameInputResultResult>(insertGameInputResultIR);


/** 'GetFutureGameInputByBlockHeight' parameters type */
export interface IGetFutureGameInputByBlockHeightParams {
  block_height: number;
}

/** 'GetFutureGameInputByBlockHeight' return type */
export interface IGetFutureGameInputByBlockHeightResult {
  caip2: string | null;
  contract_address: string | null;
  from_address: string;
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

const getFutureGameInputByBlockHeightIR: any = {"usedParamSet":{"block_height":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":516,"b":529}]}],"statement":"SELECT\n  rollup_inputs.id,\n  rollup_input_future_block.future_block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_input_origin.primitive_name,\n  rollup_input_origin.contract_address,\n  rollup_input_origin.caip2,\n  rollup_input_origin.tx_hash as \"origin_tx_hash\"\nFROM rollup_inputs\nJOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id\nJOIN rollup_input_future_block ON rollup_input_future_block.id = rollup_inputs.id\nWHERE rollup_input_future_block.future_block_height = :block_height!\nORDER BY rollup_inputs.id ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   rollup_input_future_block.future_block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_input_origin.primitive_name,
 *   rollup_input_origin.contract_address,
 *   rollup_input_origin.caip2,
 *   rollup_input_origin.tx_hash as "origin_tx_hash"
 * FROM rollup_inputs
 * JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
 * JOIN rollup_input_future_block ON rollup_input_future_block.id = rollup_inputs.id
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

const getFutureGameInputByMaxTimestampIR: any = {"usedParamSet":{"max_timestamp":true},"params":[{"name":"max_timestamp","required":true,"transform":{"type":"scalar"},"locs":[{"a":618,"b":632}]}],"statement":"SELECT\n  rollup_inputs.id,\n  rollup_input_future_timestamp.future_ms_timestamp,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  rollup_input_origin.primitive_name,\n  rollup_input_origin.contract_address,\n  rollup_input_origin.caip2,\n  rollup_input_origin.tx_hash as \"origin_tx_hash\"\nFROM rollup_inputs\nJOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id\nJOIN rollup_input_future_timestamp ON rollup_inputs.id = rollup_input_future_timestamp.id\nLEFT OUTER JOIN rollup_input_result\n  ON (rollup_input_result.id = rollup_inputs.id)\nWHERE rollup_input_future_timestamp.future_ms_timestamp <= :max_timestamp! AND\n      rollup_input_result.id IS NULL\nORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   rollup_input_future_timestamp.future_ms_timestamp,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   rollup_input_origin.primitive_name,
 *   rollup_input_origin.contract_address,
 *   rollup_input_origin.caip2,
 *   rollup_input_origin.tx_hash as "origin_tx_hash"
 * FROM rollup_inputs
 * JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
 * JOIN rollup_input_future_timestamp ON rollup_inputs.id = rollup_input_future_timestamp.id
 * LEFT OUTER JOIN rollup_input_result
 *   ON (rollup_input_result.id = rollup_inputs.id)
 * WHERE rollup_input_future_timestamp.future_ms_timestamp <= :max_timestamp! AND
 *       rollup_input_result.id IS NULL
 * ORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC
 * ```
 */
export const getFutureGameInputByMaxTimestamp = new PreparedQuery<IGetFutureGameInputByMaxTimestampParams,IGetFutureGameInputByMaxTimestampResult>(getFutureGameInputByMaxTimestampIR);


/** 'GetGameInputResultByBlockHeight' parameters type */
export interface IGetGameInputResultByBlockHeightParams {
  block_height: number;
}

/** 'GetGameInputResultByBlockHeight' return type */
export interface IGetGameInputResultByBlockHeightResult {
  block_height: number;
  contract_address: string | null;
  from_address: string;
  id: number;
  index_in_block: number;
  input_data: string;
  paima_block_hash: Buffer | null;
  paima_tx_hash: Buffer;
  success: boolean;
}

/** 'GetGameInputResultByBlockHeight' query type */
export interface IGetGameInputResultByBlockHeightQuery {
  params: IGetGameInputResultByBlockHeightParams;
  result: IGetGameInputResultByBlockHeightResult;
}

const getGameInputResultByBlockHeightIR: any = {"usedParamSet":{"block_height":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":567,"b":580}]}],"statement":"SELECT\n  rollup_inputs.id,\n  paima_blocks.block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  paima_blocks.paima_block_hash,\n  rollup_input_origin.contract_address,\n  rollup_input_result.paima_tx_hash,\n  rollup_input_result.index_in_block,\n  rollup_input_result.success\nFROM rollup_inputs\nJOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id\nJOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id\nJOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height\nWHERE paima_blocks.block_height = :block_height!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   paima_blocks.block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   paima_blocks.paima_block_hash,
 *   rollup_input_origin.contract_address,
 *   rollup_input_result.paima_tx_hash,
 *   rollup_input_result.index_in_block,
 *   rollup_input_result.success
 * FROM rollup_inputs
 * JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
 * JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
 * JOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height
 * WHERE paima_blocks.block_height = :block_height!
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
  from_address: string;
  id: number;
  index_in_block: number;
  input_data: string;
  paima_block_hash: Buffer | null;
  paima_tx_hash: Buffer;
  success: boolean;
}

/** 'GetGameInputResultByTxHash' query type */
export interface IGetGameInputResultByTxHashQuery {
  params: IGetGameInputResultByTxHashParams;
  result: IGetGameInputResultByTxHashResult;
}

const getGameInputResultByTxHashIR: any = {"usedParamSet":{"tx_hash":true},"params":[{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":465,"b":473}]}],"statement":"SELECT\n  rollup_inputs.id,\n  paima_blocks.block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  paima_blocks.paima_block_hash,\n  rollup_input_result.paima_tx_hash,\n  rollup_input_result.index_in_block,\n  rollup_input_result.success\nFROM rollup_inputs\nJOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id\nJOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height\nWHERE rollup_input_result.paima_tx_hash = :tx_hash!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   paima_blocks.block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   paima_blocks.paima_block_hash,
 *   rollup_input_result.paima_tx_hash,
 *   rollup_input_result.index_in_block,
 *   rollup_input_result.success
 * FROM rollup_inputs
 * JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
 * JOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height
 * WHERE rollup_input_result.paima_tx_hash = :tx_hash!
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
  from_address: string;
  id: number;
  index_in_block: number;
  input_data: string;
  paima_block_hash: Buffer | null;
  paima_tx_hash: Buffer;
  success: boolean;
}

/** 'GetGameInputResultByAddress' query type */
export interface IGetGameInputResultByAddressQuery {
  params: IGetGameInputResultByAddressParams;
  result: IGetGameInputResultByAddressResult;
}

const getGameInputResultByAddressIR: any = {"usedParamSet":{"block_height":true,"from_address":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":466,"b":479}]},{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":570,"b":583}]}],"statement":"SELECT\n  rollup_inputs.id,\n  paima_blocks.block_height,\n  rollup_inputs.input_data,\n  rollup_inputs.from_address,\n  paima_blocks.paima_block_hash,\n  rollup_input_result.paima_tx_hash,\n  rollup_input_result.index_in_block,\n  rollup_input_result.success\nFROM rollup_inputs\nJOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id\nJOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height\nWHERE\n  rollup_input_result.block_height = :block_height! AND\n  rollup_input_result.success = TRUE AND\n  lower(rollup_inputs.from_address) = lower(:from_address!)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   rollup_inputs.id,
 *   paima_blocks.block_height,
 *   rollup_inputs.input_data,
 *   rollup_inputs.from_address,
 *   paima_blocks.paima_block_hash,
 *   rollup_input_result.paima_tx_hash,
 *   rollup_input_result.index_in_block,
 *   rollup_input_result.success
 * FROM rollup_inputs
 * JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
 * JOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height
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

const removeScheduledBlockDataIR: any = {"usedParamSet":{"input_data":true,"block_height":true},"params":[{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":47,"b":58}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":221,"b":234}]}],"statement":"DELETE FROM rollup_inputs\nWHERE\n  input_data = :input_data! AND\n  rollup_inputs.id IN (\n    SELECT rollup_input_future_block.id\n    FROM rollup_input_future_block\n    WHERE rollup_input_future_block.future_block_height = :block_height!\n)"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM rollup_inputs
 * WHERE
 *   input_data = :input_data! AND
 *   rollup_inputs.id IN (
 *     SELECT rollup_input_future_block.id
 *     FROM rollup_input_future_block
 *     WHERE rollup_input_future_block.future_block_height = :block_height!
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

const removeScheduledTimestampDataIR: any = {"usedParamSet":{"input_data":true,"ms_timestamp":true},"params":[{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":47,"b":58}]},{"name":"ms_timestamp","required":true,"transform":{"type":"scalar"},"locs":[{"a":233,"b":246}]}],"statement":"DELETE FROM rollup_inputs\nWHERE\n  input_data = :input_data! AND\n  rollup_inputs.id IN (\n    SELECT rollup_input_future_timestamp.id\n    FROM rollup_input_future_timestamp\n    WHERE rollup_input_future_timestamp.future_ms_timestamp = :ms_timestamp!\n)"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM rollup_inputs
 * WHERE
 *   input_data = :input_data! AND
 *   rollup_inputs.id IN (
 *     SELECT rollup_input_future_timestamp.id
 *     FROM rollup_input_future_timestamp
 *     WHERE rollup_input_future_timestamp.future_ms_timestamp = :ms_timestamp!
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

const removeAllScheduledDataByInputDataIR: any = {"usedParamSet":{"input_data":true},"params":[{"name":"input_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":56}]}],"statement":"DELETE FROM rollup_inputs\nWHERE input_data = :input_data!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM rollup_inputs
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

const deleteScheduledIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":37,"b":40}]}],"statement":"DELETE FROM rollup_inputs\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM rollup_inputs
 * WHERE id = :id!
 * ```
 */
export const deleteScheduled = new PreparedQuery<IDeleteScheduledParams,IDeleteScheduledResult>(deleteScheduledIR);



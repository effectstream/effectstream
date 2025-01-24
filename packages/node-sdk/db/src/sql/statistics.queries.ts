/** Types generated for queries found in "src/sql/statistics.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetInputsTotal' parameters type */
export type IGetInputsTotalParams = void;

/** 'GetInputsTotal' return type */
export interface IGetInputsTotalResult {
  scheduled_data: string;
  submitted_inputs: string;
}

/** 'GetInputsTotal' query type */
export interface IGetInputsTotalQuery {
  params: IGetInputsTotalParams;
  result: IGetInputsTotalResult;
}

const getInputsTotalIR: any = {"usedParamSet":{},"params":[],"statement":"WITH scheduled_split AS (\n  SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input\n  FROM rollup_inputs\n  JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id\n)\nSELECT\n    COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS \"submitted_inputs!\",\n    COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS \"scheduled_data!\"\nFROM scheduled_split"};

/**
 * Query generated from SQL:
 * ```
 * WITH scheduled_split AS (
 *   SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input
 *   FROM rollup_inputs
 *   JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
 * )
 * SELECT
 *     COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS "submitted_inputs!",
 *     COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS "scheduled_data!"
 * FROM scheduled_split
 * ```
 */
export const getInputsTotal = new PreparedQuery<IGetInputsTotalParams,IGetInputsTotalResult>(getInputsTotalIR);


/** 'GetInputsForBlock' parameters type */
export interface IGetInputsForBlockParams {
  block_height: number;
}

/** 'GetInputsForBlock' return type */
export interface IGetInputsForBlockResult {
  scheduled_data: string;
  submitted_inputs: string;
}

/** 'GetInputsForBlock' query type */
export interface IGetInputsForBlockQuery {
  params: IGetInputsForBlockParams;
  result: IGetInputsForBlockResult;
}

const getInputsForBlockIR: any = {"usedParamSet":{"block_height":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":315,"b":328}]}],"statement":"WITH scheduled_split AS (\n  SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input\n  FROM rollup_inputs\n  JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id\n  JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id\n  WHERE block_height = :block_height!\n)\nSELECT\n    COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS \"submitted_inputs!\",\n    COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS \"scheduled_data!\"\nFROM scheduled_split"};

/**
 * Query generated from SQL:
 * ```
 * WITH scheduled_split AS (
 *   SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input
 *   FROM rollup_inputs
 *   JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
 *   JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
 *   WHERE block_height = :block_height!
 * )
 * SELECT
 *     COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS "submitted_inputs!",
 *     COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS "scheduled_data!"
 * FROM scheduled_split
 * ```
 */
export const getInputsForBlock = new PreparedQuery<IGetInputsForBlockParams,IGetInputsForBlockResult>(getInputsForBlockIR);


/** 'GetInputsForBlockHash' parameters type */
export interface IGetInputsForBlockHashParams {
  block_hash: Buffer;
}

/** 'GetInputsForBlockHash' return type */
export interface IGetInputsForBlockHashResult {
  scheduled_data: string;
  submitted_inputs: string;
}

/** 'GetInputsForBlockHash' query type */
export interface IGetInputsForBlockHashQuery {
  params: IGetInputsForBlockHashParams;
  result: IGetInputsForBlockHashResult;
}

const getInputsForBlockHashIR: any = {"usedParamSet":{"block_hash":true},"params":[{"name":"block_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":409,"b":420},{"a":444,"b":455}]}],"statement":"WITH scheduled_split AS (\n  SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input\n  FROM rollup_inputs\n  JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id\n  JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id\n  JOIN paima_blocks ON paima_blocks.block_height = rollup_input_result.block_height\n  WHERE (main_chain_block_hash = :block_hash! OR paima_block_hash = :block_hash!)\n)\nSELECT\n    COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS \"submitted_inputs!\",\n    COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS \"scheduled_data!\"\nFROM scheduled_split"};

/**
 * Query generated from SQL:
 * ```
 * WITH scheduled_split AS (
 *   SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input
 *   FROM rollup_inputs
 *   JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
 *   JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
 *   JOIN paima_blocks ON paima_blocks.block_height = rollup_input_result.block_height
 *   WHERE (main_chain_block_hash = :block_hash! OR paima_block_hash = :block_hash!)
 * )
 * SELECT
 *     COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS "submitted_inputs!",
 *     COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS "scheduled_data!"
 * FROM scheduled_split
 * ```
 */
export const getInputsForBlockHash = new PreparedQuery<IGetInputsForBlockHashParams,IGetInputsForBlockHashResult>(getInputsForBlockHashIR);


/** 'GetInputsForAddress' parameters type */
export interface IGetInputsForAddressParams {
  addr: string;
  block_height: number;
}

/** 'GetInputsForAddress' return type */
export interface IGetInputsForAddressResult {
  scheduled_data: string;
  submitted_inputs: string;
}

/** 'GetInputsForAddress' query type */
export interface IGetInputsForAddressQuery {
  params: IGetInputsForAddressParams;
  result: IGetInputsForAddressResult;
}

const getInputsForAddressIR: any = {"usedParamSet":{"addr":true,"block_height":true},"params":[{"name":"addr","required":true,"transform":{"type":"scalar"},"locs":[{"a":348,"b":353},{"a":421,"b":426}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":466,"b":479}]}],"statement":"WITH scheduled_split AS (\n  SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input\n  FROM rollup_inputs\n  JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id\n  JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id\n  WHERE\n        (\n          lower(from_address) = lower(:addr!) OR\n          lower(rollup_input_origin.contract_address) = lower(:addr!)\n        ) AND\n        block_height = :block_height!\n)\nSELECT\n    COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS \"submitted_inputs!\",\n    COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS \"scheduled_data!\"\nFROM scheduled_split"};

/**
 * Query generated from SQL:
 * ```
 * WITH scheduled_split AS (
 *   SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input
 *   FROM rollup_inputs
 *   JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
 *   JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
 *   WHERE
 *         (
 *           lower(from_address) = lower(:addr!) OR
 *           lower(rollup_input_origin.contract_address) = lower(:addr!)
 *         ) AND
 *         block_height = :block_height!
 * )
 * SELECT
 *     COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS "submitted_inputs!",
 *     COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS "scheduled_data!"
 * FROM scheduled_split
 * ```
 */
export const getInputsForAddress = new PreparedQuery<IGetInputsForAddressParams,IGetInputsForAddressResult>(getInputsForAddressIR);



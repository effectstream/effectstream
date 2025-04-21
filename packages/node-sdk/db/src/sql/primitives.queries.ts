/** Types generated for queries found in "src/sql/primitives.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** 'InsertPrimitiveAccounting' parameters type */
export interface IInsertPrimitiveAccountingParams {
  paima_block_height: number;
  payload: Json;
  payload_type: string;
  primitive_name: string;
}

/** 'InsertPrimitiveAccounting' return type */
export type IInsertPrimitiveAccountingResult = void;

/** 'InsertPrimitiveAccounting' query type */
export interface IInsertPrimitiveAccountingQuery {
  params: IInsertPrimitiveAccountingParams;
  result: IInsertPrimitiveAccountingResult;
}

const insertPrimitiveAccountingIR: any = {"usedParamSet":{"primitive_name":true,"paima_block_height":true,"payload_type":true,"payload":true},"params":[{"name":"primitive_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":100,"b":115}]},{"name":"paima_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":118,"b":137}]},{"name":"payload_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":153}]},{"name":"payload","required":true,"transform":{"type":"scalar"},"locs":[{"a":156,"b":164}]}],"statement":"INSERT INTO primitive_accounting(primitive_name, paima_block_height, payload_type, payload)\nVALUES (:primitive_name!, :paima_block_height!, :payload_type!, :payload!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO primitive_accounting(primitive_name, paima_block_height, payload_type, payload)
 * VALUES (:primitive_name!, :paima_block_height!, :payload_type!, :payload!)
 * ```
 */
export const insertPrimitiveAccounting = new PreparedQuery<IInsertPrimitiveAccountingParams,IInsertPrimitiveAccountingResult>(insertPrimitiveAccountingIR);



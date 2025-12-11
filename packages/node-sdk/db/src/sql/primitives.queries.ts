/** Types generated for queries found in "src/sql/primitives.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** 'InsertPrimitiveAccounting' parameters type */
export interface IInsertPrimitiveAccountingParams {
  effectstream_block_height: number;
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

const insertPrimitiveAccountingIR: any = {"usedParamSet":{"primitive_name":true,"effectstream_block_height":true,"payload_type":true,"payload":true},"params":[{"name":"primitive_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":120,"b":135}]},{"name":"effectstream_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":138,"b":164}]},{"name":"payload_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":167,"b":180}]},{"name":"payload","required":true,"transform":{"type":"scalar"},"locs":[{"a":183,"b":191}]}],"statement":"INSERT INTO effectstream.primitive_accounting(primitive_name, effectstream_block_height, payload_type, payload)\nVALUES (:primitive_name!, :effectstream_block_height!, :payload_type!, :payload!)\nON CONFLICT (primitive_name, effectstream_block_height, payload_hash) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO effectstream.primitive_accounting(primitive_name, effectstream_block_height, payload_type, payload)
 * VALUES (:primitive_name!, :effectstream_block_height!, :payload_type!, :payload!)
 * ON CONFLICT (primitive_name, effectstream_block_height, payload_hash) DO NOTHING
 * ```
 */
export const insertPrimitiveAccounting = new PreparedQuery<IInsertPrimitiveAccountingParams,IInsertPrimitiveAccountingResult>(insertPrimitiveAccountingIR);



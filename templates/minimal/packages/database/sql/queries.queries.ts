/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'InsertInput' parameters type */
export interface IInsertInputParams {
  block_height: number;
  payload: string;
  signer: string;
}

/** 'InsertInput' return type */
export type IInsertInputResult = void;

/** 'InsertInput' query type */
export interface IInsertInputQuery {
  params: IInsertInputParams;
  result: IInsertInputResult;
}

const insertInputIR: any = {"usedParamSet":{"signer":true,"payload":true,"block_height":true},"params":[{"name":"signer","required":true,"transform":{"type":"scalar"},"locs":[{"a":63,"b":70}]},{"name":"payload","required":true,"transform":{"type":"scalar"},"locs":[{"a":73,"b":81}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":97}]}],"statement":"INSERT INTO inputs_log (signer, payload, block_height)\nVALUES (:signer!, :payload!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO inputs_log (signer, payload, block_height)
 * VALUES (:signer!, :payload!, :block_height!)
 * ```
 */
export const insertInput = new PreparedQuery<IInsertInputParams,IInsertInputResult>(insertInputIR);


/** 'GetAllInputs' parameters type */
export type IGetAllInputsParams = void;

/** 'GetAllInputs' return type */
export interface IGetAllInputsResult {
  block_height: number;
  id: number;
  payload: string;
  signer: string;
}

/** 'GetAllInputs' query type */
export interface IGetAllInputsQuery {
  params: IGetAllInputsParams;
  result: IGetAllInputsResult;
}

const getAllInputsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM inputs_log\nORDER BY id DESC\nLIMIT 100"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM inputs_log
 * ORDER BY id DESC
 * LIMIT 100
 * ```
 */
export const getAllInputs = new PreparedQuery<IGetAllInputsParams,IGetAllInputsResult>(getAllInputsIR);



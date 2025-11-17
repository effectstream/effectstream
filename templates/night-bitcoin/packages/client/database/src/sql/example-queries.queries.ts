/** Types generated for queries found in "src/sql/example-queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type NumberOrString = number | string;

/** 'TableExists' parameters type */
export type ITableExistsParams = void;

/** 'TableExists' return type */
export interface ITableExistsResult {
  exists: boolean | null;
}

/** 'TableExists' query type */
export interface ITableExistsQuery {
  params: ITableExistsParams;
  result: ITableExistsResult;
}

const tableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables \n    WHERE  table_schema = 'public'\n    AND    table_name   = 'quotes'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables 
 *     WHERE  table_schema = 'public'
 *     AND    table_name   = 'quotes'
 * )
 * ```
 */
export const tableExists = new PreparedQuery<ITableExistsParams,ITableExistsResult>(tableExistsIR);


/** 'InsertQuote' parameters type */
export interface IInsertQuoteParams {
  fee: NumberOrString;
  filler: string;
  from_amount: NumberOrString;
  from_token: string;
  order_id: string;
  to_amount: NumberOrString;
  to_token: string;
}

/** 'InsertQuote' return type */
export type IInsertQuoteResult = void;

/** 'InsertQuote' query type */
export interface IInsertQuoteQuery {
  params: IInsertQuoteParams;
  result: IInsertQuoteResult;
}

const insertQuoteIR: any = {"usedParamSet":{"order_id":true,"from_token":true,"filler":true,"to_token":true,"from_amount":true,"to_amount":true,"fee":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":100,"b":109}]},{"name":"from_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":123}]},{"name":"filler","required":true,"transform":{"type":"scalar"},"locs":[{"a":126,"b":133}]},{"name":"to_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":145}]},{"name":"from_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":148,"b":160}]},{"name":"to_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":163,"b":173}]},{"name":"fee","required":true,"transform":{"type":"scalar"},"locs":[{"a":176,"b":180}]}],"statement":"INSERT INTO quotes \n(order_id, from_token, filler, to_token, from_amount, to_amount, fee) \nVALUES \n(:order_id!, :from_token!, :filler!, :to_token!, :from_amount!, :to_amount!, :fee!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO quotes 
 * (order_id, from_token, filler, to_token, from_amount, to_amount, fee) 
 * VALUES 
 * (:order_id!, :from_token!, :filler!, :to_token!, :from_amount!, :to_amount!, :fee!)
 * ```
 */
export const insertQuote = new PreparedQuery<IInsertQuoteParams,IInsertQuoteResult>(insertQuoteIR);


/** 'GetQuoteById' parameters type */
export interface IGetQuoteByIdParams {
  order_id: string;
}

/** 'GetQuoteById' return type */
export interface IGetQuoteByIdResult {
  created_at: Date;
  fee: string;
  filler: string;
  from_amount: string;
  from_token: string;
  id: number;
  order_id: string;
  to_amount: string;
  to_token: string;
}

/** 'GetQuoteById' query type */
export interface IGetQuoteByIdQuery {
  params: IGetQuoteByIdParams;
  result: IGetQuoteByIdResult;
}

const getQuoteByIdIR: any = {"usedParamSet":{"order_id":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":39,"b":48}]}],"statement":"SELECT * FROM quotes \nWHERE order_id = :order_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM quotes 
 * WHERE order_id = :order_id!
 * ```
 */
export const getQuoteById = new PreparedQuery<IGetQuoteByIdParams,IGetQuoteByIdResult>(getQuoteByIdIR);



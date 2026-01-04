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

const tableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables \n    WHERE  table_schema = 'public'\n    AND    table_name   = 'example_table'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables 
 *     WHERE  table_schema = 'public'
 *     AND    table_name   = 'example_table'
 * )
 * ```
 */
export const tableExists = new PreparedQuery<ITableExistsParams,ITableExistsResult>(tableExistsIR);


/** 'InsertData' parameters type */
export interface IInsertDataParams {
  action: string;
  block_height: number;
  chain: string;
  data: string;
}

/** 'InsertData' return type */
export type IInsertDataResult = void;

/** 'InsertData' query type */
export interface IInsertDataQuery {
  params: IInsertDataParams;
  result: IInsertDataResult;
}

const insertDataIR: any = {"usedParamSet":{"chain":true,"action":true,"data":true,"block_height":true},"params":[{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":81,"b":87}]},{"name":"action","required":true,"transform":{"type":"scalar"},"locs":[{"a":90,"b":97}]},{"name":"data","required":true,"transform":{"type":"scalar"},"locs":[{"a":100,"b":105}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":108,"b":121}]}],"statement":"INSERT INTO example_table \n    (chain, action, data, block_height) \nVALUES \n    (:chain!, :action!, :data!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO example_table 
 *     (chain, action, data, block_height) 
 * VALUES 
 *     (:chain!, :action!, :data!, :block_height!)
 * ```
 */
export const insertData = new PreparedQuery<IInsertDataParams,IInsertDataResult>(insertDataIR);


/** 'GetDataByChain' parameters type */
export interface IGetDataByChainParams {
  chain: string;
  limit: NumberOrString;
  offset: NumberOrString;
}

/** 'GetDataByChain' return type */
export interface IGetDataByChainResult {
  action: string;
  block_height: number;
  chain: string;
  data: string;
  id: number;
}

/** 'GetDataByChain' query type */
export interface IGetDataByChainQuery {
  params: IGetDataByChainParams;
  result: IGetDataByChainResult;
}

const getDataByChainIR: any = {"usedParamSet":{"chain":true,"limit":true,"offset":true},"params":[{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":42,"b":48}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":83,"b":89}]},{"name":"offset","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":105}]}],"statement":"SELECT * FROM example_table\nWHERE chain = :chain!\nORDER BY block_height DESC\nLIMIT :limit!\nOFFSET :offset!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM example_table
 * WHERE chain = :chain!
 * ORDER BY block_height DESC
 * LIMIT :limit!
 * OFFSET :offset!
 * ```
 */
export const getDataByChain = new PreparedQuery<IGetDataByChainParams,IGetDataByChainResult>(getDataByChainIR);

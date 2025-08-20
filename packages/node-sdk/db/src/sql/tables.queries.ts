/** Types generated for queries found in "src/sql/tables.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetPrimaryKeyColumns' parameters type */
export interface IGetPrimaryKeyColumnsParams {
  tableName?: string | null | void;
}

/** 'GetPrimaryKeyColumns' return type */
export interface IGetPrimaryKeyColumnsResult {
  column_name: string;
}

/** 'GetPrimaryKeyColumns' query type */
export interface IGetPrimaryKeyColumnsQuery {
  params: IGetPrimaryKeyColumnsParams;
  result: IGetPrimaryKeyColumnsResult;
}

const getPrimaryKeyColumnsIR: any = {"usedParamSet":{"tableName":true},"params":[{"name":"tableName","required":false,"transform":{"type":"scalar"},"locs":[{"a":175,"b":184}]}],"statement":"SELECT a.attname as \"column_name\"\nFROM   pg_index i\nJOIN   pg_attribute a ON a.attrelid = i.indrelid\n                    AND a.attnum = ANY(i.indkey)\nWHERE  i.indrelid = CAST(:tableName AS TEXT)::regclass\nAND    i.indisprimary"};

/**
 * Query generated from SQL:
 * ```
 * SELECT a.attname as "column_name"
 * FROM   pg_index i
 * JOIN   pg_attribute a ON a.attrelid = i.indrelid
 *                     AND a.attnum = ANY(i.indkey)
 * WHERE  i.indrelid = CAST(:tableName AS TEXT)::regclass
 * AND    i.indisprimary
 * ```
 */
export const getPrimaryKeyColumns = new PreparedQuery<IGetPrimaryKeyColumnsParams,IGetPrimaryKeyColumnsResult>(getPrimaryKeyColumnsIR);



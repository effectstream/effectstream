/** Types generated for queries found in "src/sql/system.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetTableSchema' parameters type */
export interface IGetTableSchemaParams {
  tableName: string;
}

/** 'GetTableSchema' return type */
export interface IGetTableSchemaResult {
  character_maximum_length: number | null;
  column_default: string | null;
  column_name: string | null;
  data_type: string | null;
  is_nullable: string | null;
}

/** 'GetTableSchema' query type */
export interface IGetTableSchemaQuery {
  params: IGetTableSchemaParams;
  result: IGetTableSchemaResult;
}

const getTableSchemaIR: any = {"usedParamSet":{"tableName":true},"params":[{"name":"tableName","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":150}]}],"statement":"SELECT \ncolumn_name, data_type, character_maximum_length, column_default, is_nullable\nFROM \nINFORMATION_SCHEMA.COLUMNS \nWHERE \ntable_name = :tableName!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 * column_name, data_type, character_maximum_length, column_default, is_nullable
 * FROM 
 * INFORMATION_SCHEMA.COLUMNS 
 * WHERE 
 * table_name = :tableName!
 * ```
 */
export const getTableSchema = new PreparedQuery<IGetTableSchemaParams,IGetTableSchemaResult>(getTableSchemaIR);



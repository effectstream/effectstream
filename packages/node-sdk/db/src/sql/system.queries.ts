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


/** 'GetLatestVersion' parameters type */
export type IGetLatestVersionParams = void;

/** 'GetLatestVersion' return type */
export interface IGetLatestVersionResult {
  block_height: number;
  version_major: number;
  version_minor: number;
  version_patch: number;
}

/** 'GetLatestVersion' query type */
export interface IGetLatestVersionQuery {
  params: IGetLatestVersionParams;
  result: IGetLatestVersionResult;
}

const getLatestVersionIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT \nversion_major, version_minor, version_patch, block_height\nFROM \npaima_engine_version_history\nORDER BY \nblock_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 * version_major, version_minor, version_patch, block_height
 * FROM 
 * paima_engine_version_history
 * ORDER BY 
 * block_height DESC
 * LIMIT 1
 * ```
 */
export const getLatestVersion = new PreparedQuery<IGetLatestVersionParams,IGetLatestVersionResult>(getLatestVersionIR);


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

const tableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables \n    WHERE  table_schema = 'public'\n    AND    table_name   = 'paima_engine_version_history'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables 
 *     WHERE  table_schema = 'public'
 *     AND    table_name   = 'paima_engine_version_history'
 * )
 * ```
 */
export const tableExists = new PreparedQuery<ITableExistsParams,ITableExistsResult>(tableExistsIR);


/** 'InsertPaimaEngineMigration' parameters type */
export interface IInsertPaimaEngineMigrationParams {
  blockHeight: number;
  isSystemMigration: boolean;
  name: string;
}

/** 'InsertPaimaEngineMigration' return type */
export type IInsertPaimaEngineMigrationResult = void;

/** 'InsertPaimaEngineMigration' query type */
export interface IInsertPaimaEngineMigrationQuery {
  params: IInsertPaimaEngineMigrationParams;
  result: IInsertPaimaEngineMigrationResult;
}

const insertPaimaEngineMigrationIR: any = {"usedParamSet":{"name":true,"blockHeight":true,"isSystemMigration":true},"params":[{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":96,"b":101}]},{"name":"blockHeight","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":116}]},{"name":"isSystemMigration","required":true,"transform":{"type":"scalar"},"locs":[{"a":119,"b":137}]}],"statement":"INSERT INTO paima_engine_migration_history \n(name, block_height, is_system_migration) \nVALUES \n(:name!, :blockHeight!, :isSystemMigration!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima_engine_migration_history 
 * (name, block_height, is_system_migration) 
 * VALUES 
 * (:name!, :blockHeight!, :isSystemMigration!)
 * ```
 */
export const insertPaimaEngineMigration = new PreparedQuery<IInsertPaimaEngineMigrationParams,IInsertPaimaEngineMigrationResult>(insertPaimaEngineMigrationIR);


/** 'InsertPaimaEngineVersion' parameters type */
export interface IInsertPaimaEngineVersionParams {
  blockHeight: number;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
}

/** 'InsertPaimaEngineVersion' return type */
export type IInsertPaimaEngineVersionResult = void;

/** 'InsertPaimaEngineVersion' query type */
export interface IInsertPaimaEngineVersionQuery {
  params: IInsertPaimaEngineVersionParams;
  result: IInsertPaimaEngineVersionResult;
}

const insertPaimaEngineVersionIR: any = {"usedParamSet":{"versionMajor":true,"versionMinor":true,"versionPatch":true,"blockHeight":true},"params":[{"name":"versionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":125}]},{"name":"versionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":128,"b":141}]},{"name":"versionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":144,"b":157}]},{"name":"blockHeight","required":true,"transform":{"type":"scalar"},"locs":[{"a":160,"b":172}]}],"statement":"INSERT INTO paima_engine_version_history \n(version_major, version_minor, version_patch, block_height) \nVALUES \n(:versionMajor!, :versionMinor!, :versionPatch!, :blockHeight!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima_engine_version_history 
 * (version_major, version_minor, version_patch, block_height) 
 * VALUES 
 * (:versionMajor!, :versionMinor!, :versionPatch!, :blockHeight!)
 * ```
 */
export const insertPaimaEngineVersion = new PreparedQuery<IInsertPaimaEngineVersionParams,IInsertPaimaEngineVersionResult>(insertPaimaEngineVersionIR);



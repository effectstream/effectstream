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
  app_version_major: number;
  app_version_minor: number;
  app_version_patch: number;
  block_height: number;
  engine_version_major: number;
  engine_version_minor: number;
  engine_version_patch: number;
}

/** 'GetLatestVersion' query type */
export interface IGetLatestVersionQuery {
  params: IGetLatestVersionParams;
  result: IGetLatestVersionResult;
}

const getLatestVersionIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT \napp_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height\nFROM \npaima.paima_engine_version_history\nORDER BY block_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 * app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height
 * FROM 
 * paima.paima_engine_version_history
 * ORDER BY block_height DESC
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

const tableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables \n    WHERE  table_schema = 'paima'\n    AND    table_name   = 'paima_engine_version_history'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables 
 *     WHERE  table_schema = 'paima'
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

const insertPaimaEngineMigrationIR: any = {"usedParamSet":{"name":true,"blockHeight":true,"isSystemMigration":true},"params":[{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":102,"b":107}]},{"name":"blockHeight","required":true,"transform":{"type":"scalar"},"locs":[{"a":110,"b":122}]},{"name":"isSystemMigration","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":143}]}],"statement":"INSERT INTO paima.paima_engine_migration_history \n(name, block_height, is_system_migration) \nVALUES \n(:name!, :blockHeight!, :isSystemMigration!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima.paima_engine_migration_history 
 * (name, block_height, is_system_migration) 
 * VALUES 
 * (:name!, :blockHeight!, :isSystemMigration!)
 * ```
 */
export const insertPaimaEngineMigration = new PreparedQuery<IInsertPaimaEngineMigrationParams,IInsertPaimaEngineMigrationResult>(insertPaimaEngineMigrationIR);


/** 'InsertPaimaEngineVersion' parameters type */
export interface IInsertPaimaEngineVersionParams {
  appVersionMajor: number;
  appVersionMinor: number;
  appVersionPatch: number;
  blockHeight: number;
  engineVersionMajor: number;
  engineVersionMinor: number;
  engineVersionPatch: number;
}

/** 'InsertPaimaEngineVersion' return type */
export type IInsertPaimaEngineVersionResult = void;

/** 'InsertPaimaEngineVersion' query type */
export interface IInsertPaimaEngineVersionQuery {
  params: IInsertPaimaEngineVersionParams;
  result: IInsertPaimaEngineVersionResult;
}

const insertPaimaEngineVersionIR: any = {"usedParamSet":{"appVersionMajor":true,"appVersionMinor":true,"appVersionPatch":true,"engineVersionMajor":true,"engineVersionMinor":true,"engineVersionPatch":true,"blockHeight":true},"params":[{"name":"appVersionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":196,"b":212}]},{"name":"appVersionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":215,"b":231}]},{"name":"appVersionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":234,"b":250}]},{"name":"engineVersionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":253,"b":272}]},{"name":"engineVersionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":275,"b":294}]},{"name":"engineVersionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":297,"b":316}]},{"name":"blockHeight","required":true,"transform":{"type":"scalar"},"locs":[{"a":319,"b":331}]}],"statement":"INSERT INTO paima.paima_engine_version_history \n(app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) \nVALUES \n(:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima.paima_engine_version_history 
 * (app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) 
 * VALUES 
 * (:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)
 * ```
 */
export const insertPaimaEngineVersion = new PreparedQuery<IInsertPaimaEngineVersionParams,IInsertPaimaEngineVersionResult>(insertPaimaEngineVersionIR);


/** 'FindMigrationByName' parameters type */
export interface IFindMigrationByNameParams {
  isSystemMigration: boolean;
  name: string;
}

/** 'FindMigrationByName' return type */
export interface IFindMigrationByNameResult {
  block_height: number;
  is_system_migration: boolean;
  name: string;
}

/** 'FindMigrationByName' query type */
export interface IFindMigrationByNameQuery {
  params: IFindMigrationByNameParams;
  result: IFindMigrationByNameResult;
}

const findMigrationByNameIR: any = {"usedParamSet":{"name":true,"isSystemMigration":true},"params":[{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":69}]},{"name":"isSystemMigration","required":true,"transform":{"type":"scalar"},"locs":[{"a":97,"b":115}]}],"statement":"SELECT * FROM paima.paima_engine_migration_history\nWHERE name = :name!\nAND is_system_migration = :isSystemMigration!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.paima_engine_migration_history
 * WHERE name = :name!
 * AND is_system_migration = :isSystemMigration!
 * ```
 */
export const findMigrationByName = new PreparedQuery<IFindMigrationByNameParams,IFindMigrationByNameResult>(findMigrationByNameIR);


/** 'InsertEngineExpectedVersion' parameters type */
export interface IInsertEngineExpectedVersionParams {
  appVersionMajor: number;
  appVersionMinor: number;
  appVersionPatch: number;
  blockHeight: number;
  engineVersionMajor: number;
  engineVersionMinor: number;
  engineVersionPatch: number;
}

/** 'InsertEngineExpectedVersion' return type */
export type IInsertEngineExpectedVersionResult = void;

/** 'InsertEngineExpectedVersion' query type */
export interface IInsertEngineExpectedVersionQuery {
  params: IInsertEngineExpectedVersionParams;
  result: IInsertEngineExpectedVersionResult;
}

const insertEngineExpectedVersionIR: any = {"usedParamSet":{"appVersionMajor":true,"appVersionMinor":true,"appVersionPatch":true,"engineVersionMajor":true,"engineVersionMinor":true,"engineVersionPatch":true,"blockHeight":true},"params":[{"name":"appVersionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":197,"b":213}]},{"name":"appVersionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":216,"b":232}]},{"name":"appVersionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":235,"b":251}]},{"name":"engineVersionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":254,"b":273}]},{"name":"engineVersionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":276,"b":295}]},{"name":"engineVersionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":298,"b":317}]},{"name":"blockHeight","required":true,"transform":{"type":"scalar"},"locs":[{"a":320,"b":332}]}],"statement":"INSERT INTO paima.paima_engine_expected_version \n(app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) \nVALUES \n(:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima.paima_engine_expected_version 
 * (app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) 
 * VALUES 
 * (:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)
 * ```
 */
export const insertEngineExpectedVersion = new PreparedQuery<IInsertEngineExpectedVersionParams,IInsertEngineExpectedVersionResult>(insertEngineExpectedVersionIR);


/** 'GetExpectedEngineVersion' parameters type */
export type IGetExpectedEngineVersionParams = void;

/** 'GetExpectedEngineVersion' return type */
export interface IGetExpectedEngineVersionResult {
  app_version_major: number;
  app_version_minor: number;
  app_version_patch: number;
  block_height: number;
  engine_version_major: number;
  engine_version_minor: number;
  engine_version_patch: number;
}

/** 'GetExpectedEngineVersion' query type */
export interface IGetExpectedEngineVersionQuery {
  params: IGetExpectedEngineVersionParams;
  result: IGetExpectedEngineVersionResult;
}

const getExpectedEngineVersionIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM paima.paima_engine_expected_version\nORDER BY block_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.paima_engine_expected_version
 * ORDER BY block_height DESC
 * LIMIT 1
 * ```
 */
export const getExpectedEngineVersion = new PreparedQuery<IGetExpectedEngineVersionParams,IGetExpectedEngineVersionResult>(getExpectedEngineVersionIR);



/** Types generated for queries found in "src/sql/system.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

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

const getLatestVersionIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT \napp_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height\nFROM \neffectstream.effectstream_version_history\nORDER BY block_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 * app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height
 * FROM 
 * effectstream.effectstream_version_history
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

const tableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables \n    WHERE  table_schema = 'effectstream'\n    AND    table_name   = 'effectstream_version_history'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables 
 *     WHERE  table_schema = 'effectstream'
 *     AND    table_name   = 'effectstream_version_history'
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

const insertPaimaEngineMigrationIR: any = {"usedParamSet":{"name":true,"blockHeight":true,"isSystemMigration":true},"params":[{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":109,"b":114}]},{"name":"blockHeight","required":true,"transform":{"type":"scalar"},"locs":[{"a":117,"b":129}]},{"name":"isSystemMigration","required":true,"transform":{"type":"scalar"},"locs":[{"a":132,"b":150}]}],"statement":"INSERT INTO effectstream.effectstream_migration_history \n(name, block_height, is_system_migration) \nVALUES \n(:name!, :blockHeight!, :isSystemMigration!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO effectstream.effectstream_migration_history 
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

const insertPaimaEngineVersionIR: any = {"usedParamSet":{"appVersionMajor":true,"appVersionMinor":true,"appVersionPatch":true,"engineVersionMajor":true,"engineVersionMinor":true,"engineVersionPatch":true,"blockHeight":true},"params":[{"name":"appVersionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":203,"b":219}]},{"name":"appVersionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":222,"b":238}]},{"name":"appVersionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":241,"b":257}]},{"name":"engineVersionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":260,"b":279}]},{"name":"engineVersionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":282,"b":301}]},{"name":"engineVersionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":304,"b":323}]},{"name":"blockHeight","required":true,"transform":{"type":"scalar"},"locs":[{"a":326,"b":338}]}],"statement":"INSERT INTO effectstream.effectstream_version_history \n(app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) \nVALUES \n(:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO effectstream.effectstream_version_history 
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

const findMigrationByNameIR: any = {"usedParamSet":{"name":true,"isSystemMigration":true},"params":[{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":71,"b":76}]},{"name":"isSystemMigration","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":122}]}],"statement":"SELECT * FROM effectstream.effectstream_migration_history\nWHERE name = :name!\nAND is_system_migration = :isSystemMigration!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.effectstream_migration_history
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

const insertEngineExpectedVersionIR: any = {"usedParamSet":{"appVersionMajor":true,"appVersionMinor":true,"appVersionPatch":true,"engineVersionMajor":true,"engineVersionMinor":true,"engineVersionPatch":true,"blockHeight":true},"params":[{"name":"appVersionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":204,"b":220}]},{"name":"appVersionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":223,"b":239}]},{"name":"appVersionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":242,"b":258}]},{"name":"engineVersionMajor","required":true,"transform":{"type":"scalar"},"locs":[{"a":261,"b":280}]},{"name":"engineVersionMinor","required":true,"transform":{"type":"scalar"},"locs":[{"a":283,"b":302}]},{"name":"engineVersionPatch","required":true,"transform":{"type":"scalar"},"locs":[{"a":305,"b":324}]},{"name":"blockHeight","required":true,"transform":{"type":"scalar"},"locs":[{"a":327,"b":339}]}],"statement":"INSERT INTO effectstream.effectstream_expected_version \n(app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) \nVALUES \n(:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO effectstream.effectstream_expected_version 
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

const getExpectedEngineVersionIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM effectstream.effectstream_expected_version\nORDER BY block_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.effectstream_expected_version
 * ORDER BY block_height DESC
 * LIMIT 1
 * ```
 */
export const getExpectedEngineVersion = new PreparedQuery<IGetExpectedEngineVersionParams,IGetExpectedEngineVersionResult>(getExpectedEngineVersionIR);


/** 'GetAllTableNames' parameters type */
export type IGetAllTableNamesParams = void;

/** 'GetAllTableNames' return type */
export interface IGetAllTableNamesResult {
  tablename: string | null;
}

/** 'GetAllTableNames' query type */
export interface IGetAllTableNamesQuery {
  params: IGetAllTableNamesParams;
  result: IGetAllTableNamesResult;
}

const getAllTableNamesIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT tablename\nFROM pg_tables\nWHERE schemaname = 'public'"};

/**
 * Query generated from SQL:
 * ```
 * SELECT tablename
 * FROM pg_tables
 * WHERE schemaname = 'public'
 * ```
 */
export const getAllTableNames = new PreparedQuery<IGetAllTableNamesParams,IGetAllTableNamesResult>(getAllTableNamesIR);


/** 'UpsertSyncProtocolConfigSnapshot' parameters type */
export interface IUpsertSyncProtocolConfigSnapshotParams {
  immutableConfig: Json;
  networkType: string;
  protocolName: string;
}

/** 'UpsertSyncProtocolConfigSnapshot' return type */
export type IUpsertSyncProtocolConfigSnapshotResult = void;

/** 'UpsertSyncProtocolConfigSnapshot' query type */
export interface IUpsertSyncProtocolConfigSnapshotQuery {
  params: IUpsertSyncProtocolConfigSnapshotParams;
  result: IUpsertSyncProtocolConfigSnapshotResult;
}

const upsertSyncProtocolConfigSnapshotIR: any = {"usedParamSet":{"protocolName":true,"networkType":true,"immutableConfig":true},"params":[{"name":"protocolName","required":true,"transform":{"type":"scalar"},"locs":[{"a":111,"b":124}]},{"name":"networkType","required":true,"transform":{"type":"scalar"},"locs":[{"a":127,"b":139}]},{"name":"immutableConfig","required":true,"transform":{"type":"scalar"},"locs":[{"a":142,"b":158}]}],"statement":"INSERT INTO effectstream.sync_protocol_config_snapshot (protocol_name, network_type, immutable_config)\nVALUES (:protocolName!, :networkType!, :immutableConfig!)\nON CONFLICT (protocol_name) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO effectstream.sync_protocol_config_snapshot (protocol_name, network_type, immutable_config)
 * VALUES (:protocolName!, :networkType!, :immutableConfig!)
 * ON CONFLICT (protocol_name) DO NOTHING
 * ```
 */
export const upsertSyncProtocolConfigSnapshot = new PreparedQuery<IUpsertSyncProtocolConfigSnapshotParams,IUpsertSyncProtocolConfigSnapshotResult>(upsertSyncProtocolConfigSnapshotIR);


/** 'GetSyncProtocolConfigSnapshot' parameters type */
export interface IGetSyncProtocolConfigSnapshotParams {
  protocolName: string;
}

/** 'GetSyncProtocolConfigSnapshot' return type */
export interface IGetSyncProtocolConfigSnapshotResult {
  immutable_config: Json;
  network_type: string;
  protocol_name: string;
}

/** 'GetSyncProtocolConfigSnapshot' query type */
export interface IGetSyncProtocolConfigSnapshotQuery {
  params: IGetSyncProtocolConfigSnapshotParams;
  result: IGetSyncProtocolConfigSnapshotResult;
}

const getSyncProtocolConfigSnapshotIR: any = {"usedParamSet":{"protocolName":true},"params":[{"name":"protocolName","required":true,"transform":{"type":"scalar"},"locs":[{"a":123,"b":136}]}],"statement":"SELECT protocol_name, network_type, immutable_config\nFROM effectstream.sync_protocol_config_snapshot\nWHERE protocol_name = :protocolName!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT protocol_name, network_type, immutable_config
 * FROM effectstream.sync_protocol_config_snapshot
 * WHERE protocol_name = :protocolName!
 * ```
 */
export const getSyncProtocolConfigSnapshot = new PreparedQuery<IGetSyncProtocolConfigSnapshotParams,IGetSyncProtocolConfigSnapshotResult>(getSyncProtocolConfigSnapshotIR);


/** 'UpdateSyncProtocolConfigSnapshot' parameters type */
export interface IUpdateSyncProtocolConfigSnapshotParams {
  immutableConfig: Json;
  protocolName: string;
}

/** 'UpdateSyncProtocolConfigSnapshot' return type */
export type IUpdateSyncProtocolConfigSnapshotResult = void;

/** 'UpdateSyncProtocolConfigSnapshot' query type */
export interface IUpdateSyncProtocolConfigSnapshotQuery {
  params: IUpdateSyncProtocolConfigSnapshotParams;
  result: IUpdateSyncProtocolConfigSnapshotResult;
}

const updateSyncProtocolConfigSnapshotIR: any = {"usedParamSet":{"immutableConfig":true,"protocolName":true},"params":[{"name":"immutableConfig","required":true,"transform":{"type":"scalar"},"locs":[{"a":73,"b":89}]},{"name":"protocolName","required":true,"transform":{"type":"scalar"},"locs":[{"a":113,"b":126}]}],"statement":"UPDATE effectstream.sync_protocol_config_snapshot\nSET immutable_config = :immutableConfig!\nWHERE protocol_name = :protocolName!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE effectstream.sync_protocol_config_snapshot
 * SET immutable_config = :immutableConfig!
 * WHERE protocol_name = :protocolName!
 * ```
 */
export const updateSyncProtocolConfigSnapshot = new PreparedQuery<IUpdateSyncProtocolConfigSnapshotParams,IUpdateSyncProtocolConfigSnapshotResult>(updateSyncProtocolConfigSnapshotIR);



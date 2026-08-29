/* @name getTableSchema */
SELECT 
column_name, data_type, character_maximum_length, column_default, is_nullable
FROM 
INFORMATION_SCHEMA.COLUMNS 
WHERE 
table_name = :tableName!
;

/* @name getLatestVersion */
SELECT 
app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height
FROM 
effectstream.effectstream_version_history
ORDER BY block_height DESC
LIMIT 1
;

/* @name tableExists */
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE  table_schema = 'effectstream'
    AND    table_name   = 'effectstream_version_history'
);

/* @name insertPaimaEngineMigration */
INSERT INTO effectstream.effectstream_migration_history 
(name, block_height, is_system_migration) 
VALUES 
(:name!, :blockHeight!, :isSystemMigration!)
;

/* @name insertPaimaEngineVersion */
INSERT INTO effectstream.effectstream_version_history 
(app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) 
VALUES 
(:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)
;

/* @name findMigrationByName */
SELECT * FROM effectstream.effectstream_migration_history
WHERE name = :name!
AND is_system_migration = :isSystemMigration!
;

/* @name insertEngineExpectedVersion */
INSERT INTO effectstream.effectstream_expected_version 
(app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) 
VALUES 
(:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)
;

/* @name getExpectedEngineVersion */
SELECT * FROM effectstream.effectstream_expected_version
ORDER BY block_height DESC
LIMIT 1
;

/* @name getAllTableNames */
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
;

/* @name upsertSyncProtocolConfigSnapshot */
INSERT INTO effectstream.sync_protocol_config_snapshot (protocol_name, network_type, immutable_config)
VALUES (:protocolName!, :networkType!, :immutableConfig!)
ON CONFLICT (protocol_name) DO NOTHING
;

/* @name getSyncProtocolConfigSnapshot */
SELECT protocol_name, network_type, immutable_config
FROM effectstream.sync_protocol_config_snapshot
WHERE protocol_name = :protocolName!
;

/* @name updateSyncProtocolConfigSnapshot */
UPDATE effectstream.sync_protocol_config_snapshot
SET immutable_config = :immutableConfig!
WHERE protocol_name = :protocolName!
;

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
paima_engine_version_history
ORDER BY block_height DESC
LIMIT 1
;

/* @name tableExists */
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE  table_schema = 'public'
    AND    table_name   = 'paima_engine_version_history'
);

/* @name insertPaimaEngineMigration */
INSERT INTO paima_engine_migration_history 
(name, block_height, is_system_migration) 
VALUES 
(:name!, :blockHeight!, :isSystemMigration!)
;

/* @name insertPaimaEngineVersion */
INSERT INTO paima_engine_version_history 
(app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) 
VALUES 
(:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)
;

/* @name findMigrationByName */
SELECT * FROM paima_engine_migration_history
WHERE name = :name!
AND is_system_migration = :isSystemMigration!
;

/* @name insertEngineExpectedVersion */
INSERT INTO paima_engine_expected_version 
(app_version_major, app_version_minor, app_version_patch, engine_version_major, engine_version_minor, engine_version_patch, block_height) 
VALUES 
(:appVersionMajor!, :appVersionMinor!, :appVersionPatch!, :engineVersionMajor!, :engineVersionMinor!, :engineVersionPatch!, :blockHeight!)
;

/* @name getExpectedEngineVersion */
SELECT * FROM paima_engine_expected_version
ORDER BY block_height DESC
LIMIT 1
;

/* @name getAllTableNames */
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
;

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
version_major, version_minor, version_patch, block_height
FROM 
paima_engine_version_history
ORDER BY 
block_height DESC
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
(version_major, version_minor, version_patch, block_height) 
VALUES 
(:versionMajor!, :versionMinor!, :versionPatch!, :blockHeight!)
;
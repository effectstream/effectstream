CREATE SCHEMA IF NOT EXISTS effectstream;

CREATE EXTENSION IF NOT EXISTS pg_ivm;

CREATE TABLE effectstream.effectstream_expected_version (
  app_version_major INTEGER NOT NULL,
  app_version_minor INTEGER NOT NULL,
  app_version_patch INTEGER NOT NULL,
  engine_version_major INTEGER NOT NULL,
  engine_version_minor INTEGER NOT NULL,
  engine_version_patch INTEGER NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE UNIQUE INDEX effectstream_expected_version_unique_version_block_height 
ON effectstream.effectstream_expected_version 
(app_version_major, app_version_minor, app_version_patch, 
engine_version_major, engine_version_minor, engine_version_patch);

CREATE TABLE effectstream.effectstream_version_history (
  app_version_major INTEGER NOT NULL,
  app_version_minor INTEGER NOT NULL,
  app_version_patch INTEGER NOT NULL,
  engine_version_major INTEGER NOT NULL,
  engine_version_minor INTEGER NOT NULL,
  engine_version_patch INTEGER NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE UNIQUE INDEX effectstream_version_history_unique_version_block_height 
ON effectstream.effectstream_version_history 
(app_version_major, app_version_minor, app_version_patch, 
engine_version_major, engine_version_minor, engine_version_patch);

CREATE TABLE effectstream.effectstream_migration_history (
  name TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  is_system_migration BOOLEAN NOT NULL
);


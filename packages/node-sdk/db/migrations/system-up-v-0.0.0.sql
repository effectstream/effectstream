CREATE EXTENSION IF NOT EXISTS pg_ivm;

CREATE TABLE paima_engine_expected_version (
  version_major INTEGER NOT NULL,
  version_minor INTEGER NOT NULL,
  version_patch INTEGER NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE UNIQUE INDEX paima_engine_expected_version_unique_version_block_height ON paima_engine_expected_version (version_major, version_minor, version_patch);

CREATE TABLE paima_engine_version_history (
  version_major INTEGER NOT NULL,
  version_minor INTEGER NOT NULL,
  version_patch INTEGER NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE UNIQUE INDEX paima_engine_version_history_unique_version_block_height ON paima_engine_version_history (version_major, version_minor, version_patch);

CREATE TABLE paima_engine_migration_history (
  name TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  is_system_migration BOOLEAN NOT NULL
);

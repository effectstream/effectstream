import type { DBMigrations } from "@effectstream/runtime";

// User tables are created by the orchestrator's create-user-tables step
// BEFORE the sync node starts. This avoids PGLite PREPARE/CREATE TABLE
// conflicts when migrations and STM PreparedQuery run in the same session.
// The migration table is empty - tables are pre-created.
export const migrationTable: DBMigrations[] = [];

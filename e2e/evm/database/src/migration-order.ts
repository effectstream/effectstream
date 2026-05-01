import type { DBMigrations } from "@effectstream/runtime";
import createUserTables from "./migrations/create-user-tables.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  {
    name: "create-user-tables",
    sql: createUserTables,
  },
];

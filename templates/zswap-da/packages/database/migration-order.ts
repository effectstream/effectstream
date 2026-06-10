import type { DBMigrations } from "@effectstream/runtime";
import databaseSql from "./migrations/000-init.sql" with { type: "text" };
import spentSetsSql from "./migrations/001-spent-sets.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  {
    name: "000-init.sql",
    sql: databaseSql,
  },
  {
    name: "001-spent-sets.sql",
    sql: spentSetsSql,
  },
];

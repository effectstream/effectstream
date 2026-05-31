import type { DBMigrations } from "@effectstream/runtime";
import databaseSql from "./migrations/database.sql" with { type: "text" };
import addNftOwnershipSql from "./migrations/001-add-nft-ownership.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  {
    name: "database.sql",
    sql: databaseSql,
  },
  {
    name: "001-add-nft-ownership.sql",
    sql: addNftOwnershipSql,
  },
];

import type { DBMigrations } from "@effectstream/runtime";
import databaseSql from "./migrations/000-init.sql" with { type: "text" };
import spentSetsSql from "./migrations/001-spent-sets.sql" with { type: "text" };
import livenessSetsSql from "./migrations/002-liveness-sets.sql" with { type: "text" };
import tokenPricesSql from "./migrations/003-token-prices.sql" with { type: "text" };
import pairStatsSql from "./migrations/004-pair-stats.sql" with { type: "text" };
import localMigrationSql from "./migrations/local-migration.sql" with { type: "text" };
export const migrationTable: DBMigrations[] = [
  {
    name: "000-init.sql",
    sql: databaseSql,
  },
  {
    name: "001-spent-sets.sql",
    sql: spentSetsSql,
  },
  {
    name: "002-liveness-sets.sql",
    sql: livenessSetsSql,
  },
  {
    name: "003-token-prices.sql",
    sql: tokenPricesSql,
  },
  {
    name: "004-pair-stats.sql",
    sql: pairStatsSql,
  },
  {
    name: "local-migration.sql",
    sql: localMigrationSql,
  },
];

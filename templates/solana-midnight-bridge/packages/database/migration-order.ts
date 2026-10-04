import type { DBMigrations } from "@effectstream/runtime";
import initSql from "./migrations/000-init.sql" with { type: "text" };
import contractDeliverySql from "./migrations/001-contract-delivery.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  { name: "000-init.sql", sql: initSql },
  // 00058. Like every entry without a blockHeight it runs at block 1 only, i.e. on a fresh
  // database; the node refuses an older one at start (packages/node/schema-check.ts).
  { name: "001-contract-delivery.sql", sql: contractDeliverySql },
];

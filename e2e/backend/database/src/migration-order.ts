import type { DBMigrations } from "@paima/runtime";
import firstSql from "./migrations/first.sql" with { type: "text" };
import secondSql from "./migrations/second.sql" with { type: "text" };
import thirdSql from "./migrations/third.sql" with { type: "text" };
import fourthSql from "./migrations/fourth.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  {
    name: "first.sql",
    sql: firstSql,
  },
  {
    versionDependency: "0.3.10",
    name: "second.sql",
    sql: secondSql,
  },
  {
    blockHeight: 2,
    name: "third.sql",
    sql: thirdSql,
  },
  {
    blockHeight: 3,
    versionDependency: "0.3.20",
    name: "fourth.sql",
    sql: fourthSql,
  },
];

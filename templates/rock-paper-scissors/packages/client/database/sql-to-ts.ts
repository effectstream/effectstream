import { getConnection } from "@effectstream/db";
import { standAloneApplyMigrations } from "@effectstream/db-emulator";
import { migrationTable } from "./src/migration-order.ts";
import { localhostConfig } from "@rock-paper-scissors/data-types/localhostConfig";

// This helper applies Paima Engine Migrations to the database, so you can use it to generate the pgtyped files.
const db = await getConnection();
await standAloneApplyMigrations(db, migrationTable, localhostConfig as any);
console.log("✅ System & User migrations applied");

process.exit(0);

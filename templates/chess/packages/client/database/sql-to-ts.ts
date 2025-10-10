import { getConnection } from "@paimaexample/db";
import { standAloneApplyMigrations } from "@paimaexample/db-emulator";
import { migrationTable } from "./src/migration-order.ts";
import { localhostConfig } from "@chess/data-types/localhostConfig";

// This helper applies Paima Engine Migrations to the database, so you can use it to generate the pgtyped files.
const db = await getConnection();
await standAloneApplyMigrations(db, migrationTable, localhostConfig as any);
console.log("✅ System & User migrations applied");

Deno.exit(0);

import { getConnection } from "@paima/db";
import { standAloneApplyMigrations } from "@paima/db/patch-emulator";
import { migrationTable } from "./src/migration-order.ts";
import { localhostConfig } from "@e2e/data-types";

// This helper applies Paima Engine Migrations to the database, so you can use it to generate the pgtyped files.
const db = await getConnection();
await standAloneApplyMigrations(db, migrationTable, localhostConfig as any);
console.log("✅ System & User migrations applied");

Deno.exit(0);

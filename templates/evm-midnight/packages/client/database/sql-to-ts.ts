import { getConnection } from "@effectstream/db";
// TODO Update this to use the @effectstream/db-emulator package
// import { standAloneApplyMigrations } from "@effectstream/db-emulator";
import { standAloneApplyMigrations } from "./src/patch-emulator.ts";
import { migrationTable } from "./src/migration-order.ts";
import { localhostConfig } from "@example-evm-midnight/data-types/localhostConfig";

// This helper applies Paima Engine Migrations to the database, so you can use it to generate the pgtyped files.
const db = await getConnection();
await standAloneApplyMigrations(db, migrationTable, localhostConfig as any);
console.log("✅ System & User migrations applied");

Deno.exit(0);

import { getConnection } from "@effectstream/db";
import { standAloneApplyMigrations } from "@effectstream/db-emulator";
import { migrationTable } from "./src/migration-order.ts";
import { localhostConfig } from "@e2e/data-types";
import { EvmCounterPrimitive } from "@e2e/node/custom-primitive";

// This helper applies Effectstream Migrations to the database, so you can use it to generate the pgtyped files.
const db = await getConnection();
await standAloneApplyMigrations(db, migrationTable, localhostConfig as any, {
  "EVM:CUSTOM-COUNTER": EvmCounterPrimitive,
});
console.log("✅ System & User migrations applied");

Deno.exit(0);

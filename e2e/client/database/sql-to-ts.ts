import { getConnection } from "@effectstream/db";
import { standAloneApplyMigrations } from "@effectstream/db-emulator";
import { migrationTable } from "./src/migration-order.ts";
import { config } from "@e2e/data-types/config-localhost";
import { EvmCounterPrimitive } from "@e2e/node/custom-primitive";
import { exit } from "@effectstream/utils/runtime";

// This helper applies Effectstream Migrations to the database, so you can use it to generate the pgtyped files.
const db = await getConnection();
await standAloneApplyMigrations(db as any, migrationTable, config as any, {
  "EVM:CUSTOM-COUNTER": EvmCounterPrimitive,
});
console.log("✅ System & User migrations applied");

exit(0);

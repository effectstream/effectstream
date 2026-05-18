import { getConnection } from "@effectstream/db";
import { standAloneApplyMigrations } from "@effectstream/db-emulator";
import { migrationTable } from "./migration-order.ts";

const db = await getConnection();
await standAloneApplyMigrations(db, migrationTable);
console.log("✅ System & User migrations applied");

process.exit(0);

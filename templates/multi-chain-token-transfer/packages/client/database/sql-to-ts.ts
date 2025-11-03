import { getConnection } from "@effectstream/db";
// TODO Update this to use the @effectstream/db-emulator package
// import { standAloneApplyMigrations } from "@effectstream/db-emulator";
import { standAloneApplyMigrations } from "./src/patch-emulator.ts";
import { migrationTable } from "./src/migration-order.ts";
import { localhostConfig } from "@multi-chain-transfer/data-types/localhostConfig";
import { MCTErc1155Primitive } from "@multi-chain-transfer/custom-primitive-mct-erc1155/erc1155-primitive";

// This helper applies Paima Engine Migrations to the database, so you can use it to generate the pgtyped files.
const db = await getConnection();
await standAloneApplyMigrations(db, migrationTable, localhostConfig as any, {
  "EVM:MCT_ERC1155": MCTErc1155Primitive,
});
console.log("✅ System & User migrations applied");

Deno.exit(0);

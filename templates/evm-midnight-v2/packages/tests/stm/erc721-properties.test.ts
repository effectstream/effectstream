import { assertSQL } from "../helpers.ts";
import type { Client } from "pg";

export async function erc721PropertiesTest(db: Client) {
  await assertSQL(
    "evm_midnight_properties table exists and has expected columns",
    db,
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'evm_midnight_properties'
     ORDER BY ordinal_position`,
    (rows) => rows.length > 0,
    (rows) => {
      const cols = rows.map((r: any) => r.column_name);
      return cols.includes("property_name") &&
        cols.includes("value") &&
        cols.includes("token_id") &&
        cols.includes("contract_address");
    },
  );
}

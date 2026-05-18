import type { Client } from "pg";
import { assert, assertSQL } from "../helpers.ts";

export async function ballotStateTest(db: Client) {
  await assertSQL(
    "Midnight primitive is receiving data",
    db,
    "SELECT * FROM effectstream.primitive_accounting WHERE primitive_name = 'MidnightContractState'",
    (rows) => rows.length > 0,
    (rows) => rows.length >= 1,
  );
}

import { assertSQL } from "../helpers.ts";
import type { Client } from "pg";

export async function cardanoTransferTest(db: Client) {
  await assertSQL(
    "Cardano transfer events indexed from initial topup",
    db,
    `SELECT * FROM events WHERE chain = 'cardano'`,
    (rows) => rows.length > 0,
    (rows) => rows.every((r: any) => r.event_type === "ada_transfer"),
  );
}

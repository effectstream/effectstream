import { assertSQL } from "../helpers.ts";
import type { Client } from "pg";

export async function poolDelegationTest(db: Client) {
  await assertSQL(
    "delegations table exists and is accessible",
    db,
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'delegations'
    ) AS exists`,
    (rows) => rows.length > 0,
    (rows) => (rows[0] as any).exists === true,
  );

  await assertSQL(
    "pool_stats table has genesis pool entry",
    db,
    `SELECT * FROM pool_stats WHERE pool = '7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57'`,
    (rows) => rows.length > 0,
    (rows) =>
      (rows[0] as any).pool ===
      "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57",
  );
}

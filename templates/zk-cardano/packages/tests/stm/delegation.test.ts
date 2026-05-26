import type { Client } from "pg";
import { assert, assertSQL } from "../helpers.ts";

export async function delegationTest(db: Client) {
  await assertSQL(
    "eligible_voters table exists",
    db,
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eligible_voters')",
    (rows) => rows.length > 0 && (rows[0] as any).exists === true,
    (rows) => (rows[0] as any).exists === true,
  );

  await assertSQL(
    "eligible_voters has at least 1 row",
    db,
    "SELECT * FROM eligible_voters",
    (rows) => rows.length > 0,
    (rows) => rows.length >= 1,
  );

  await assertSQL(
    "eligible_voters row has correct pool hash",
    db,
    "SELECT * FROM eligible_voters LIMIT 1",
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.pool === "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57";
    },
  );

  await assertSQL(
    "eligible_voters row has valid fields",
    db,
    "SELECT * FROM eligible_voters LIMIT 1",
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return (
        row.staking_credential &&
        row.staking_credential.length > 0 &&
        row.epoch >= 0 &&
        row.block_height > 0
      );
    },
  );

  await assertSQL(
    "primitive_accounting has CardanoPoolDelegation",
    db,
    "SELECT * FROM effectstream.primitive_accounting WHERE primitive_name = 'CardanoPoolDelegation'",
    (rows) => rows.length > 0,
    (rows) => rows.length >= 1,
  );
}

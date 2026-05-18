import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";

const GENESIS_POOL = "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57";

export async function poolDelegationTest(db: Client): Promise<void> {
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  await assertSQL<{ primitive_name: string; payload: any }>(
    "PoolDelegation: delegation captured in primitive_accounting",
    db,
    `SELECT primitive_name, payload
     FROM effectstream.primitive_accounting
     WHERE primitive_name = 'CardanoPoolDelegation'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const payload = res.rows[0].payload;
      return (
        payload.address != null &&
        payload.address.length > 0 &&
        payload.pool === GENESIS_POOL &&
        typeof payload.epoch === "number" &&
        payload.epoch >= 0
      );
    },
  );

  await assertSQL<{ address: string; pool: string; epoch: number }>(
    "PoolDelegation: STM wrote cardano_delegations",
    db,
    `SELECT address, pool, epoch FROM cardano_delegations ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows[0];
      return row.pool === GENESIS_POOL && row.epoch >= 0;
    },
  );
}

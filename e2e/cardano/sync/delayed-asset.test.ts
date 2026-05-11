import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";

export async function delayedAssetTest(db: Client): Promise<void> {
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  await assertSQL<{ primitive_name: string; payload: any }>(
    "DelayedAsset: UTXO creation captured in primitive_accounting",
    db,
    `SELECT primitive_name, payload
     FROM effectstream.primitive_accounting
     WHERE primitive_name = 'CardanoDelayedAsset'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const payload = res.rows[0].payload;
      return (
        payload.txId != null &&
        payload.amount != null &&
        payload.amount !== "null" &&
        payload.policyId != null &&
        payload.outputIndex != null
      );
    },
  );

  await assertSQL<{
    tx_id: string;
    amount: string | null;
    address: string;
  }>(
    "DelayedAsset: STM wrote cardano_asset_utxos",
    db,
    `SELECT tx_id, amount, address FROM cardano_asset_utxos ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const creation = res.rows[0];
      return creation.tx_id.length > 0 && creation.amount != null;
    },
  );
}

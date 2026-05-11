import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";

export async function mintBurnTest(db: Client): Promise<void> {
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  await assertSQL<{ primitive_name: string; payload: any }>(
    "MintBurn: mint event captured in primitive_accounting",
    db,
    `SELECT primitive_name, payload
     FROM effectstream.primitive_accounting
     WHERE primitive_name = 'CardanoMintBurn'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows[0];
      const payload = row.payload;
      return (
        payload.txId != null &&
        payload.txId.length > 0 &&
        Array.isArray(payload.assets) &&
        payload.assets.length > 0 &&
        payload.assets[0].amount != null
      );
    },
  );

  await assertSQL<{ primitive_name: string; payload: any }>(
    "MintBurn: burn event captured in primitive_accounting",
    db,
    `SELECT primitive_name, payload
     FROM effectstream.primitive_accounting
     WHERE primitive_name = 'CardanoMintBurn'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 2,
    (res) => {
      const burnRow = res.rows[1];
      const assets = burnRow.payload.assets;
      return Array.isArray(assets) && assets.length > 0;
    },
  );

  await assertSQL<{
    tx_id: string;
    assets: any;
    input_addresses: any;
    output_addresses: any;
  }>(
    "MintBurn: STM wrote cardano_mint_burn_events",
    db,
    `SELECT tx_id, assets, input_addresses, output_addresses
     FROM cardano_mint_burn_events
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 2,
    (res) => {
      const mint = res.rows[0];
      const burn = res.rows[1];
      return mint.tx_id.length > 0 && burn.tx_id.length > 0;
    },
  );
}

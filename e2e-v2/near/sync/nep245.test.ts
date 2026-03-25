/**
 * NEAR:NEP245 multi-token primitive test.
 *
 * STATUS: STUB — requires NEP-245 MT contract deployed to sandbox
 *
 * Should verify:
 * 1. Deploy a NEP-245 multi-token contract
 * 2. Mint tokens (multiple token IDs with different amounts)
 * 3. Transfer tokens between accounts
 * 4. Verify primitive_accounting captures mt_transfer events
 * 5. Verify nep245_balance dynamic table tracks correct balances per (token_id, account_id)
 * 6. Verify batch transfers (parallel token_ids[] and amounts[]) are handled
 *
 * Requires:
 * - A compiled NEP-245 MT contract WASM
 * - Built with `cargo near build non-reproducible-wasm` using Rust 1.86
 * - Config must include a NEAR:NEP245 primitive watching the MT contract
 */
import { assertSQL } from "@e2e-v2/engine";
import type { Client } from "pg";

export async function runNep245Test(db: Client): Promise<void> {
  // TODO: Deploy NEP-245 MT contract to sandbox
  // TODO: Mint multi-tokens via mt_mint
  // TODO: Transfer via mt_transfer / mt_batch_transfer

  await assertSQL<{ primitive_name: string }>(
    "NEAR:NEP245 — primitive_accounting has mt_transfer event",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting WHERE primitive_name = 'NearMT' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.primitive_name === "NearMT",
  );

  // TODO: Verify nep245_balance dynamic table
  // await assertSQL(
  //   "NEAR:NEP245 — nep245_balance tracks correct balance per token_id",
  //   db,
  //   `SELECT token_id, account_id, amount FROM primitives.nep245_balance_view_nearmt LIMIT 10;`,
  //   (res) => res.rows.length >= 1,
  //   (res) => BigInt(res.rows[0]?.amount) > 0n,
  // );
}

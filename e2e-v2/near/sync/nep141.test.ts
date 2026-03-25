/**
 * NEAR:NEP141 fungible token primitive test.
 *
 * STATUS: STUB — requires NEP-141 FT contract deployed to sandbox
 *
 * Should verify:
 * 1. Deploy a NEP-141 FT contract (e.g., wrap.test.near)
 * 2. Mint tokens to an account
 * 3. Transfer tokens between accounts
 * 4. Verify primitive_accounting captures ft_transfer events
 * 5. Verify nep141_balance dynamic table tracks correct balances
 *
 * Requires:
 * - A compiled NEP-141 FT contract WASM (e.g., from near-sdk-rs examples)
 * - Built with `cargo near build non-reproducible-wasm` using Rust 1.86
 * - Config must include a NEAR:NEP141 primitive watching the FT contract
 */
import { assertSQL } from "@e2e-v2/engine";
import type { Client } from "pg";

export async function runNep141Test(db: Client): Promise<void> {
  // TODO: Deploy NEP-141 FT contract to sandbox
  // TODO: Mint tokens via ft_transfer_call or storage_deposit + ft_transfer
  // TODO: Transfer tokens between test accounts

  await assertSQL<{ primitive_name: string }>(
    "NEAR:NEP141 — primitive_accounting has ft_transfer event",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting WHERE primitive_name = 'NearFT' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.primitive_name === "NearFT",
  );

  // TODO: Verify nep141_balance dynamic table
  // await assertSQL(
  //   "NEAR:NEP141 — nep141_balance tracks correct balance",
  //   db,
  //   `SELECT account_id, balance FROM primitives.nep141_balance_view_nearft LIMIT 10;`,
  //   (res) => res.rows.length >= 1,
  //   (res) => BigInt(res.rows[0]?.balance) > 0n,
  // );
}

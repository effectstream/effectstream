/**
 * NEAR:NEP171 non-fungible token primitive test.
 *
 * STATUS: STUB — requires NEP-171 NFT contract deployed to sandbox
 *
 * Should verify:
 * 1. Deploy a NEP-171 NFT contract
 * 2. Mint an NFT to an account
 * 3. Transfer the NFT to another account
 * 4. Verify primitive_accounting captures nft_transfer events
 * 5. Verify nep171_owner dynamic table tracks correct ownership
 * 6. Verify batch token_ids are handled (multiple NFTs in one event)
 *
 * Requires:
 * - A compiled NEP-171 NFT contract WASM
 * - Built with `cargo near build non-reproducible-wasm` using Rust 1.86
 * - Config must include a NEAR:NEP171 primitive watching the NFT contract
 */
import { assertSQL } from "@e2e-v2/engine";
import type { Client } from "pg";

export async function runNep171Test(db: Client): Promise<void> {
  // TODO: Deploy NEP-171 NFT contract to sandbox
  // TODO: Mint NFT via nft_mint
  // TODO: Transfer NFT via nft_transfer

  await assertSQL<{ primitive_name: string }>(
    "NEAR:NEP171 — primitive_accounting has nft_transfer event",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting WHERE primitive_name = 'NearNFT' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.primitive_name === "NearNFT",
  );

  // TODO: Verify nep171_owner dynamic table
  // await assertSQL(
  //   "NEAR:NEP171 — nep171_owner tracks correct ownership",
  //   db,
  //   `SELECT token_id, current_owner FROM primitives.nep171_owner_view_nearnft LIMIT 10;`,
  //   (res) => res.rows.length >= 1,
  //   (res) => res.rows[0]?.current_owner != null,
  // );
}

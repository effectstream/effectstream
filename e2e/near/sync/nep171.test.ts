/**
 * NEAR:NEP171 primitive test.
 *
 * Verifies that a NEP-171 nft_transfer event emitted by the test contract is:
 *   1. Captured by the NEAR:NEP171 primitive and stored in primitive_accounting.
 *   2. Reflected in the IVM owner table (primitives.nep171_owner_intermediate_*)
 *      with token_id mapped to the new owner.
 *   3. Visible in the owner view (primitives.nep171_owner_view_*) for that
 *      token_id.
 *
 * The test contract emits a single nft_transfer via emit_nep171_transfer during
 * sandbox init (see deploy-and-call.ts). Unique per-run identifiers are written
 * to build/nep171-*.txt so assertions can pin to this run's data.
 */
import { assertSQL } from "@e2e/engine";
import { readFileSync } from "fs";
import path from "path";
import type { Client } from "pg";

const IVM_VIEW = "primitives.nep171_owner_view_nearnep171transfer";
const IVM_INTERMEDIATE = "primitives.nep171_owner_intermediate_nearnep171transfer";

export async function runNep171Test(db: Client): Promise<void> {
  const buildDir = path.resolve(
    import.meta.dirname!,
    "../../shared/contracts/near/build",
  );
  const from = readFileSync(path.join(buildDir, "nep171-from.txt"), "utf-8").trim();
  const to = readFileSync(path.join(buildDir, "nep171-to.txt"), "utf-8").trim();
  const tokenId = readFileSync(path.join(buildDir, "nep171-token-id.txt"), "utf-8").trim();

  await assertSQL<{ primitive_name: string; payload: any }>(
    `NEAR:NEP171 — primitive_accounting has nft_transfer for token_id=${tokenId}`,
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearNep171Transfer' LIMIT 20;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const outer = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        const p = outer?.payload ?? outer;
        return (
          p?.old_owner_id === from &&
          p?.new_owner_id === to &&
          p?.token_id === tokenId &&
          p?.isBurn === false
        );
      });
      return row != null;
    },
  );

  await assertSQL<{ token_id: string; current_owner: string }>(
    `NEAR:NEP171 — intermediate owner table maps ${tokenId} to ${to}`,
    db,
    `SELECT token_id, current_owner
     FROM ${IVM_INTERMEDIATE}
     WHERE primitive_name = 'NearNep171Transfer'
       AND token_id = '${tokenId}';`,
    (res) => res.rows.length === 1,
    (res) => res.rows[0]!.current_owner === to,
  );

  await assertSQL<{ token_id: string; current_owner: string }>(
    `NEAR:NEP171 — owner view shows ${tokenId} owned by ${to}`,
    db,
    `SELECT token_id, current_owner
     FROM ${IVM_VIEW}
     WHERE primitive_name = 'NearNep171Transfer'
       AND token_id = '${tokenId}';`,
    (res) => res.rows.length === 1,
    (res) => res.rows[0]!.current_owner === to,
  );
}

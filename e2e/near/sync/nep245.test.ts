/**
 * NEAR:NEP245 primitive test.
 *
 * Verifies that a NEP-245 mt_transfer event emitted by the test contract is:
 *   1. Captured by the NEAR:NEP245 primitive and stored in primitive_accounting.
 *   2. Reflected in the IVM balance table (primitives.nep245_balance_intermediate_*)
 *      with correct debit/credit per (token_id, account_id).
 *   3. Visible in the balance view (primitives.nep245_balance_view_*) for the
 *      recipient with positive amount.
 *
 * The test contract emits a single mt_transfer via emit_nep245_transfer during
 * sandbox init (see deploy-and-call.ts). Unique per-run identifiers are written
 * to build/nep245-*.txt so assertions can pin to this run's data.
 */
import { assertSQL } from "@e2e/engine";
import { readFileSync } from "fs";
import path from "path";
import type { Client } from "pg";

const IVM_VIEW = "primitives.nep245_balance_view_nearnep245transfer";
const IVM_INTERMEDIATE = "primitives.nep245_balance_intermediate_nearnep245transfer";

export async function runNep245Test(db: Client): Promise<void> {
  const buildDir = path.resolve(
    import.meta.dirname!,
    "../../shared/contracts/near/build",
  );
  const from = readFileSync(path.join(buildDir, "nep245-from.txt"), "utf-8").trim();
  const to = readFileSync(path.join(buildDir, "nep245-to.txt"), "utf-8").trim();
  const tokenId = readFileSync(path.join(buildDir, "nep245-token-id.txt"), "utf-8").trim();
  const amount = readFileSync(path.join(buildDir, "nep245-amount.txt"), "utf-8").trim();

  await assertSQL<{ primitive_name: string; payload: any }>(
    `NEAR:NEP245 — primitive_accounting has mt_transfer for token_id=${tokenId}`,
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearNep245Transfer' LIMIT 20;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const outer = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        const p = outer?.payload ?? outer;
        return (
          p?.old_owner_id === from &&
          p?.new_owner_id === to &&
          p?.token_id === tokenId &&
          p?.amount === amount &&
          p?.isMint === false &&
          p?.isBurn === false
        );
      });
      return row != null;
    },
  );

  await assertSQL<{ token_id: string; account_id: string; amount: string }>(
    `NEAR:NEP245 — intermediate balance debits ${from} and credits ${to} for ${tokenId}`,
    db,
    `SELECT token_id, account_id, amount::text AS amount
     FROM ${IVM_INTERMEDIATE}
     WHERE primitive_name = 'NearNep245Transfer'
       AND token_id = '${tokenId}'
       AND account_id IN ('${from}', '${to}')
     ORDER BY account_id;`,
    (res) => res.rows.length === 2,
    (res) => {
      const rows = new Map(res.rows.map((r) => [r.account_id, BigInt(r.amount)]));
      return (
        rows.get(from) === -BigInt(amount) &&
        rows.get(to) === BigInt(amount)
      );
    },
  );

  await assertSQL<{ token_id: string; account_id: string; amount: string }>(
    `NEAR:NEP245 — balance view shows ${to} holding ${amount} of ${tokenId}`,
    db,
    `SELECT token_id, account_id, amount::text AS amount
     FROM ${IVM_VIEW}
     WHERE primitive_name = 'NearNep245Transfer'
       AND token_id = '${tokenId}'
       AND account_id = '${to}';`,
    (res) => res.rows.length === 1,
    (res) => BigInt(res.rows[0]!.amount) === BigInt(amount),
  );
}

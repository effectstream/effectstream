/**
 * NEAR:NEP141 primitive test.
 *
 * Verifies that a NEP-141 ft_transfer event emitted by the test contract is:
 *   1. Captured by the NEAR:NEP141 primitive and stored in primitive_accounting.
 *   2. Reflected in the IVM balance table (primitives.nep141_balance_intermediate_*)
 *      with the correct debit/credit for the from/to accounts.
 *   3. Visible in the balance view (primitives.nep141_balance_view_*) for any
 *      account whose net balance is positive.
 *
 * The test contract emits a single ft_transfer via emit_nep141_transfer during
 * sandbox init (see deploy-and-call.ts). Unique per-run identifiers are written
 * to build/nep141-*.txt so assertions can pin to this run's data.
 */
import { assertSQL } from "@e2e-v2/engine";
import { readFileSync } from "fs";
import path from "path";
import type { Client } from "pg";

const IVM_VIEW = "primitives.nep141_balance_view_nearnep141transfer";
const IVM_INTERMEDIATE = "primitives.nep141_balance_intermediate_nearnep141transfer";

export async function runNep141Test(db: Client): Promise<void> {
  const buildDir = path.resolve(
    import.meta.dirname!,
    "../../shared/contracts/near/build",
  );
  const from = readFileSync(path.join(buildDir, "nep141-from.txt"), "utf-8").trim();
  const to = readFileSync(path.join(buildDir, "nep141-to.txt"), "utf-8").trim();
  const amount = readFileSync(path.join(buildDir, "nep141-amount.txt"), "utf-8").trim();

  await assertSQL<{ primitive_name: string; payload: any }>(
    `NEAR:NEP141 — primitive_accounting has ft_transfer with amount=${amount}`,
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearNep141Transfer' LIMIT 20;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const outer = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        const p = outer?.payload ?? outer;
        return (
          p?.old_owner_id === from &&
          p?.new_owner_id === to &&
          p?.amount === amount
        );
      });
      return row != null;
    },
  );

  await assertSQL<{ account_id: string; balance: string }>(
    `NEAR:NEP141 — intermediate balance table debits ${from} and credits ${to}`,
    db,
    `SELECT account_id, balance::text AS balance
     FROM ${IVM_INTERMEDIATE}
     WHERE primitive_name = 'NearNep141Transfer'
       AND account_id IN ('${from}', '${to}')
     ORDER BY account_id;`,
    (res) => res.rows.length === 2,
    (res) => {
      const rows = new Map(res.rows.map((r) => [r.account_id, BigInt(r.balance)]));
      return (
        rows.get(from) === -BigInt(amount) &&
        rows.get(to) === BigInt(amount)
      );
    },
  );

  await assertSQL<{ account_id: string; balance: string }>(
    `NEAR:NEP141 — balance view shows ${to} with positive balance ${amount}`,
    db,
    `SELECT account_id, balance::text AS balance
     FROM ${IVM_VIEW}
     WHERE primitive_name = 'NearNep141Transfer'
       AND account_id = '${to}';`,
    (res) => res.rows.length >= 1,
    (res) => BigInt(res.rows[0]!.balance) === BigInt(amount),
  );
}

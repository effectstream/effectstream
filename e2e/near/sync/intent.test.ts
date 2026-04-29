/**
 * NEAR:Intent settlement primitive test.
 *
 * STATUS: IMPLEMENTED
 *
 * Verifies that a DIP-4 token_diff event emitted by a mock Verifier contract
 * is captured by the NEAR:Intent primitive and stored in primitive_accounting
 * with the correct account_id, intent_hash, and token diffs.
 *
 * Requires: test_event_contract.wasm deployed to test.near with settle_intent method
 * (done by deploy-and-call.ts)
 */
import { assertSQL } from "@e2e/engine";
import { readFileSync } from "fs";
import path from "path";
import type { Client } from "pg";

export async function runIntentTest(db: Client): Promise<void> {
  const buildDir = path.resolve(import.meta.dirname!, "../../shared/contracts/near/build");
  const expectedHash = readFileSync(path.join(buildDir, "intent-hash.txt"), "utf-8").trim();
  const expectedAccount = readFileSync(path.join(buildDir, "intent-account.txt"), "utf-8").trim();
  console.log(`  Expected intent: account="${expectedAccount}" hash="${expectedHash}"`);

  // Verify primitive_accounting captured the DIP-4 token_diff event
  await assertSQL<{ primitive_name: string; payload: any }>(
    `NEAR:Intent — primitive_accounting has token_diff for intent "${expectedHash}"`,
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearIntentSettlement' LIMIT 10;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        return p?.intent_hash === expectedHash && p?.account_id === expectedAccount;
      });
      if (row) {
        const p = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        console.log("  Found intent payload:", JSON.stringify(p));
      }
      return row != null;
    },
  );

  // Verify the token_diffs contain both tokens from the settlement
  await assertSQL<{ primitive_name: string; payload: any }>(
    "NEAR:Intent — token_diffs contain nep141:wrap.near and nep245:game.near:legendary-sword",
    db,
    `SELECT payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearIntentSettlement' LIMIT 10;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        if (p?.intent_hash !== expectedHash) return false;
        const diffs = p?.token_diffs as { token_id: string; amount: string }[];
        if (!Array.isArray(diffs)) return false;
        const hasWrap = diffs.some(d => d.token_id === "nep141:wrap.near" && d.amount === "-5000000000000000000000000");
        const hasSword = diffs.some(d => d.token_id === "nep245:game.near:legendary-sword" && d.amount === "1");
        return hasWrap && hasSword;
      });
      return row != null;
    },
  );

  // Verify the near_intent_settlement IVM dynamic table
  await assertSQL<{ intent_hash: string; account_id: string; token_id: string; amount: string }>(
    "NEAR:Intent — IVM settlement table has token diffs",
    db,
    `SELECT intent_hash, account_id, token_id, amount::text as amount
     FROM primitives.near_intent_settlement_intermediate_nearintentsettlement LIMIT 10;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const wrapRow = res.rows.find((r: any) =>
        r.intent_hash === expectedHash && r.token_id === "nep141:wrap.near"
      );
      const swordRow = res.rows.find((r: any) =>
        r.intent_hash === expectedHash && r.token_id === "nep245:game.near:legendary-sword"
      );
      if (wrapRow) console.log("  IVM wrap.near:", JSON.stringify(wrapRow));
      if (swordRow) console.log("  IVM sword:", JSON.stringify(swordRow));
      return wrapRow != null && swordRow != null;
    },
  );
}

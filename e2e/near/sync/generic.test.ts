/**
 * NEAR:Generic primitive test.
 *
 * STATUS: IMPLEMENTED
 *
 * Verifies that a custom NEP-297 event emitted by a contract deployed to the
 * sandbox is captured by the NEAR:Generic primitive and stored in
 * primitive_accounting with the exact unique message written during this run.
 *
 * Requires: test_event_contract.wasm deployed to test.near (done by deploy-and-call.ts)
 */
import { assertSQL } from "@e2e/engine";
import { readFileSync } from "fs";
import path from "path";
import type { Client } from "pg";

export async function runGenericTest(db: Client): Promise<void> {
  const messagePath = path.resolve(import.meta.dirname!, "../../shared/contracts/near/build/test-message.txt");
  const expectedMessage = readFileSync(messagePath, "utf-8").trim();
  console.log(`  Expected message: "${expectedMessage}"`);

  await assertSQL<{ primitive_name: string; payload: any }>(
    `NEAR:Generic — primitive_accounting contains unique message "${expectedMessage}"`,
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearGenericEvent' LIMIT 10;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows.find((r: any) => {
        const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        return payload?.payload?.message === expectedMessage;
      });
      if (row) {
        const p = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        console.log("  Found event payload:", JSON.stringify(p));
      }
      return row != null;
    },
  );
}

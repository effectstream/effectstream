/**
 * NEAR:AccountWatch primitive test.
 *
 * STATUS: STUB — requires fetcher changes to capture non-event execution outcomes
 *
 * Should verify:
 * 1. Configure an AccountWatch primitive for a specific NEAR account (e.g., test.near)
 * 2. Send a transaction to that account (function call or transfer)
 * 3. Verify primitive_accounting captures the execution outcome
 * 4. Verify payload contains signer_id, receiver_id, method_name, args, deposit, status
 *
 * Note: The current fetcher only extracts NEP-297 events from logs. AccountWatch
 * needs the fetcher to also emit raw execution outcome data for transactions
 * targeting the watched account, even when no NEP-297 event is logged.
 * This requires extending NearFetcher.readPrimitives to handle AccountWatch
 * primitives separately from event-based primitives.
 *
 * Requires:
 * - Fetcher enhancement to capture raw execution outcomes (not just NEP-297 events)
 * - Config must include a NEAR:AccountWatch primitive
 */
import { assertSQL } from "@e2e-v2/engine";
import type { Client } from "pg";

export async function runAccountWatchTest(db: Client): Promise<void> {
  // TODO: Extend NearFetcher to handle AccountWatch primitives
  // TODO: Send a transaction to the watched account
  // TODO: Verify the execution outcome is captured

  await assertSQL<{ primitive_name: string }>(
    "NEAR:AccountWatch — primitive_accounting has execution outcome for watched account",
    db,
    `SELECT primitive_name FROM effectstream.primitive_accounting WHERE primitive_name = 'NearAccountWatch' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0]?.primitive_name === "NearAccountWatch",
  );

  // TODO: Verify payload fields
  // await assertSQL(
  //   "NEAR:AccountWatch — payload contains transaction details",
  //   db,
  //   `SELECT payload FROM effectstream.primitive_accounting WHERE primitive_name = 'NearAccountWatch' LIMIT 1;`,
  //   (res) => res.rows.length >= 1,
  //   (res) => {
  //     const p = typeof res.rows[0]?.payload === "string" ? JSON.parse(res.rows[0].payload) : res.rows[0]?.payload;
  //     return p?.signer_id != null && p?.receiver_id != null && p?.method_name != null;
  //   },
  // );
}

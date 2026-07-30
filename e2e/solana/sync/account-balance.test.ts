import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";
import { WATCHED_BALANCE_ADDRESS } from "../config.ts";

/**
 * Real sync-pipeline assertion for the SOLANA:AccountBalance primitive: Phase 1
 * airdrops 2 SOL to WATCHED_BALANCE_ADDRESS; the primitive captures that
 * address's postBalance and the state machine writes it to solana_balance_events.
 * Waits (with retry) for the row to land and checks the synced lamports.
 */
export async function runAccountBalanceTest(db: Client): Promise<void> {
  await assertSQL<{ count: number; lamports: string | null }>(
    "Solana: sync captured the watched address balance into solana_balance_events",
    db,
    `SELECT COUNT(*)::int AS count, MAX(lamports) AS lamports
FROM solana_balance_events WHERE address = '${WATCHED_BALANCE_ADDRESS}';`,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
    (res) =>
      (res.rows[0]?.count ?? 0) >= 1 &&
      BigInt(res.rows[0]?.lamports ?? "0") >= 2_000_000_000n,
  );

  console.log("Solana account balance sync test passed.\n");
}

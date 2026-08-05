import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/**
 * Real sync-pipeline assertion: the wallet/airdrop/transfer activity from
 * Phase 1 touches the System Program, which the SolanaProgramLog primitive
 * captures and the state machine writes into solana_log_events. This waits
 * (with retry) for at least one such row to actually land — proving the
 * framework read the Solana chain end-to-end, not just that a table exists.
 */
export async function runProgramLogTest(db: Client): Promise<void> {
  await assertSQL<{ count: number }>(
    "Solana: sync captured System Program logs into solana_log_events",
    db,
    `SELECT COUNT(*)::int AS count FROM solana_log_events WHERE program_id = '${SYSTEM_PROGRAM}';`,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
  );

  console.log("Solana program log sync test passed.\n");
}

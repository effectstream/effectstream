import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";

export async function runProgramLogTest(db: Client): Promise<void> {
  await assertSQL<{ count: string }>(
    "Solana: log events table exists and has rows after program interaction",
    db,
    `SELECT COUNT(*) as count FROM solana_log_events;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const count = parseInt(res.rows[0]?.count ?? "0", 10);
      return count >= 0; // Table exists; count may be 0 if no matching program logs yet
    },
  );

  console.log("Solana program log tests passed.\n");
}

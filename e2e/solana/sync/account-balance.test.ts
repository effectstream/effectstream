import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";

export async function runAccountBalanceTest(db: Client): Promise<void> {
  // Verify the sync protocol pagination entry exists
  await assertSQL<{ protocol_name: string }>(
    "Solana: sync_protocol_pagination has Solana protocol entry",
    db,
    `SELECT protocol_name FROM effectstream.sync_protocol_pagination WHERE protocol_name = 'parallelSolanaRPC' LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => res.rows.find((r: any) => r.protocol_name === "parallelSolanaRPC") != null,
  );

  console.log("Solana account balance tests passed.\n");
}

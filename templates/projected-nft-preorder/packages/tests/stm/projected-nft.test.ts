import { assertSQL } from "../helpers.ts";
import type { Client } from "pg";

export async function projectedNftTest(db: Client): Promise<void> {
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  await assertSQL<{ status: string; owner_address: string; policy_id: string }>(
    "ProjectedNFT: Lock event written to nft_locks",
    db,
    `SELECT status, owner_address, policy_id
     FROM nft_locks
     WHERE status = 'Lock'
     ORDER BY id ASC
     LIMIT 1;`,
    (rows) => rows.length >= 1,
    (rows) => {
      const row = rows[0];
      return (
        row.status === "Lock" &&
        row.owner_address != null &&
        row.owner_address !== "" &&
        row.policy_id != null &&
        row.policy_id !== ""
      );
    },
  );

  await assertSQL<{ status: string; for_how_long: string | null }>(
    "ProjectedNFT: Unlocking event written to nft_locks",
    db,
    `SELECT status, for_how_long
     FROM nft_locks
     WHERE status = 'Unlocking'
     ORDER BY id ASC
     LIMIT 1;`,
    (rows) => rows.length >= 1,
    (rows) => {
      return (
        rows[0].status === "Unlocking" &&
        rows[0].for_how_long != null &&
        rows[0].for_how_long !== ""
      );
    },
  );

  await assertSQL<{ status: string }>(
    "ProjectedNFT: Claim event written to nft_locks",
    db,
    `SELECT status
     FROM nft_locks
     WHERE status = 'Claim'
     ORDER BY id ASC
     LIMIT 1;`,
    (rows) => rows.length >= 1,
    (rows) => rows[0].status === "Claim",
  );

  await assertSQL<{ count: string }>(
    "ProjectedNFT: All 3 lifecycle events recorded",
    db,
    `SELECT COUNT(DISTINCT status)::TEXT as count
     FROM nft_locks
     WHERE status IN ('Lock', 'Unlocking', 'Claim');`,
    (rows) => true,
    (rows) => parseInt(rows[0].count, 10) === 3,
  );
}

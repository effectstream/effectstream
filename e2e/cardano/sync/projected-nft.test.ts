import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";

export async function projectedNftTest(db: Client): Promise<void> {
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  // Verify Lock event in primitive_accounting
  await assertSQL<{ primitive_name: string; payload: any }>(
    "ProjectedNFT: Lock event captured in primitive_accounting",
    db,
    `SELECT primitive_name, payload
     FROM effectstream.primitive_accounting
     WHERE primitive_name = 'CardanoProjectedNFT'
       AND payload->>'status' = 'Lock'
     ORDER BY id ASC
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const payload = res.rows[0].payload;
      return (
        payload.ownerAddress != null &&
        payload.ownerAddress !== "" &&
        payload.status === "Lock" &&
        payload.currentTxId != null &&
        payload.currentTxId !== "" &&
        (payload.previousTxId == null || payload.previousTxId === "") &&
        payload.policyId != null &&
        payload.policyId !== ""
      );
    },
  );

  // Verify Unlocking event
  await assertSQL<{ primitive_name: string; payload: any }>(
    "ProjectedNFT: Unlocking event captured in primitive_accounting",
    db,
    `SELECT primitive_name, payload
     FROM effectstream.primitive_accounting
     WHERE primitive_name = 'CardanoProjectedNFT'
       AND payload->>'status' = 'Unlocking'
     ORDER BY id ASC
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const payload = res.rows[0].payload;
      return (
        payload.status === "Unlocking" &&
        payload.previousTxId != null &&
        payload.previousTxId !== "" &&
        payload.forHowLong != null &&
        payload.forHowLong !== ""
      );
    },
  );

  // Verify Claim event
  await assertSQL<{ primitive_name: string; payload: any }>(
    "ProjectedNFT: Claim event captured in primitive_accounting",
    db,
    `SELECT primitive_name, payload
     FROM effectstream.primitive_accounting
     WHERE primitive_name = 'CardanoProjectedNFT'
       AND payload->>'status' = 'Claim'
     ORDER BY id ASC
     LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const payload = res.rows[0].payload;
      return (
        payload.status === "Claim" &&
        payload.previousTxId != null &&
        payload.previousTxId !== "" &&
        payload.currentTxId != null &&
        payload.currentTxId !== ""
      );
    },
  );

  // Verify STM custom table has all 3 events
  await assertSQL<{
    owner_address: string;
    status: string;
    current_tx_id: string;
    previous_tx_id: string | null;
  }>(
    "ProjectedNFT: STM wrote all 3 events to cardano_projected_nfts",
    db,
    `SELECT owner_address, status, current_tx_id, previous_tx_id
     FROM cardano_projected_nfts
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 3,
    (res) => {
      const statuses = res.rows.map((r) => r.status);
      return (
        statuses.includes("Lock") &&
        statuses.includes("Unlocking") &&
        statuses.includes("Claim")
      );
    },
  );

  // Verify IVM: after Claim, the intermediate table should be empty (NFT was claimed back)
  await assertSQL<{ count: string }>(
    "ProjectedNFT: IVM intermediate table empty after Claim",
    db,
    `SELECT COUNT(*)::TEXT as count
     FROM primitives.cardano_projected_nft_intermediate_cardanoprojectednft
     WHERE primitive_name = 'CardanoProjectedNFT';`,
    (res) => true,
    (res) => {
      return parseInt(res.rows[0].count, 10) === 0;
    },
  );
}

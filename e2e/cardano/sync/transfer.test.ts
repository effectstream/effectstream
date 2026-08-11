import { assertSQL } from "@e2e/engine";
import type { Client } from "pg";

export async function transferTest(db: Client): Promise<void> {
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  await assertSQL<{ primitive_name: string; payload: any }>(
    "Transfer: transaction captured in primitive_accounting",
    db,
    `SELECT primitive_name, payload
     FROM effectstream.primitive_accounting
     WHERE primitive_name = 'CardanoTransfer'
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const payload = res.rows[0].payload;
      return (
        payload.txId != null &&
        payload.txId.length > 0 &&
        Array.isArray(payload.outputs) &&
        payload.outputs.length > 0 &&
        Array.isArray(payload.inputCredentials) &&
        payload.inputCredentials.every(
          (key: unknown) =>
            typeof key === "string" && /^[0-9a-f]{64}$/.test(key),
        ) &&
        Array.isArray(payload.signerKeyHashes) &&
        payload.signerKeyHashes.every(
          (hash: unknown) =>
            typeof hash === "string" && /^[0-9a-f]{56}$/.test(hash),
        )
      );
    },
  );

  await assertSQL<{
    tx_id: string;
    outputs: any;
    input_credentials: any;
    signer_key_hashes: any;
  }>(
    "Transfer: STM wrote cardano_transfers",
    db,
    `SELECT tx_id, outputs, input_credentials, signer_key_hashes
     FROM cardano_transfers
     ORDER BY id ASC;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows[0];
      return (
        row.tx_id.length > 0 &&
        Array.isArray(row.input_credentials) &&
        row.input_credentials.every((key: unknown) =>
          typeof key === "string" && /^[0-9a-f]{64}$/.test(key)
        ) &&
        Array.isArray(row.signer_key_hashes) &&
        row.signer_key_hashes.every((hash: unknown) =>
          typeof hash === "string" && /^[0-9a-f]{56}$/.test(hash)
        )
      );
    },
  );
}

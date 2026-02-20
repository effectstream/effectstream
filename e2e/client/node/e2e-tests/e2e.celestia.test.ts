import { Buffer } from "node:buffer";
import { assertSQL, blockWatcher, type SharedState } from "@e2e/engine";
import type { Client } from "pg";
import { ENV } from "@effectstream/utils/node-env";

// These match the values configured in config.ts
const CELESTIA_NAMESPACE_HEX = "000000000000deadbeef";
const CELESTIA_FEE = ENV.getNumber("CELESTIA_FEE", 2000);
const CELESTIA_GAS_LIMIT = ENV.getNumber("CELESTIA_GAS_LIMIT", 100000);
const CELESTIA_NODE_URL = ENV.getString("CELESTIA_NODE_URL", "http://localhost:26658");

const celestia_enabled = !ENV.getBoolean("DISABLE_CELESTIA");

function celestiaNamespaceBase64(hex: string): string {
  const cleanHex = hex.replace(/^0x/, "");
  const buffer = Buffer.alloc(29); // 1 byte version (0) + 28 bytes ID
  const hexBuffer = Buffer.from(cleanHex, "hex");
  hexBuffer.copy(buffer, 29 - hexBuffer.length);
  return buffer.toString("base64");
}

const CELESTIA_NAMESPACE_B64 = celestiaNamespaceBase64(CELESTIA_NAMESPACE_HEX);

async function celestiaRpc(method: string, params: unknown[]): Promise<any> {
  try {
    const res = await fetch(CELESTIA_NODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = await res.json();
    if (json.error) throw json.error;
    return json.result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("blob: not found")) return null;
    console.error(`Celestia RPC Error`, method, msg);
    console.error(err);
    return null;
  }
}

/**
 * Submit a DA blob to the Celestia Light Node.
 * Returns the block height at which the blob was included.
 */
async function celestiaSubmitBlob(data: string): Promise<number | null> {
  const b64Data = Buffer.from(data).toString("base64");
  const response = await celestiaRpc("blob.Submit", [
    [{ namespace: CELESTIA_NAMESPACE_B64, data: b64Data, share_version: 0 }],
    { fee: CELESTIA_FEE, gasLimit: CELESTIA_GAS_LIMIT },
  ]);
  if (response === null) return null;
  // blob.Submit returns the block height (uint64) as a number
  return typeof response === "number" ? response : Number(response);
}

/**
 * Submit a blob to Celestia and verify the sync protocol picks it up,
 * adding it to the primitive_accounting table.
 */
export async function submitBlobCelestiaTest(
  db: Client,
  sharedState: SharedState,
) {
  if (!celestia_enabled) return;

  const blobContent = JSON.stringify({ message: "Hello from Celestia e2e test!" });
  console.log(
    `[Celestia] Submitting blob to namespace ${CELESTIA_NAMESPACE_HEX}...`,
  );

  const blockHeight = await celestiaSubmitBlob(blobContent);
  if (blockHeight === null) {
    throw new Error(
      "[Celestia] blob.Submit returned null — is the Celestia Light Node running?",
    );
  }

  console.log(
    `[Celestia] Blob included at height ${blockHeight}. Waiting for parallelCelestia to sync...`,
  );
  await blockWatcher.waitForBlock("parallelCelestia", blockHeight);

  sharedState.primitive_accounting_counter += 1;

  await assertSQL<{
    primitive_name: string;
    payload_type: string;
    payload: Record<string, unknown>;
  }>(
    "Check Celestia Blob primitive accounting",
    db,
    `SELECT primitive_name, payload_type, payload
       FROM effectstream.primitive_accounting
      WHERE primitive_name = 'CelestiaBlob'`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows[0];
      console.log(
        `[Celestia] primitive_accounting row:`,
        JSON.stringify(row),
      );
      return (
        row.primitive_name === "CelestiaBlob" &&
        row.payload_type === "CELESTIA:Generic"
      );
    },
  );
}

export type CelestiaBlob = {
  /** Base64-encoded 29-byte namespace */
  namespace: string;
  /** Base64-encoded blob data */
  data: string;
  share_version: number;
  /** Base64-encoded blob commitment */
  commitment: string;
  signer: string;
  index: number;
};

export type CelestiaHeader = {
  version: { block: string; app: string };
  chain_id: string;
  /** String-encoded block height */
  height: string;
  /** ISO 8601 timestamp */
  time: string;
  last_block_id: {
    hash: string;
    parts: { total: number; hash: string };
  };
  last_commit_hash: string;
  data_hash: string;
  validators_hash: string;
  next_validators_hash: string;
  consensus_hash: string;
  app_hash: string;
  last_results_hash: string;
  evidence_hash: string;
  proposer_address: string;
};

export type CelestiaCommit = {
  height: string;
  block_id: {
    hash: string;
    parts: { total: number; hash: string };
  };
};

export type CelestiaExtendedHeader = {
  header: CelestiaHeader;
  commit: CelestiaCommit;
  validator_set: unknown;
  dah: unknown;
};

import { ENV } from "@effectstream/utils/node-env";

const CELESTIA_NODE_URL = ENV.getString(
  "CELESTIA_NODE_URL",
  "http://localhost:26658",
);
const CELESTIA_AUTH_TOKEN = ENV.getString("CELESTIA_AUTH_TOKEN", "");
const CELESTIA_RPC_TIMEOUT_MS = parseInt(
  ENV.getString("CELESTIA_RPC_TIMEOUT_MS", "15000"),
);

/**
 * Converts a hex-encoded Celestia namespace to a base64-encoded 29-byte array.
 * Format: 1 byte version (0x00) + 28 bytes namespace ID, right-aligned.
 */
export function celestiaNamespaceToBase64(hex: string): string {
  const cleanHex = hex.replace(/^0x/, "").padStart(56, "0"); // 28 bytes = 56 hex chars
  const bytes = new Uint8Array(29); // version byte (0) + 28-byte ID
  for (let i = 0; i < 28; i++) {
    bytes[i + 1] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export class CelestiaClient {
  private readonly rpcUrl: string;

  constructor(rpcUrl: string = CELESTIA_NODE_URL) {
    this.rpcUrl = rpcUrl;
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T | null> {
    // Retry forever — a transient stall must never cause a block to be skipped.
    // The only exit paths are: (a) success, (b) "blob: not found" (empty namespace).
    // Everything else (network error, timeout, RPC error) loops with backoff.
    let attempt = 0;
    while (true) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (CELESTIA_AUTH_TOKEN) headers["Authorization"] = `Bearer ${CELESTIA_AUTH_TOKEN}`;
        const res = await fetch(this.rpcUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(CELESTIA_RPC_TIMEOUT_MS),
        });
        const json = await res.json();
        if (json.error) {
          const errMsg: string = json.error.message ?? String(json.error);
          if (errMsg.includes("blob: not found")) return null;
          throw new Error(`[Celestia] RPC error [${method}]: ${errMsg}`);
        }
        return json.result as T;
      } catch (err: unknown) {
        attempt++;
        const backoffMs = Math.min(1000 * 2 ** Math.min(attempt - 1, 5), 30_000);
        console.warn(
          `[Celestia] ${method} attempt ${attempt} failed (retrying in ${backoffMs}ms): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  async getLatestBlockHeight(): Promise<number> {
    const head = await this.rpc<CelestiaExtendedHeader>(
      "header.LocalHead",
      [],
    );
    if (!head) {
      throw new Error("[Celestia] Could not retrieve latest block header");
    }
    return parseInt(head.header.height, 10);
  }

  async getHeaderAtHeight(height: number): Promise<CelestiaExtendedHeader> {
    const header = await this.rpc<CelestiaExtendedHeader>(
      "header.GetByHeight",
      [height],
    );
    if (!header) {
      throw new Error(
        `[Celestia] Could not retrieve header at height ${height}`,
      );
    }
    return header;
  }

  async getBlobsAtHeight(
    height: number,
    namespaceB64: string,
  ): Promise<CelestiaBlob[]> {
    const blobs = await this.rpc<CelestiaBlob[]>("blob.GetAll", [
      height,
      [namespaceB64],
    ]);
    return blobs ?? [];
  }
}

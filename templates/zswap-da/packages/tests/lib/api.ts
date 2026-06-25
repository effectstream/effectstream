// Node HTTP API helpers: submit offers and read them back. Reading offers back
// from GET /api/zswaps (and reconstructing the tx from the blob the API serves)
// is the faithful path — it exercises the Celestia fetch + validate + index +
// serve primitives, not an in-memory shortcut.

import { Transaction, type FinalizedTransaction } from "@midnight-ntwrk/ledger-v8";
import { decodeOffer } from "mip-zswap-offer";

const API = process.env["ZSWAP_API"] ?? "http://127.0.0.1:9999";

export interface SubmitResult {
  status: number;
  body: any;
}

export async function submitOffer(blob: string): Promise<SubmitResult> {
  const r = await fetch(`${API}/api/zswap/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blob }),
  });
  let body: any;
  try {
    body = await r.json();
  } catch {
    body = await r.text();
  }
  return { status: r.status, body };
}

export interface ApiZswap {
  id: number;
  celestia_height: string;
  transaction_hex: string;
  gives: { token: string; amount: string }[];
  wants: { token: string; amount: string }[];
}

export async function getZswaps(params: { token?: string; limit?: number } = {}): Promise<ApiZswap[]> {
  const q = new URLSearchParams();
  if (params.token) q.set("token", params.token);
  q.set("limit", String(params.limit ?? 100));
  const r = await fetch(`${API}/api/zswaps?${q.toString()}`);
  return (await r.json()) as ApiZswap[];
}

/** Rebuild a finalized offer tx from the blob the API serves (the same blob
 *  that round-tripped through Celestia and was re-validated at ingestion). */
export function reconstructOffer(transactionHex: string): FinalizedTransaction {
  return Transaction.deserialize(
    "signature",
    "proof",
    "binding",
    decodeOffer(transactionHex),
  ) as unknown as FinalizedTransaction;
}

// Solver-side helpers for batcher-settled swaps.
//
// The batcher's `midnight-balancer` target balances DUST ONLY
// (tokenKindsToBalance:["dust"]) — it pays fees but never provides
// counterparty tokens. So a swap must be merged into ONE token-balanced
// transaction before it is handed to the batcher; the batcher then only adds
// dust, proves, and submits. No swap participant needs dust — only the batcher.

import type { FinalizedTransaction } from "@midnight-ntwrk/ledger-v8";

const BALANCER_URL = process.env["BATCHER_SUBMIT_URL"] ?? "http://127.0.0.1:3334";

const toHex = (u: Uint8Array): string =>
  Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");

/** Merge N independently-proven offers into one atomic, token-balanced tx.
 *  Each offer must already be finalized (proven + bound) by its own owner —
 *  zswap requires each spend be proven by its key, so we prove per-owner first
 *  and only merge the proven halves. */
export function mergeFinalized(offers: FinalizedTransaction[]): FinalizedTransaction {
  if (offers.length === 0) throw new Error("mergeFinalized: no offers");
  let merged = offers[0];
  for (let i = 1; i < offers.length; i++) {
    merged = (merged as any).merge(offers[i]) as FinalizedTransaction;
  }
  return merged;
}

export interface Imbalance {
  seg: number;
  tag: string;
  raw: string;
  amount: bigint;
}

/** All per-segment token imbalances. A balanced swap leaves only `dust`
 *  (which the batcher fills); any non-dust entry means the merged tx is NOT a
 *  complete swap and must NOT be settled. */
export function tokenImbalances(tx: FinalizedTransaction): Imbalance[] {
  const out: Imbalance[] = [];
  for (const seg of [0, 1]) {
    try {
      const m = (tx as any).imbalances?.(seg);
      if (m && typeof m.entries === "function") {
        for (const [k, v] of m.entries() as Iterable<[unknown, bigint]>) {
          const tag = typeof k === "object" && k !== null ? (k as any).tag ?? "?" : "?";
          const raw = typeof k === "object" && k !== null ? (k as any).raw ?? String(k) : String(k);
          if ((v as bigint) !== 0n) out.push({ seg, tag: String(tag), raw: String(raw), amount: v as bigint });
        }
      }
    } catch {
      /* segment may not exist */
    }
  }
  return out;
}

/** Non-dust imbalances — these must be empty for a tx to be a settleable swap.
 *  (Dust imbalance is expected; the batcher covers it.) */
export function nonDustImbalances(tx: FinalizedTransaction): Imbalance[] {
  return tokenImbalances(tx).filter((i) => i.tag !== "dust");
}

export function describeImbalances(tx: FinalizedTransaction): string {
  return JSON.stringify(
    tokenImbalances(tx).map((i) => ({ seg: i.seg, tag: i.tag, raw: i.raw.slice(0, 10), amount: i.amount.toString() })),
  );
}

/** Hand a finalized, token-balanced tx to the batcher's midnight-balancer
 *  target. The batcher adds dust (fees), proves its balancing half, and submits.
 *  With confirmationLevel "wait-receipt" the call blocks until the settle
 *  receipt (or timeout). */
export async function settleViaBatcher(
  tx: FinalizedTransaction,
  timeoutMs = 240_000,
): Promise<{ ok: boolean; status: number; body: any }> {
  // SAFETY: the batcher balances dust only. Handing it a tx with a non-dust
  // imbalance would settle an incomplete swap — consuming inputs without
  // delivering the wanted outputs (fund loss). Refuse.
  const bad = nonDustImbalances(tx);
  if (bad.length > 0) {
    throw new Error(
      `REFUSED: merged tx is not a complete swap (non-dust imbalance: ` +
        `${bad.map((i) => `${i.tag}:${i.raw.slice(0, 8)}=${i.amount}`).join(", ")})`,
    );
  }
  const hex = toHex(tx.serialize());
  const body = {
    data: {
      address: "midnight-balancer",
      addressType: -1,
      input: JSON.stringify({ tx: hex, txStage: "finalized" }),
      signature: "",
      timestamp: String(Date.now()),
      target: "midnight-balancer",
    },
    confirmationLevel: "wait-receipt",
  };
  const resp = await fetch(`${BALANCER_URL}/send-input`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let j: any;
  try {
    j = await resp.json();
  } catch {
    j = await resp.text();
  }
  return { ok: resp.ok && j?.success !== false, status: resp.status, body: j };
}

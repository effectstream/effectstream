// A tiny client for the node's read-only API (packages/node/api.ts).
//
// The transfer view is version 2 (plan 00058 Interfaces I-3 (a)): the 00050
// fields plus `recipientKind`, the status `undeliverable` with its `reason`, and
// `delivery` for a contract recipient. The new fields are optional here, so the
// CLI also reads a 00050 node.
export type UndeliverableCode =
  | "no-adapter"
  | "not-a-contract"
  | "not-a-passport-account"
  | "authority-live"
  | "bad-enc-key"
  | "wrong-network"
  | "counters";

export type TransferView = {
  id: string;
  direction: "s2m" | "m2s";
  sourceId: string;
  amount: string;
  recipientKind?: "wallet" | "contract" | "solana";
  recipient: string | null;
  sender: string | null;
  status: "observed" | "submitted" | "completed" | "undeliverable";
  reason?: { code: UndeliverableCode; message: string; at: string } | null;
  delivery?: {
    adapter: string;
    account: string;
    coin: { nonce: string; colour: string; value: string } | null;
    tx: string | null;
  } | null;
  srcRef: string | null;
  dstRef: string | null;
  observedBlock: number;
  completedBlock: number | null;
  relayer: {
    attempts: number;
    submittedAt: string | null;
    lastAttemptAt: string | null;
    lastTx: string | null;
    lastError: string | null;
  } | null;
};

/** `GET /recipients/contract/:address` (plan 00058 Interfaces I-3 (b)). */
export type RecipientVerdict = {
  address: string;
  verdict: "deliverable" | "undeliverable" | "retry";
  adapter: string | null;
  code: UndeliverableCode | null;
  message: string | null;
  checkedAt: string;
};

export function defaultApiUrl(): string {
  return process.env.BRIDGE_API_URL ?? `http://localhost:${process.env.EFFECTSTREAM_API_PORT ?? "9999"}`;
}

export async function getTransfer(api: string, id: string): Promise<TransferView | null> {
  const res = await fetch(new URL(`/transfers/${id}`, api), { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /transfers/${id} answered ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { transfer: TransferView }).transfer;
}

export async function listTransfers(
  api: string,
  q: { direction?: string; status?: string; limit?: number } = {},
): Promise<TransferView[]> {
  const url = new URL("/transfers", api);
  if (q.direction) url.searchParams.set("direction", q.direction);
  if (q.status) url.searchParams.set("status", q.status);
  url.searchParams.set("limit", String(q.limit ?? 100));
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GET /transfers answered ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { transfers: TransferView[] }).transfers;
}

/**
 * Polls `GET /transfers/:id` until the transfer is `completed` (sync saw the
 * counterpart on chain), reporting each status change. A missing transfer is
 * normal for a while: sync needs the confirmation depth before it observes it.
 * A failed request (the node is starting, busy past the request timeout, or
 * down) is reported with its `error`, not as a missing transfer (PR-2 T6,
 * F-T6.6), and polling continues.
 */
export async function waitForCompleted(
  api: string,
  id: string,
  opts: { timeoutMs: number; pollMs?: number; onChange?: (t: TransferView | null, error?: string) => void },
): Promise<TransferView> {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < opts.timeoutMs) {
    let t: TransferView | null = null;
    let error: string | undefined;
    try {
      t = await getTransfer(api, id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const state = error !== undefined
      ? "api-error"
      : t ? `${t.status}:${t.relayer?.attempts ?? 0}:${t.relayer?.lastError ?? ""}` : "unseen";
    if (state !== last) opts.onChange?.(t, error);
    last = state;
    if (t?.status === "completed") return t;
    await Bun.sleep(opts.pollMs ?? 3_000);
  }
  throw new Error(`transfer ${id} not completed within ${Math.round(opts.timeoutMs / 1000)} s (check \`bun run bridge:status --id ${id}\`)`);
}

/**
 * Asks the node whether it can deliver to a contract address. Read-only: the
 * node signs nothing for it. Throws on a refused request (400: malformed
 * address; 503: the node's relayer, and so its delivery router, is disabled)
 * or an unreachable node.
 */
export async function getRecipientVerdict(api: string, address: string): Promise<RecipientVerdict> {
  const res = await fetch(new URL(`/recipients/contract/${address}`, api), { signal: AbortSignal.timeout(30_000) });
  if (res.status === 503) {
    throw new Error(`the node at ${api} cannot check contract recipients (503: its relayer is disabled): ${await res.text()}`);
  }
  if (!res.ok) throw new Error(`GET /recipients/contract/${address} answered ${res.status}: ${await res.text()}`);
  return (await res.json()) as RecipientVerdict;
}

/**
 * As `waitForCompleted`, but also returns at `undeliverable` (a contract
 * recipient the node will never deliver to; no mint was signed).
 */
export async function waitForSettled(
  api: string,
  id: string,
  opts: { timeoutMs: number; pollMs?: number; onChange?: (t: TransferView | null, error?: string) => void },
): Promise<TransferView> {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < opts.timeoutMs) {
    let t: TransferView | null = null;
    let error: string | undefined;
    try {
      t = await getTransfer(api, id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const state = error !== undefined
      ? "api-error"
      : t ? `${t.status}:${t.relayer?.attempts ?? 0}:${t.relayer?.lastError ?? ""}` : "unseen";
    if (state !== last) opts.onChange?.(t, error);
    last = state;
    if (t?.status === "completed" || t?.status === "undeliverable") return t;
    await Bun.sleep(opts.pollMs ?? 3_000);
  }
  throw new Error(`transfer ${id} not settled within ${Math.round(opts.timeoutMs / 1000)} s (check \`bun run bridge:status --id ${id}\`)`);
}

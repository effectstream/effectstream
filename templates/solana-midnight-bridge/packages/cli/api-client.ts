// A tiny client for the node's read-only API (packages/node/api.ts).
export type TransferView = {
  id: string;
  direction: "s2m" | "m2s";
  sourceId: string;
  amount: string;
  recipient: string | null;
  sender: string | null;
  status: "observed" | "submitted" | "completed";
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
 */
export async function waitForCompleted(
  api: string,
  id: string,
  opts: { timeoutMs: number; pollMs?: number; onChange?: (t: TransferView | null) => void },
): Promise<TransferView> {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < opts.timeoutMs) {
    let t: TransferView | null = null;
    try {
      t = await getTransfer(api, id);
    } catch (e) {
      const state = `api-error:${(e as Error).message}`;
      if (state !== last) opts.onChange?.(null);
      last = state;
    }
    const state = t ? `${t.status}:${t.relayer?.attempts ?? 0}:${t.relayer?.lastError ?? ""}` : "unseen";
    if (state !== last) opts.onChange?.(t);
    last = state;
    if (t?.status === "completed") return t;
    await Bun.sleep(opts.pollMs ?? 3_000);
  }
  throw new Error(`transfer ${id} not completed within ${Math.round(opts.timeoutMs / 1000)} s (check \`bun run bridge:status --id ${id}\`)`);
}

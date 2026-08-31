// Thin client for the batcher HTTP API (POST /send-input + status endpoints).

import { BALANCER_TARGET, BATCHER_URL } from "./env.ts";

const ADDRESS_TYPE_MIDNIGHT = 5;

export interface SendInputResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export async function sendTx(
  hexTx: string,
  opts?: {
    txStage?: "unproven" | "unbound" | "finalized";
    address?: string;
    /** Raw override of the whole input payload (for malformed-input tests). */
    rawInput?: string;
    target?: string;
    confirmationLevel?: "no-wait" | "wait-receipt" | "wait-effectstream-processed";
    timeoutMs?: number;
  },
): Promise<SendInputResult> {
  const inputPayload: Record<string, unknown> = { tx: hexTx };
  if (opts?.txStage) inputPayload.txStage = opts.txStage;

  const body = {
    data: {
      target: opts?.target ?? BALANCER_TARGET,
      address: opts?.address ?? "midnight-batcher-workload",
      addressType: ADDRESS_TYPE_MIDNIGHT,
      input: opts?.rawInput ?? JSON.stringify(inputPayload),
      timestamp: String(Date.now()),
    },
    confirmationLevel: opts?.confirmationLevel ?? "no-wait",
  };

  const response = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts?.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    /* non-JSON body */
  }
  const success = response.ok &&
    (parsed as { success?: boolean } | null)?.success !== false;
  return { ok: success, status: response.status, body: parsed };
}

export async function getStatus(): Promise<unknown> {
  const r = await fetch(`${BATCHER_URL}/status`);
  return await r.json();
}

export async function getQueueStats(): Promise<unknown> {
  const r = await fetch(`${BATCHER_URL}/queue-stats`);
  return await r.json();
}

export async function getHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${BATCHER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function waitForBatcher(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await getHealth()) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`batcher not healthy at ${BATCHER_URL} after ${timeoutMs}ms`);
}

/** Pending-input count across targets, from /queue-stats. */
export async function getPendingCount(): Promise<number> {
  const stats = (await getQueueStats()) as { totalPendingInputs?: number };
  if (typeof stats?.totalPendingInputs === "number") return stats.totalPendingInputs;
  throw new Error(`unexpected /queue-stats shape: ${JSON.stringify(stats).slice(0, 200)}`);
}

// Thin client for the batcher HTTP API (POST /send-input + status endpoints).

import { BATCHER_URL } from "./env.ts";

const ADDRESS_TYPE_MIDNIGHT = 5;

export interface SendInputResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/**
 * Submit a transaction to ONE product's target on the shared batcher.
 *
 * `target` is required by design: a multi-product batcher rejects unaddressed
 * inputs rather than routing them to whichever product happens to be
 * registered first. Pass `omitTarget: true` to exercise that rejection.
 */
export async function sendTx(
  hexTx: string,
  opts: {
    target: string;
    txStage?: "unproven" | "unbound" | "finalized";
    address?: string;
    /** Raw override of the whole input payload (for malformed-input tests). */
    rawInput?: string;
    /** Deliberately omit `target` — used by the strict-routing test. */
    omitTarget?: boolean;
    confirmationLevel?: "no-wait" | "wait-receipt" | "wait-effectstream-processed";
    timeoutMs?: number;
  },
): Promise<SendInputResult> {
  const inputPayload: Record<string, unknown> = { tx: hexTx };
  if (opts.txStage) inputPayload.txStage = opts.txStage;

  const body = {
    data: {
      ...(opts.omitTarget ? {} : { target: opts.target }),
      address: opts.address ?? `${opts.target}-workload`,
      addressType: ADDRESS_TYPE_MIDNIGHT,
      input: opts.rawInput ?? JSON.stringify(inputPayload),
      timestamp: String(Date.now()),
    },
    confirmationLevel: opts.confirmationLevel ?? "no-wait",
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

export interface TargetStats {
  target: string;
  pendingInputs: number;
  isReady: boolean;
  criteriaType: string;
  timeSinceLastProcess: number;
  /** Adapter snapshot: fee capacity, workers, policy shape. */
  health?: {
    wallets?: number;
    walletsReady?: number;
    dustUtxos?: number[];
    dustExhausted?: boolean;
    workersBusy?: number;
    workersTotal?: number;
    inFlightInputs?: number;
    policy?: unknown;
  };
}

export interface QueueStats {
  totalPendingInputs: number;
  targets: TargetStats[];
}

export async function getStats(): Promise<QueueStats> {
  const stats = (await getQueueStats()) as QueueStats;
  if (typeof stats?.totalPendingInputs !== "number" || !Array.isArray(stats.targets)) {
    throw new Error(`unexpected /queue-stats shape: ${JSON.stringify(stats).slice(0, 200)}`);
  }
  return stats;
}

/** Pending-input count across ALL products. */
export async function getPendingCount(): Promise<number> {
  return (await getStats()).totalPendingInputs;
}

/** Pending-input count for ONE product. */
export async function getPendingCountFor(target: string): Promise<number> {
  const stats = await getStats();
  const entry = stats.targets.find((t) => t.target === target);
  if (!entry) throw new Error(`target ${target} not registered on the batcher`);
  return entry.pendingInputs;
}

export async function getTargetStats(target: string): Promise<TargetStats> {
  const stats = await getStats();
  const entry = stats.targets.find((t) => t.target === target);
  if (!entry) throw new Error(`target ${target} not registered on the batcher`);
  return entry;
}

/** Wait until a product's queue is empty (or the whole batcher's, if omitted). */
export async function waitForDrained(
  target: string | undefined,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pending = target ? await getPendingCountFor(target) : await getPendingCount();
    if (pending === 0) return true;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return false;
}

/**
 * Retire pending inputs, optionally for ONE target only. Behind
 * ENABLE_DEV_AND_DEBUG_ENDPOINTS on the batcher (set for this stack in
 * docker-compose.yml).
 */
export async function clearInputs(target?: string): Promise<string> {
  const qs = target ? `?target=${encodeURIComponent(target)}` : "";
  const r = await fetch(`${BATCHER_URL}/clear-inputs${qs}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`clear-inputs ${target ?? "all"} → HTTP ${r.status}`);
  return ((await r.json()) as { message?: string }).message ?? "";
}

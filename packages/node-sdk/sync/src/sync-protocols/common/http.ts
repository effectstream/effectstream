/**
 * Bounded HTTP for sync-protocol RPC clients.
 *
 * `fetch` has no default timeout. Against a blackholed endpoint — a load
 * balancer that drops its backend, a socket left half-open by a NAT rebind —
 * the connection is established and simply never answers, so the promise never
 * settles. For a sync protocol that is the worst possible failure: `readData`
 * never returns, so the fetch loop in `orchestration/sync.ts` never reaches its
 * `catch`, `consecutiveErrors` stays 0, `lastSuccessfulFetchMs` freezes, and
 * the merge blocks on that chain's page forever. The node stops producing
 * blocks and reports nothing wrong.
 *
 * Deliberately timeout-only, with NO internal retry. The fetch loop already
 * retries: it catches, counts the error, sleeps `pollingInterval` and re-runs
 * the same page range (fetches are idempotent — `lastPage` only advances on a
 * complete `DataFetched`). Retrying inside the client as well would double the
 * backoff and, worse, hide failures from `consecutiveErrors`, which is what the
 * health endpoint reports on.
 *
 * Regression test: `sync/test/rpc-timeout.test.ts` points each client at a
 * blackhole and asserts it rejects rather than hanging.
 */

/** Used when a protocol config carries no `requestTimeoutMs`. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/** Thrown when a request exceeds its budget, so callers can tell it apart. */
export class RequestTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`[${label}] request timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
  }
}

/**
 * `fetch` with a hard deadline.
 *
 * @param label   Prefix for the thrown error, e.g. `"Bitcoin getblockhash"`.
 * @param timeoutMs Falls back to {@link DEFAULT_REQUEST_TIMEOUT_MS}.
 * @param signal  Optional caller signal; aborting either one aborts the request.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetch(url, { ...init, signal: combined });
  } catch (err) {
    // Surface our own error for the timeout case; a caller-supplied abort and
    // ordinary transport failures propagate unchanged.
    if (timeoutSignal.aborted && !(signal?.aborted ?? false)) {
      throw new RequestTimeoutError(label, timeoutMs);
    }
    throw err;
  }
}

/**
 * Resolve the timeout for a protocol config. Optional in the schema, so this
 * centralises the fallback instead of repeating `?? DEFAULT` at each client.
 */
export function requestTimeoutOf(
  syncProtocol: { requestTimeoutMs?: number } | undefined,
): number {
  return syncProtocol?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
}

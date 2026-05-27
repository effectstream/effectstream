const PG_STACK_RE = /node_modules\/(pg-pool|pg)\//;

const TRANSIENT_PG_MESSAGES = [
  "Connection terminated unexpectedly",
  "Client has encountered a connection error",
  "Client network socket disconnected before secure TLS connection",
] as const;

function* walkErrors(reason: unknown): Generator<unknown> {
  let current: unknown = reason;
  const seen = new Set<unknown>();
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

function isFromPgStack(err: unknown): boolean {
  if (err == null || typeof err !== "object" || !("stack" in err)) {
    return false;
  }
  return PG_STACK_RE.test(String((err as Error).stack));
}

function hasTransientPgMessage(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const msg = (err as { message?: string }).message;
  if (typeof msg !== "string") return false;
  return TRANSIENT_PG_MESSAGES.some((fragment) => msg.includes(fragment));
}

function isTransientPgErrorSingle(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  if (hasTransientPgMessage(err)) return true;
  if (!isFromPgStack(err)) return false;
  const code = (err as { code?: string }).code;
  return code === "ECONNRESET" || code === "EPIPE";
}

/**
 * Returns true for pg / network errors that are normal on serverless Postgres
 * (Neon, etc.): cold-start RSTs, idle-socket evictions, transient TLS blips.
 * The pool recovers on the next query — use with `installUnhandledRejectionLogger`
 * from `@effectstream/log` so these do not crash the process.
 *
 * Intentionally narrow: known-recoverable conditions only; logic/SQL bugs still crash.
 */
export function isTransientPgError(reason: unknown): boolean {
  for (const err of walkErrors(reason)) {
    if (isTransientPgErrorSingle(err)) return true;
  }
  return false;
}

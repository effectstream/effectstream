const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export type GetMidnightTipOptions = {
  indexer: string;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
};

export type MidnightTip = { height: number };

export type MidnightTipErrorCode =
  | "INVALID_OPTIONS"
  | "ABORTED"
  | "TIMEOUT"
  | "NETWORK"
  | "HTTP"
  | "GRAPHQL"
  | "INVALID_RESPONSE";

export class MidnightTipError extends Error {
  readonly code: MidnightTipErrorCode;
  override readonly cause?: unknown;
  readonly status?: number;
  readonly statusText?: string;
  readonly graphqlErrors?: readonly unknown[];

  constructor(
    code: MidnightTipErrorCode,
    message: string,
    options: {
      cause?: unknown;
      status?: number;
      statusText?: string;
      graphqlErrors?: readonly unknown[];
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MidnightTipError";
    this.code = code;
    this.cause = options.cause;
    this.status = options.status;
    this.statusText = options.statusText;
    this.graphqlErrors = options.graphqlErrors;
  }
}

function validateOptions(options: GetMidnightTipOptions): {
  indexer: string;
  requestTimeoutMs: number;
  signal?: AbortSignal;
} {
  if (options == null || typeof options !== "object") {
    throw new MidnightTipError("INVALID_OPTIONS", "Options must be an object");
  }
  if (typeof options.indexer !== "string") {
    throw new MidnightTipError(
      "INVALID_OPTIONS",
      "indexer must be an absolute HTTP(S) URL",
    );
  }

  let url: URL;
  try {
    url = new URL(options.indexer);
  } catch {
    throw new MidnightTipError(
      "INVALID_OPTIONS",
      "indexer must be an absolute HTTP(S) URL",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MidnightTipError("INVALID_OPTIONS", "indexer must use HTTP or HTTPS");
  }

  const requestTimeoutMs =
    options.requestTimeoutMs === undefined
      ? DEFAULT_REQUEST_TIMEOUT_MS
      : options.requestTimeoutMs;
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    !Number.isFinite(requestTimeoutMs) ||
    requestTimeoutMs <= 0
  ) {
    throw new MidnightTipError(
      "INVALID_OPTIONS",
      "requestTimeoutMs must be a positive finite safe integer",
    );
  }

  const signal = options.signal;
  if (
    signal !== undefined &&
    (signal === null ||
      typeof signal !== "object" ||
      typeof signal.addEventListener !== "function" ||
      typeof signal.removeEventListener !== "function" ||
      typeof signal.aborted !== "boolean")
  ) {
    throw new MidnightTipError("INVALID_OPTIONS", "signal must be an AbortSignal");
  }

  return { indexer: url.href, requestTimeoutMs, signal };
}

function invalidResponse(message: string, cause?: unknown): MidnightTipError {
  return new MidnightTipError("INVALID_RESPONSE", message, { cause });
}

/**
 * Split deadlines at the maximum delay supported consistently by Node and Bun.
 * Larger delays are otherwise clamped and can fire years too early.
 */
function scheduleDeadline(delayMs: number, onDeadline: () => void): () => void {
  let remainingMs = delayMs;
  let active = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const scheduleNext = (): void => {
    const chunkMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS);
    remainingMs -= chunkMs;
    timeout = setTimeout(() => {
      if (!active) return;
      timeout = undefined;
      if (remainingMs > 0) {
        scheduleNext();
        return;
      }
      active = false;
      onDeadline();
    }, chunkMs);
  };

  scheduleNext();
  return () => {
    if (!active) return;
    active = false;
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
  };
}

function aborted(reason: unknown): MidnightTipError {
  return new MidnightTipError("ABORTED", "Midnight tip query was aborted", {
    cause: reason,
  });
}

function timedOut(): MidnightTipError {
  return new MidnightTipError("TIMEOUT", "Midnight tip query timed out");
}

/** Query one validated numeric block height from an explicit Midnight indexer. */
export async function getMidnightTip(
  options: GetMidnightTipOptions,
): Promise<MidnightTip> {
  const validated = validateOptions(options);
  if (validated.signal?.aborted) throw aborted(validated.signal.reason);

  const requestController = new AbortController();
  let winner: "ABORTED" | "TIMEOUT" | undefined;
  let callerReason: unknown;

  const onCallerAbort = (): void => {
    if (winner !== undefined) return;
    winner = "ABORTED";
    callerReason = validated.signal?.reason;
    requestController.abort(callerReason);
  };

  validated.signal?.addEventListener("abort", onCallerAbort, { once: true });
  // Close the listener-registration race before allocating a timer or doing I/O.
  if (validated.signal?.aborted) onCallerAbort();
  if (winner === "ABORTED") {
    validated.signal?.removeEventListener("abort", onCallerAbort);
    throw aborted(callerReason);
  }

  const clearDeadline = scheduleDeadline(validated.requestTimeoutMs, () => {
    if (winner !== undefined) return;
    winner = "TIMEOUT";
    requestController.abort();
  });

  const throwIfCancelled = (): void => {
    if (winner === "ABORTED") throw aborted(callerReason);
    if (winner === "TIMEOUT") throw timedOut();
  };

  try {
    let response: Response;
    try {
      response = await fetch(validated.indexer, {
        method: "POST",
        body: JSON.stringify({ query: "query { block { height } }" }),
        headers: { "Content-Type": "application/json" },
        redirect: "manual",
        signal: requestController.signal,
      });
    } catch (error) {
      throwIfCancelled();
      throw new MidnightTipError("NETWORK", "Midnight tip query failed", {
        cause: error,
      });
    }
    throwIfCancelled();

    if (!response.ok) {
      // A fetch resolves after response headers. Explicitly cancel an unread
      // body so an HTTP failure cannot leave its streaming request/socket live.
      try {
        await response.body?.cancel();
      } catch {
        // Classification is based on the already-received HTTP response.
      }
      throwIfCancelled();
      throw new MidnightTipError(
        "HTTP",
        `Midnight indexer returned ${response.status} ${response.statusText}`,
        { status: response.status, statusText: response.statusText },
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throwIfCancelled();
      throw invalidResponse("Midnight indexer returned malformed JSON", error);
    }
    throwIfCancelled();

    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      throw invalidResponse("Midnight indexer returned a non-object GraphQL response");
    }

    if ("errors" in body) {
      const errors = (body as { errors?: unknown }).errors;
      if (!Array.isArray(errors)) {
        throw invalidResponse("Midnight indexer returned a malformed GraphQL errors field");
      }
      if (errors.length > 0) {
        throw new MidnightTipError("GRAPHQL", "Midnight indexer returned GraphQL errors", {
          graphqlErrors: Object.freeze(errors.slice()),
        });
      }
    }

    const data = (body as { data?: unknown }).data;
    if (data == null || typeof data !== "object" || Array.isArray(data)) {
      throw invalidResponse("Midnight indexer response is missing data");
    }

    const block = (data as { block?: unknown }).block;
    if (block == null || typeof block !== "object" || Array.isArray(block)) {
      throw invalidResponse("Midnight indexer response is missing block");
    }

    const height = (block as { height?: unknown }).height;
    if (
      typeof height !== "number" ||
      !Number.isFinite(height) ||
      !Number.isSafeInteger(height) ||
      height < 0
    ) {
      throw invalidResponse("Midnight indexer returned an invalid block height");
    }

    return { height };
  } finally {
    clearDeadline();
    validated.signal?.removeEventListener("abort", onCallerAbort);
  }
}

import { NtpTimeSync } from "ntp-time-sync";

const DEFAULT_TIMEOUT_MS = 15_000;
// setTimeout silently clamps larger delays to 1ms, so reject them up front.
const MAX_TIMEOUT_MS = 2_147_483_647;

export type NtpTipErrorCode =
  | "INVALID_OPTIONS"
  | "ABORTED"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_TIME";

export type GetNtpTipOptions = {
  startTime: number;
  blockTimeMS: number;
  servers?: readonly string[];
  requestTimeoutMs?: number;
  signal?: AbortSignal;
};

export type NtpTip = { height: number };

export class NtpTipError extends Error {
  readonly code: NtpTipErrorCode;
  readonly timeoutMs?: number;
  override readonly cause?: unknown;

  constructor(
    code: NtpTipErrorCode,
    message: string,
    details: { cause?: unknown; timeoutMs?: number } = {},
  ) {
    super(message);
    this.name = "NtpTipError";
    this.code = code;
    this.cause = details.cause;
    this.timeoutMs = details.timeoutMs;
  }
}

function invalidOptions(message: string): NtpTipError {
  return new NtpTipError("INVALID_OPTIONS", message);
}

function abortedError(reason: unknown): NtpTipError {
  return new NtpTipError("ABORTED", "NTP tip request was aborted", {
    cause: reason,
  });
}

function validateOptions(options: GetNtpTipOptions): {
  startTime: number;
  blockTimeMS: number;
  servers: readonly string[];
  requestTimeoutMs: number;
  signal?: AbortSignal;
} {
  if (!options || typeof options !== "object") {
    throw invalidOptions("NTP tip options are required");
  }
  if (!Number.isSafeInteger(options.startTime)) {
    throw invalidOptions("NTP startTime must be a finite safe integer");
  }
  if (!Number.isSafeInteger(options.blockTimeMS) || options.blockTimeMS <= 0) {
    throw invalidOptions("NTP blockTimeMS must be a positive safe integer");
  }
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs <= 0 ||
    requestTimeoutMs > MAX_TIMEOUT_MS
  ) {
    throw invalidOptions(
      `NTP requestTimeoutMs must be a positive safe integer at most ${MAX_TIMEOUT_MS}`,
    );
  }
  if (
    options.servers !== undefined &&
    (!Array.isArray(options.servers) ||
      options.servers.some(
        (server) =>
          typeof server !== "string" ||
          server.length === 0 ||
          server !== server.trim(),
      ))
  ) {
    throw invalidOptions(
      "NTP servers must be non-empty strings without surrounding whitespace",
    );
  }
  if (
    options.signal !== undefined &&
    (typeof options.signal !== "object" ||
      options.signal === null ||
      typeof options.signal.addEventListener !== "function" ||
      typeof options.signal.removeEventListener !== "function")
  ) {
    throw invalidOptions("NTP signal must be an AbortSignal");
  }
  return {
    startTime: options.startTime,
    blockTimeMS: options.blockTimeMS,
    servers: options.servers ?? [],
    requestTimeoutMs,
    signal: options.signal,
  };
}

/** Resolve one inclusive page from a bounded, one-shot NTP network sample. */
export async function getNtpTip(options: GetNtpTipOptions): Promise<NtpTip> {
  const { startTime, blockTimeMS, servers, requestTimeoutMs, signal } =
    validateOptions(options);
  if (signal?.aborted) throw abortedError(signal.reason);

  // One client per call keeps the server list and offset cache instance-owned:
  // concurrent tips can never observe each other's configuration. sampleCount 1
  // queries every selected server concurrently and settles on the first round
  // with a validated response; replyTimeout bounds the client's own socket wait
  // to the same deadline as the operation.
  const client = new NtpTimeSync({
    sampleCount: 1,
    replyTimeout: requestTimeoutMs,
    ...(servers.length ? { servers: [...servers] } : {}),
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new NtpTipError(
            "TIMEOUT",
            `NTP tip request timed out after ${requestTimeoutMs}ms`,
            { timeoutMs: requestTimeoutMs },
          ),
        ),
      requestTimeoutMs,
    );
    onAbort = () => reject(abortedError(signal?.reason));
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  let sampled: { now: Date };
  try {
    sampled = await Promise.race([
      client.getTime(true).catch((cause) => {
        throw new NtpTipError("NETWORK", "NTP sampling failed", { cause });
      }),
      cancelled,
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }

  const timestamp = sampled.now.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new NtpTipError("INVALID_TIME", "NTP returned an invalid timestamp");
  }
  const height = Math.floor((timestamp - startTime) / blockTimeMS);
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new NtpTipError(
      "INVALID_TIME",
      "NTP timestamp is before startTime or produces an unsafe height",
    );
  }
  return { height };
}

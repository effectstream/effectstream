import { createSocket, type Socket } from "node:dgram";
import { isIP } from "node:net";
import { NtpPacketParser } from "ntp-packet-parser";

const DEFAULT_SERVERS = [
  "0.pool.ntp.org",
  "1.pool.ntp.org",
  "2.pool.ntp.org",
  "3.pool.ntp.org",
] as const;
const DEFAULT_PORT = 123;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const NTP_EPOCH_OFFSET_MS = 2_208_988_800_000;
const SIBLING_CANCELLED = Symbol("NTP sibling request cancelled");

export type NtpTipErrorCode =
  | "INVALID_OPTIONS"
  | "ABORTED"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_RESPONSE"
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

type ParsedServer = {
  source: string;
  host: string;
  port: number;
  family: "udp4" | "udp6";
};

type ValidatedOptions = {
  startTime: number;
  blockTimeMS: number;
  servers: readonly string[];
  requestTimeoutMs: number;
  signal?: AbortSignal;
};

type TimerRuntime = {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

type NtpTipSampler = (
  signal: AbortSignal,
  servers: readonly string[],
) => Promise<number>;

function invalidOptions(message: string, cause?: unknown): NtpTipError {
  return new NtpTipError("INVALID_OPTIONS", message, { cause });
}

function parsePort(value: string, source: string): number {
  if (!/^\d+$/.test(value)) {
    throw invalidOptions(`NTP server has an invalid port: ${source}`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw invalidOptions(`NTP server port must be in [1, 65535]: ${source}`);
  }
  return port;
}

function parseServer(source: string): ParsedServer {
  if (
    typeof source !== "string" ||
    source.length === 0 ||
    source !== source.trim()
  ) {
    throw invalidOptions(
      "NTP servers must be non-empty strings without surrounding whitespace",
    );
  }

  let host: string;
  let port = DEFAULT_PORT;
  if (source.startsWith("[")) {
    const match = /^\[([^\]]+)\](?::([^:]+))?$/.exec(source);
    if (!match || isIP(match[1]) !== 6) {
      throw invalidOptions(
        `NTP server has invalid bracketed IPv6 syntax: ${source}`,
      );
    }
    host = match[1];
    if (match[2] !== undefined) port = parsePort(match[2], source);
  } else {
    const colonCount = [...source].filter(
      (character) => character === ":",
    ).length;
    if (colonCount > 1) {
      if (isIP(source) !== 6) {
        throw invalidOptions(
          `NTP server has invalid bare IPv6 syntax: ${source}`,
        );
      }
      host = source;
    } else if (colonCount === 1) {
      const separator = source.lastIndexOf(":");
      host = source.slice(0, separator);
      port = parsePort(source.slice(separator + 1), source);
    } else {
      host = source;
    }
  }

  if (!host || /\s/.test(host)) {
    throw invalidOptions(`NTP server has an invalid hostname: ${source}`);
  }
  return {
    source,
    host,
    port,
    family: isIP(host) === 6 ? "udp6" : "udp4",
  };
}

function validateOptions(options: GetNtpTipOptions): ValidatedOptions {
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
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw invalidOptions(
      "NTP requestTimeoutMs must be a positive safe integer",
    );
  }
  if (options.servers !== undefined && !Array.isArray(options.servers)) {
    throw invalidOptions("NTP servers must be an array");
  }
  if (
    options.signal !== undefined &&
    (typeof options.signal !== "object" ||
      typeof options.signal.addEventListener !== "function" ||
      typeof options.signal.removeEventListener !== "function")
  ) {
    throw invalidOptions("NTP signal must be an AbortSignal");
  }

  const servers = [
    ...(options.servers?.length ? options.servers : DEFAULT_SERVERS),
  ];
  servers.forEach(parseServer);
  return {
    startTime: options.startTime,
    blockTimeMS: options.blockTimeMS,
    servers,
    requestTimeoutMs,
    signal: options.signal,
  };
}

function writeTimestamp(buffer: Buffer, offset: number, unixMs: number): void {
  const ntpMs = unixMs + NTP_EPOCH_OFFSET_MS;
  const seconds = Math.floor(ntpMs / 1_000);
  const fraction = Math.floor(((ntpMs % 1_000) / 1_000) * 2 ** 32);
  buffer.writeUInt32BE(seconds >>> 0, offset);
  buffer.writeUInt32BE(fraction >>> 0, offset + 4);
}

function createRequest(timestamp: number): Buffer {
  const request = Buffer.alloc(48);
  request[0] = (4 << 3) | 3;
  writeTimestamp(request, 40, timestamp);
  return request;
}

async function closeOwnedSocket(socket: Socket): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function sampleServer(
  server: ParsedServer,
  signal: AbortSignal,
): Promise<number> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise<number>((resolve, reject) => {
    let socket: Socket;
    try {
      socket = createSocket(server.family);
    } catch (cause) {
      reject(
        new NtpTipError(
          "NETWORK",
          `Unable to create an NTP socket for ${server.source}`,
          { cause },
        ),
      );
      return;
    }

    let finished = false;
    const requestTimestamp = Date.now();
    const request = createRequest(requestTimestamp);

    const finish = (outcome: { value: number } | { error: unknown }) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", onAbort);
      socket.removeListener("error", onError);
      socket.removeListener("message", onMessage);
      void closeOwnedSocket(socket).then(() => {
        if ("value" in outcome) resolve(outcome.value);
        else reject(outcome.error);
      });
    };

    const onAbort = () => finish({ error: signal.reason });
    const onError = (cause: Error) =>
      finish({
        error: new NtpTipError(
          "NETWORK",
          `NTP socket failed for ${server.source}`,
          { cause },
        ),
      });
    const onMessage = (message: Buffer) => {
      const destinationTimestamp = Date.now();
      try {
        const packet = NtpPacketParser.parse(message);
        if (packet.version !== 4 || packet.mode !== 4) {
          throw new Error("response must be NTPv4 server mode");
        }
        if (
          packet.leapIndicator === 3 ||
          packet.stratum < 1 ||
          packet.stratum >= 16
        ) {
          throw new Error(
            "response clock is unsynchronized or has invalid stratum",
          );
        }
        if (!message.subarray(24, 32).equals(request.subarray(40, 48))) {
          throw new Error(
            "response origin timestamp does not echo the request transmit timestamp",
          );
        }
        const receiveTimestamp = packet.receiveTimestamp.getTime();
        const transmitTimestamp = packet.transmitTimestamp.getTime();
        if (
          !Number.isFinite(receiveTimestamp) ||
          !Number.isFinite(transmitTimestamp)
        ) {
          throw new Error(
            "response contains an invalid receive or transmit timestamp",
          );
        }
        const offset =
          (receiveTimestamp -
            requestTimestamp +
            (transmitTimestamp - destinationTimestamp)) /
          2;
        const correctedTimestamp = destinationTimestamp + offset;
        if (!Number.isFinite(offset) || !Number.isFinite(correctedTimestamp)) {
          throw new Error("response produced an invalid NTP offset");
        }
        finish({ value: correctedTimestamp });
      } catch (cause) {
        finish({
          error: new NtpTipError(
            "INVALID_RESPONSE",
            `Invalid NTP response from ${server.source}`,
            { cause },
          ),
        });
      }
    };

    signal.addEventListener("abort", onAbort, { once: true });
    socket.once("error", onError);
    socket.once("message", onMessage);
    try {
      socket.send(request, server.port, server.host, (cause) => {
        if (cause) onError(cause);
      });
    } catch (cause) {
      onError(cause as Error);
    }
  });
}

async function sampleNtpTime(
  operationSignal: AbortSignal,
  servers: readonly string[],
): Promise<number> {
  if (operationSignal.aborted) throw operationSignal.reason;
  const parsedServers = servers.map(parseServer);
  const requestController = new AbortController();
  const forwardAbort = () => requestController.abort(operationSignal.reason);
  operationSignal.addEventListener("abort", forwardAbort, { once: true });
  const requests = parsedServers.map((server) =>
    sampleServer(server, requestController.signal),
  );
  try {
    const winner = await Promise.any(requests);
    requestController.abort(SIBLING_CANCELLED);
    await Promise.allSettled(requests);
    return winner;
  } catch (cause) {
    await Promise.allSettled(requests);
    if (operationSignal.aborted) throw operationSignal.reason;
    const errors = cause instanceof AggregateError ? cause.errors : [cause];
    const invalid = errors.find(
      (error) =>
        error instanceof NtpTipError && error.code === "INVALID_RESPONSE",
    );
    if (invalid) throw invalid;
    const network = errors.find(
      (error) => error instanceof NtpTipError && error.code === "NETWORK",
    );
    if (network) throw network;
    throw new NtpTipError("NETWORK", "All NTP server requests failed", {
      cause,
    });
  } finally {
    operationSignal.removeEventListener("abort", forwardAbort);
  }
}

function startDeadline(
  timeoutMs: number,
  expire: () => void,
  runtime: TimerRuntime,
): { clear: () => void } {
  let remaining = timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    const delay = Math.min(remaining, MAX_TIMER_DELAY_MS);
    timer = runtime.setTimeout(() => {
      remaining -= delay;
      if (remaining === 0) expire();
      else schedule();
    }, delay);
  };
  schedule();
  return {
    clear() {
      if (timer !== undefined) runtime.clearTimeout(timer);
    },
  };
}

/**
 * Private source-level test seam. It is intentionally omitted from every
 * package barrel so callers cannot replace the NTP transport.
 */
export async function __getNtpTipWithSampler(
  options: GetNtpTipOptions,
  sampler: NtpTipSampler,
  runtime: TimerRuntime = { setTimeout, clearTimeout },
): Promise<NtpTip> {
  const validated = validateOptions(options);
  if (validated.signal?.aborted) {
    throw new NtpTipError("ABORTED", "NTP tip request was aborted", {
      cause: validated.signal.reason,
    });
  }

  const operationController = new AbortController();
  let terminalError: NtpTipError | undefined;
  const callerAbort = () => {
    if (terminalError) return;
    terminalError = new NtpTipError("ABORTED", "NTP tip request was aborted", {
      cause: validated.signal?.reason,
    });
    operationController.abort(terminalError);
  };
  validated.signal?.addEventListener("abort", callerAbort, { once: true });
  const deadline = startDeadline(
    validated.requestTimeoutMs,
    () => {
      if (terminalError) return;
      terminalError = new NtpTipError(
        "TIMEOUT",
        `NTP tip request timed out after ${validated.requestTimeoutMs}ms`,
        { timeoutMs: validated.requestTimeoutMs },
      );
      operationController.abort(terminalError);
    },
    runtime,
  );

  try {
    const timestamp = await sampler(
      operationController.signal,
      validated.servers,
    );
    if (terminalError) throw terminalError;
    if (!Number.isFinite(timestamp)) {
      throw new NtpTipError(
        "INVALID_TIME",
        "NTP returned an invalid timestamp",
      );
    }
    const height = Math.floor(
      (timestamp - validated.startTime) / validated.blockTimeMS,
    );
    if (!Number.isSafeInteger(height) || height < 0) {
      throw new NtpTipError(
        "INVALID_TIME",
        "NTP timestamp is before startTime or produces an unsafe height",
      );
    }
    return { height };
  } catch (cause) {
    if (terminalError) throw terminalError;
    if (cause instanceof NtpTipError) throw cause;
    throw new NtpTipError("NETWORK", "NTP sampling failed", { cause });
  } finally {
    deadline.clear();
    validated.signal?.removeEventListener("abort", callerAbort);
  }
}

/** Resolve one inclusive page from a bounded, one-shot NTP network sample. */
export function getNtpTip(options: GetNtpTipOptions): Promise<NtpTip> {
  return __getNtpTipWithSampler(options, sampleNtpTime);
}

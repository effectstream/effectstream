/**
 * Process spawn abstraction using node:child_process.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

/** Result of a spawned process. stdout/stderr are Web ReadableStreams so they can be pipeTo()'d. */
export interface SpawnChild {
  readonly pid: number;
  /** Present when options.stdin === "piped". */
  readonly stdin?: WritableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly status: Promise<{
    success: boolean;
    code?: number;
    signal?: string;
  }>;
  kill(signal?: NodeJS.Signals): void;
  ref(): void;
}

export interface SpawnOptions {
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  stdin?: "inherit" | "piped" | "null";
  stdout?: "inherit" | "piped" | "null";
  stderr?: "inherit" | "piped" | "null";
}

/** Output from a completed process (for spawnOutput). */
export interface SpawnOutputResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  success: boolean;
  code?: number;
  signal?: string;
}

/** Empty stream used when stdio is "inherit" so callers can always use pipeTo. */
function emptyReadableStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

/**
 * Spawn a child process. Returns a handle with Web ReadableStreams for stdout/stderr
 * so they can be used with pipeTo() in any runtime.
 */
export function spawn(command: string, options: SpawnOptions = {}): SpawnChild {
  const args = options.args ?? [];
  const stdio: ("inherit" | "pipe" | "ignore")[] = [
    options.stdin === "piped"
      ? "pipe"
      : options.stdin === "null"
        ? "ignore"
        : "inherit",
    options.stdout === "piped"
      ? "pipe"
      : options.stdout === "null"
        ? "ignore"
        : "inherit",
    options.stderr === "piped"
      ? "pipe"
      : options.stderr === "null"
        ? "ignore"
        : "inherit",
  ];

  const cp = nodeSpawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env, FORCE_COLOR: "true" },
    stdio,
    signal: options.signal,
  });

  const stdout: ReadableStream<Uint8Array> =
    options.stdout === "piped" && cp.stdout
      ? (Readable.toWeb(cp.stdout) as unknown as ReadableStream<Uint8Array>)
      : emptyReadableStream();
  const stderr: ReadableStream<Uint8Array> =
    options.stderr === "piped" && cp.stderr
      ? (Readable.toWeb(cp.stderr) as unknown as ReadableStream<Uint8Array>)
      : emptyReadableStream();

  const status = new Promise<{
    success: boolean;
    code?: number;
    signal?: string;
  }>((resolve) => {
    let settled = false;
    const finish = (value: { success: boolean; code?: number; signal?: string }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    cp.on("close", (code: number | null, signal: string | null) => {
      finish({
        success: code === 0,
        code: code ?? undefined,
        signal: signal ?? undefined,
      });
    });
    // A ChildProcess "error" with no listener is an uncaught exception. It is
    // emitted when the process cannot be spawned at all and, importantly, when
    // `options.signal` aborts a running child — the supported way to cancel a
    // long-lived child such as `pg_dump`.
    cp.on("error", () => {
      finish({ success: false });
    });
  });

  let stdinStream: WritableStream<Uint8Array> | undefined;
  if (options.stdin === "piped" && cp.stdin) {
    stdinStream = Writable.toWeb(cp.stdin) as WritableStream<Uint8Array>;
  }

  return {
    get pid() {
      return cp.pid ?? 0;
    },
    stdin: stdinStream,
    stdout,
    stderr,
    status,
    kill(signal?: NodeJS.Signals) {
      cp.kill(signal ?? "SIGTERM");
    },
    ref() {
      if (typeof cp.ref === "function") cp.ref();
    },
  };
}

/**
 * Run a command and wait for it to complete, returning collected stdout/stderr.
 * Use for short-lived commands (e.g. tmux install, kill-server).
 */
export async function spawnOutput(
  command: string,
  options: SpawnOptions & { stdinInput?: Uint8Array } = {},
): Promise<SpawnOutputResult> {
  const { stdinInput, ...spawnOpts } = options;
  const useStdin = stdinInput != null;
  const child = spawn(command, {
    ...spawnOpts,
    stdin: useStdin ? "piped" : spawnOpts.stdin,
    stdout: "piped",
    stderr: "piped",
  });

  if (useStdin && child.stdin) {
    const writer = child.stdin.getWriter();
    await writer.write(stdinInput);
    await writer.close();
  }

  const [stdout, stderr, status] = await Promise.all([
    streamToUint8Array(child.stdout),
    streamToUint8Array(child.stderr),
    child.status,
  ]);

  return {
    stdout,
    stderr,
    success: status.success,
    code: status.code,
    signal: status.signal,
  };
}

async function streamToUint8Array(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

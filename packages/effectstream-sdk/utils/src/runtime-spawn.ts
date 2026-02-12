/**
 * Cross-runtime process spawn abstraction.
 * Use this instead of Deno.Command or node:child_process.spawn when you need
 * code to run on Node, Bun, or Deno.
 */

/** Result of a spawned process. stdout/stderr are Web ReadableStreams so they can be pipeTo()'d. */
export interface SpawnChild {
  readonly pid: number;
  /** Present when options.stdin === "piped". */
  readonly stdin?: WritableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly status: Promise<{ success: boolean; code?: number; signal?: string }>;
  kill(signal?: string): void;
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

function spawnDeno(command: string, options: SpawnOptions = {}): SpawnChild {
  const args = options.args ?? [];
  const child = new (Deno as any).Command(command, {
    args,
    signal: options.signal,
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin ?? "inherit",
    stdout: options.stdout ?? "piped",
    stderr: options.stderr ?? "piped",
  }).spawn();

  const stdout =
    options.stdout === "piped"
      ? (child.stdout as ReadableStream<Uint8Array>)
      : emptyReadableStream();
  const stderr =
    options.stderr === "piped"
      ? (child.stderr as ReadableStream<Uint8Array>)
      : emptyReadableStream();

  const status = (child.status as Promise<{ success: boolean; code?: number; signal?: string }>).then(
    (s) => ({ success: s.success, code: s.code, signal: s.signal })
  );

  const stdin =
    options.stdin === "piped" && (child as any).stdin
      ? ((child as any).stdin as WritableStream<Uint8Array>)
      : undefined;

  return {
    get pid() {
      return child.pid;
    },
    stdin,
    stdout,
    stderr,
    status,
    kill(signal?: string) {
      child.kill(signal ?? "SIGTERM");
    },
    ref() {
      if (typeof child.ref === "function") child.ref();
    },
  };
}

function spawnNode(command: string, options: SpawnOptions = {}): SpawnChild {
  const { spawn } = require("node:child_process");
  const { Readable } = require("node:stream");

  const args = options.args ?? [];
  const stdio: ("inherit" | "pipe" | "ignore")[] = [
    options.stdin === "piped" ? "pipe" : options.stdin === "null" ? "ignore" : "inherit",
    options.stdout === "piped" ? "pipe" : options.stdout === "null" ? "ignore" : "inherit",
    options.stderr === "piped" ? "pipe" : options.stderr === "null" ? "ignore" : "inherit",
  ];

  const cp = spawn(command, args, {
    cwd: options.cwd,
    env: { ...options.env, FORCE_COLOR: "true" },
    stdio,
    signal: options.signal,
  });

  const stdout: ReadableStream<Uint8Array> =
    options.stdout === "piped" && cp.stdout
      ? (Readable.toWeb(cp.stdout) as ReadableStream<Uint8Array>)
      : emptyReadableStream();
  const stderr: ReadableStream<Uint8Array> =
    options.stderr === "piped" && cp.stderr
      ? (Readable.toWeb(cp.stderr) as ReadableStream<Uint8Array>)
      : emptyReadableStream();

  const status = new Promise<{ success: boolean; code?: number; signal?: string }>(
    (resolve) => {
      cp.on("close", (code: number | null, signal: string | null) => {
        resolve({
          success: code === 0,
          code: code ?? undefined,
          signal: signal ?? undefined,
        });
      });
    }
  );

  let stdinStream: WritableStream<Uint8Array> | undefined;
  if (options.stdin === "piped" && cp.stdin) {
    stdinStream = require("node:stream").Writable.toWeb(cp.stdin) as WritableStream<Uint8Array>;
  }

  return {
    get pid() {
      return cp.pid ?? 0;
    },
    stdin: stdinStream,
    stdout,
    stderr,
    status,
    kill(signal?: string) {
      cp.kill(signal ?? "SIGTERM");
    },
    ref() {
      if (typeof cp.ref === "function") cp.ref();
    },
  };
}

/**
 * Spawn a child process. Returns a handle with Web ReadableStreams for stdout/stderr
 * so they can be used with pipeTo() in any runtime.
 */
export function spawn(command: string, options: SpawnOptions = {}): SpawnChild {
  if (typeof Deno !== "undefined" && (Deno as any).Command) {
    return spawnDeno(command, options);
  }
  if (typeof process !== "undefined" && process.versions?.node) {
    return spawnNode(command, options);
  }
  throw new Error("No process spawn implementation (Deno.Command or node:child_process) available");
}

/**
 * Run a command and wait for it to complete, returning collected stdout/stderr.
 * Use for short-lived commands (e.g. tmux install, kill-server).
 */
export async function spawnOutput(
  command: string,
  options: SpawnOptions & { stdinInput?: Uint8Array } = {}
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

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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

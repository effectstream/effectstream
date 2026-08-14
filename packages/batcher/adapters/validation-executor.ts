// A bounded, killable pool for transaction validation.
//
// Validating a policy-conforming 46-output transfer costs ~2.2s of synchronous
// WASM (measured; 128ms for a simple transfer). That work has to happen
// somewhere other than the process that answers HTTP, and — more importantly —
// it has to be *reclaimable*: an unbounded or unkillable call is a denial-of-
// service vector wearing the costume of a validity check.
//
// Why child processes and not `worker_threads`, measured on Bun 1.3.10:
//
//   worker.terminate() on a worker inside a synchronous call NEVER SETTLES,
//   and the worker keeps a full core busy indefinitely — 198 of 200 CPU ticks
//   in the two seconds after the call. A thread pool would therefore leak one
//   core permanently per hung job, which is the exact failure this module
//   exists to prevent.
//
//   Bun.spawn + kill("SIGKILL") exits immediately with code 137 and gives the
//   core back. So: processes.
//
// Bun's IPC uses structured serialization, so transaction bytes and serialized
// ledger parameters cross as Uint8Array rather than inflating through base64.

import type { ValidationPhase, TxStage, WellFormedVerdict } from "./midnight-tx-validation.ts";
import { availableParallelism } from "node:os";

/** Why a job did not produce a verdict. Distinct from "the input is invalid". */
export type ValidationFailureKind =
  /** The pool is full and the queue is at its limit. Back-pressure. */
  | "saturated"
  /** The job exceeded its time budget; its worker was killed. */
  | "timeout"
  /** The worker died, or replied with something unusable. */
  | "worker-failed"
  /** The executor was closed while the job was outstanding. */
  | "closed";

/**
 * A job could not be *judged*. Never conflate this with a verdict: an input
 * the batcher failed to validate has not been found wanting, and callers must
 * defer it rather than reject it.
 */
export class ValidationUnavailableError extends Error {
  constructor(readonly kind: ValidationFailureKind, message: string) {
    super(message);
    this.name = "ValidationUnavailableError";
  }
}

/** Everything the child needs. Only plain data — no live WASM objects. */
export interface ValidationJob {
  /** Serialized transaction. */
  txBytes: Uint8Array;
  /** Serialized ledger parameters, from the fail-closed cache. */
  paramsBytes: Uint8Array;
  networkId: string;
  phase: ValidationPhase;
  /**
   * MUST come from the successful typed deserializer on the submitting side,
   * never from caller-supplied metadata: it selects whether signatures are
   * verified.
   */
  txStage: TxStage;
  nowMs: number;
  /** Return the flags actually applied by the child at the WASM boundary. */
  includeDiagnostics?: boolean;
}

export interface ValidationExecutorOptions {
  /**
   * Child entrypoint. Overridable so tests can drive the pool's lifecycle
   * (hang, crash, echo) without loading the ledger WASM.
   */
  workerScript?: string;
  /** Concurrent children. Defaults to all cores but one. */
  concurrency?: number;
  /** Jobs allowed to wait. Beyond this, `submit` rejects as `saturated`. */
  queueLimit?: number;
  /** Per-job budget. On expiry the child is SIGKILLed and replaced. */
  jobTimeoutMs?: number;
  /** Command used to run the worker script. */
  runtime?: string[];
}

interface PendingJob {
  job: ValidationJob;
  resolve: (verdict: WellFormedVerdict) => void;
  reject: (error: Error) => void;
}

interface Child {
  proc: ReturnType<typeof Bun.spawn>;
  /** The job this child is running, if any. */
  current: PendingJob | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** Set when we killed it deliberately, so its exit is not reported as a crash. */
  killedForTimeout: boolean;
  /** Set when the pool is discarding it, so its exit does not trigger a respawn. */
  retired: boolean;
}

const DEFAULT_QUEUE_LIMIT = 64;
const DEFAULT_JOB_TIMEOUT_MS = 10_000;

function defaultWorkerScript(): string {
  return new URL("./validation-worker.ts", import.meta.url).pathname;
}

export class ValidationExecutor {
  private readonly workerScript: string;
  private readonly concurrency: number;
  private readonly queueLimit: number;
  private readonly jobTimeoutMs: number;
  private readonly runtime: string[];

  private readonly children: Child[] = [];
  private readonly queue: PendingJob[] = [];
  private closed = false;

  /**
   * Live jobs, for tests and health.
   *
   * `pids` is what lets a test prove a timed-out child was actually killed
   * rather than merely abandoned — the distinction this whole module turns on.
   */
  get stats(): {
    busy: number;
    queued: number;
    children: number;
    pids: number[];
  } {
    return {
      busy: this.children.filter((c) => c.current !== null).length,
      queued: this.queue.length,
      children: this.children.length,
      pids: this.children.map((c) => c.proc.pid),
    };
  }

  constructor(options: ValidationExecutorOptions = {}) {
    this.workerScript = options.workerScript ?? defaultWorkerScript();
    // Leave a core for the event loop: the point is to stop competing with it.
    this.concurrency = Math.max(1, options.concurrency ?? availableParallelism() - 1);
    this.queueLimit = options.queueLimit ?? DEFAULT_QUEUE_LIMIT;
    this.jobTimeoutMs = options.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
    this.runtime = options.runtime ?? ["bun"];

    // Pre-warm: spawning is far more expensive than a thread, and paying it on
    // the first request would show up as latency exactly when load arrives.
    for (let i = 0; i < this.concurrency; i += 1) this.spawnChild();
  }

  /**
   * Validate one transaction.
   *
   * Rejects with {@link ValidationUnavailableError} when the pool could not
   * reach a verdict. That is deliberately a different channel from an invalid
   * verdict, because the two demand opposite responses: defer versus reject.
   */
  submit(job: ValidationJob): Promise<WellFormedVerdict> {
    if (this.closed) {
      return Promise.reject(
        new ValidationUnavailableError("closed", "validation executor is closed"),
      );
    }
    if (this.queue.length >= this.queueLimit) {
      // Fail fast rather than growing an unbounded backlog: a queue that
      // accepts everything just moves the collapse further out.
      return Promise.reject(
        new ValidationUnavailableError(
          "saturated",
          `validation queue is full (${this.queue.length}/${this.queueLimit})`,
        ),
      );
    }

    return new Promise<WellFormedVerdict>((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  /** Stop the pool and fail every outstanding job. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    for (const pending of this.queue.splice(0)) {
      pending.reject(
        new ValidationUnavailableError("closed", "validation executor closed"),
      );
    }
    for (const child of this.children.splice(0)) {
      child.retired = true;
      if (child.timer) clearTimeout(child.timer);
      const current = child.current;
      child.current = null;
      current?.reject(
        new ValidationUnavailableError("closed", "validation executor closed"),
      );
      child.proc.kill("SIGKILL");
    }
  }

  private spawnChild(): Child {
    const child: Child = {
      proc: undefined as unknown as ReturnType<typeof Bun.spawn>,
      current: null,
      timer: null,
      killedForTimeout: false,
      retired: false,
    };

    child.proc = Bun.spawn([...this.runtime, this.workerScript], {
      ipc: (message: unknown) => this.onChildMessage(child, message),
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      onExit: () => this.onChildExit(child),
    });

    this.children.push(child);
    return child;
  }

  private onChildMessage(child: Child, message: unknown): void {
    const pending = child.current;
    if (!pending) return; // Late reply from a job we already gave up on.

    if (child.timer) clearTimeout(child.timer);
    child.timer = null;
    child.current = null;

    const verdict = readVerdict(message);
    if (verdict) pending.resolve(verdict);
    else {
      pending.reject(
        new ValidationUnavailableError(
          "worker-failed",
          `validation worker returned an unusable reply: ${JSON.stringify(message)}`,
        ),
      );
    }

    this.pump();
  }

  private onChildExit(child: Child): void {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);

    if (child.timer) clearTimeout(child.timer);
    child.timer = null;

    const pending = child.current;
    child.current = null;
    if (pending) {
      pending.reject(
        child.killedForTimeout
          ? new ValidationUnavailableError(
            "timeout",
            `validation exceeded ${this.jobTimeoutMs}ms and its worker was killed`,
          )
          : new ValidationUnavailableError(
            "worker-failed",
            "validation worker exited before replying",
          ),
      );
    }

    // Replace it, unless we are shutting down. Eager rather than lazy: a
    // replacement spawned on demand would put startup cost on the next job's
    // critical path, which is when load is highest.
    if (!this.closed && !child.retired) {
      this.spawnChild();
      this.pump();
    }
  }

  private pump(): void {
    if (this.closed) return;
    for (const child of this.children) {
      if (this.queue.length === 0) return;
      if (child.current) continue;

      const pending = this.queue.shift()!;
      child.current = pending;
      child.killedForTimeout = false;

      try {
        child.proc.send(pending.job);
      } catch (error) {
        child.current = null;
        pending.reject(
          new ValidationUnavailableError(
            "worker-failed",
            `could not hand the job to a validation worker: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
        continue;
      }

      child.timer = setTimeout(() => {
        // SIGKILL, not a Promise race: a timed-out Promise leaves the WASM
        // call burning a core for as long as it likes (measured — see the
        // module header). Killing the process is the only way to get it back.
        child.killedForTimeout = true;
        child.proc.kill("SIGKILL");
      }, this.jobTimeoutMs);
    }
  }
}

/** A reply is only a verdict if it actually looks like one. Fails closed. */
function readVerdict(message: unknown): WellFormedVerdict | null {
  if (!message || typeof message !== "object") return null;
  const candidate = message as Record<string, unknown>;
  if (typeof candidate.valid !== "boolean") return null;
  return {
    valid: candidate.valid,
    errorCode: candidate.errorCode as WellFormedVerdict["errorCode"],
    reason: typeof candidate.reason === "string" ? candidate.reason : undefined,
    diagnostics: candidate.diagnostics as WellFormedVerdict["diagnostics"],
  };
}

// --- Process-global, reference-counted instance -------------------------
//
// Several adapters share one process and one machine. Each holding its own
// pool would multiply the core count by the number of products, so they share
// — and because they also close independently, the pool is refcounted: one
// adapter shutting down must not take the executor away from the others.

let sharedExecutor: ValidationExecutor | null = null;
let sharedRefCount = 0;

export interface ValidationExecutorHandle {
  readonly executor: ValidationExecutor;
  /** Idempotent: releasing twice must not drop someone else's reference. */
  release(): Promise<void>;
}

export function acquireValidationExecutor(
  options: ValidationExecutorOptions = {},
): ValidationExecutorHandle {
  if (!sharedExecutor) sharedExecutor = new ValidationExecutor(options);
  sharedRefCount += 1;

  const executor = sharedExecutor;
  let released = false;

  return {
    executor,
    release: async () => {
      if (released) return;
      released = true;
      sharedRefCount -= 1;
      if (sharedRefCount <= 0 && sharedExecutor === executor) {
        sharedExecutor = null;
        sharedRefCount = 0;
        await executor.close();
      }
    },
  };
}

/** Test-only: forget the shared instance without closing it. */
export function __resetSharedValidationExecutor(): void {
  sharedExecutor = null;
  sharedRefCount = 0;
}

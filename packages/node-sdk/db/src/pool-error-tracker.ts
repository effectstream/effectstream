import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import { isTransientPgError } from "./transient-pg-errors.ts";

function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw != null ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** After this long, treat continuous transient failures as a real outage. */
const SUSTAINED_THRESHOLD_MS = envMs("POOL_SUSTAINED_THRESHOLD_MS", 60_000);
/** After this long, exit so the orchestrator restarts the process. */
const FATAL_THRESHOLD_MS = envMs("POOL_FATAL_THRESHOLD_MS", 5 * 60_000);

export interface PoolErrorTrackerOptions {
  /** Failure age that escalates to ERROR. Default: `POOL_SUSTAINED_THRESHOLD_MS`, else 60 s. */
  sustainedMs?: number;
  /** Failure age that ends the process. Default: `POOL_FATAL_THRESHOLD_MS`, else 5 min. */
  fatalMs?: number;
  /** Clock in epoch milliseconds. Default: `Date.now`. */
  now?: () => number;
  /**
   * Called with exit code 1 on the tick after a fatal failure is logged.
   * Default: `process.exit`.
   */
  exit?: (code: number) => void;
}

/**
 * Tracks consecutive transient pool errors. Severity escalates WARN → ERROR
 * once failures persist past the sustained threshold, and the process exits
 * past the fatal threshold (relying on the orchestrator's restart policy).
 * Call `markHealthy()` on any positive signal to reset.
 */
export class PoolErrorTracker {
  private consecutive = 0;
  private firstFailureAt = 0;
  private readonly sustainedMs: number;
  private readonly fatalMs: number;
  private readonly now: () => number;
  private readonly exit: (code: number) => void;

  constructor(options: PoolErrorTrackerOptions = {}) {
    this.sustainedMs = options.sustainedMs ?? SUSTAINED_THRESHOLD_MS;
    this.fatalMs = options.fatalMs ?? FATAL_THRESHOLD_MS;
    this.now = options.now ?? (() => Date.now());
    this.exit = options.exit ?? ((code) => process.exit(code));
  }

  log(err: unknown, tags: string[]): void {
    // Non-transient errors are a different failure mode (auth, schema, etc.).
    if (!isTransientPgError(err)) {
      log.remote(
        ComponentNames.EFFECTSTREAM_PGLITE,
        tags,
        SeverityNumber.ERROR,
        (l) => l(err),
      );
      return;
    }

    if (this.consecutive === 0) this.firstFailureAt = this.now();
    this.consecutive++;

    const durationMs = this.now() - this.firstFailureAt;
    const sustained = durationMs >= this.sustainedMs;
    const fatal = durationMs >= this.fatalMs;

    log.remote(
      ComponentNames.EFFECTSTREAM_PGLITE,
      fatal
        ? [...tags, "sustained-failure", "fatal"]
        : sustained
        ? [...tags, "sustained-failure"]
        : tags,
      sustained ? SeverityNumber.ERROR : SeverityNumber.WARN,
      (l) => l({ err, consecutive: this.consecutive, durationMs }),
    );

    if (fatal) {
      // Defer to the next tick so the log line above has a chance to flush.
      setImmediate(() => this.exit(1));
    }
  }

  /** Call when the DB has proven reachable (e.g. successful pool connect). */
  markHealthy(): void {
    this.consecutive = 0;
    this.firstFailureAt = 0;
  }

  /** Read-only snapshot for health checks, heartbeats, or external probes. */
  state(): {
    consecutive: number;
    firstFailureAt: number;
    sustainedDurationMs: number;
    sustained: boolean;
  } {
    const durationMs = this.firstFailureAt === 0
      ? 0
      : this.now() - this.firstFailureAt;
    return {
      consecutive: this.consecutive,
      firstFailureAt: this.firstFailureAt,
      sustainedDurationMs: durationMs,
      sustained: durationMs >= this.sustainedMs,
    };
  }
}

/** Process-wide singleton — failures aggregate at DB-health granularity. */
export const poolErrors = new PoolErrorTracker();

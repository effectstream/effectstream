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

/**
 * Tracks consecutive transient pool errors. Severity escalates WARN → ERROR
 * once failures persist past `SUSTAINED_THRESHOLD_MS`, and the process exits
 * past `FATAL_THRESHOLD_MS` (relying on the orchestrator's restart policy).
 * Call `markHealthy()` on any positive signal to reset.
 */
export class PoolErrorTracker {
  private consecutive = 0;
  private firstFailureAt = 0;

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

    if (this.consecutive === 0) this.firstFailureAt = Date.now();
    this.consecutive++;

    const durationMs = Date.now() - this.firstFailureAt;
    const sustained = durationMs >= SUSTAINED_THRESHOLD_MS;
    const fatal = durationMs >= FATAL_THRESHOLD_MS;

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
      setImmediate(() => process.exit(1));
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
      : Date.now() - this.firstFailureAt;
    return {
      consecutive: this.consecutive,
      firstFailureAt: this.firstFailureAt,
      sustainedDurationMs: durationMs,
      sustained: durationMs >= SUSTAINED_THRESHOLD_MS,
    };
  }
}

/** Process-wide singleton — failures aggregate at DB-health granularity. */
export const poolErrors = new PoolErrorTracker();

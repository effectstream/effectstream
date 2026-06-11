import { SeverityNumber } from "@opentelemetry/api-logs";
import { log } from "./mod.ts";

/**
 * Install a process-wide `unhandledRejection` handler.
 *
 * By default the handler logs the error at ERROR and re-crashes the process
 * via `process.exit(1)` — preserving the "let it crash" semantic that Node /
 * Bun apply when no handler is registered. The point of installing this
 * handler is *visibility*: without it, Bun crashes silently with no log line
 * about what the rejection actually was.
 *
 * Pass `shouldSurvive` to opt specific errors out of the crash — useful for
 * known-transient failures from external systems (e.g. a pg pool ECONNRESET
 * from a serverless Postgres cold-start). Surviving errors are logged at
 * WARN; non-surviving ones at ERROR before exit.
 *
 * Idempotent: only the first call in this module registers a listener.
 */
let unhandledRejectionLoggerInstalled = false;

/**
 * Build the `unhandledRejection` handler in isolation from `process.on`.
 *
 * The fatal-exit step is injected (`onFatal`, defaulting to `process.exit`) so
 * the decision — *does this rejection crash the process or survive?* — can be
 * exercised in a test without actually killing the test runner. This is the
 * unit-level guard for the zombie failure mode: anything that is **not**
 * classified survivable (e.g. a generic error escaping the effection root)
 * must hit `onFatal`, never just log-and-continue.
 *
 * @returns the number of `onFatal` calls would-be (for the install path this is
 * ignored; tests inspect their injected spy).
 */
export function buildUnhandledRejectionHandler(
  componentName: string,
  shouldSurvive?: (reason: unknown) => boolean,
  onFatal: (code: number) => void = (code) => process.exit(code),
): (reason: unknown) => void {
  return (reason: unknown) => {
    const survive = shouldSurvive?.(reason) ?? false;
    log.remote(
      componentName,
      ["unhandledRejection"],
      survive ? SeverityNumber.WARN : SeverityNumber.ERROR,
      (log) => log(reason),
    );
    if (!survive) onFatal(1);
  };
}

export function installUnhandledRejectionLogger(
  componentName: string,
  shouldSurvive?: (reason: unknown) => boolean,
): void {
  if (unhandledRejectionLoggerInstalled) return;
  unhandledRejectionLoggerInstalled = true;
  process.on(
    "unhandledRejection",
    buildUnhandledRejectionHandler(componentName, shouldSurvive),
  );
}

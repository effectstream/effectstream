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

export function installUnhandledRejectionLogger(
  componentName: string,
  shouldSurvive?: (reason: unknown) => boolean,
): void {
  if (unhandledRejectionLoggerInstalled) return;
  unhandledRejectionLoggerInstalled = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const survive = shouldSurvive?.(reason) ?? false;
    log.remote(
      componentName,
      ["unhandledRejection"],
      survive ? SeverityNumber.WARN : SeverityNumber.ERROR,
      (log) => log(reason),
    );
    if (!survive) process.exit(1);
  });
}

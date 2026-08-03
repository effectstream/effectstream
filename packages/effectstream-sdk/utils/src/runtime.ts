type RuntimeEnvironment = 'backend' | 'frontend' | 'unknown';
type Runtime = 'node' | 'deno' | 'bun' | 'browser' | 'unknown';

export function getRuntime(): {runtime: Runtime, environment: RuntimeEnvironment} {
  // Check for Deno
  // @ts-ignore: Deno is added to global scope in Deno environments
  if (typeof Deno !== 'undefined') {
    return { runtime: 'deno', environment: 'backend' };
  }

  // Check for Bun
  // @ts-ignore: Bun is added to global scope in Bun environments
  if (typeof Bun !== 'undefined') {
    return { runtime: 'bun', environment: 'backend' };
  }

  // Check for Node.js
  // Node environments have a `process` object with versions
  if (
    typeof process !== 'undefined' &&
    (process as any).versions &&
    (process as any).versions.node
  ) {
    return { runtime: 'node', environment: 'backend' };
  }

  // Check for Browser
  // Browsers typically have `window` and `document`
  if (
    typeof window !== 'undefined' &&
    // @ts-ignore: document is added to global scope in browser environments
    typeof document !== 'undefined'
  ) {
    return { runtime: 'browser', environment: 'frontend' };
  }

  return { runtime: 'unknown', environment: 'unknown' };
}

/**
 * Helpers for common process operations.
 *
 * These are node-only by nature, but this module is reachable from BROWSER
 * bundles: `AddressType` is a value export of this package, so importing it
 * (as @effectstream/wallets' IProvider does) pulls the barrel, and the barrel
 * re-exports config.ts — which calls getEnv() at module top level. An
 * unguarded `process` there is a hard `ReferenceError: process is not defined`
 * at import time, before any app code runs.
 *
 * `getEnv` therefore degrades to `undefined` in a browser (an unset variable
 * is the truthful answer there). The mutating/process-control helpers below
 * still throw, because silently doing nothing would hide a real porting bug.
 */

const hasProcess = (): boolean =>
  typeof process !== "undefined" && process != null;

/** Get environment variable. Returns undefined where there is no process. */
export function getEnv(key: string): string | undefined {
  if (!hasProcess()) return undefined;
  return process.env?.[key];
}

/** Set environment variable. */
export function setEnv(key: string, value: string): void {
  if (!hasProcess()) {
    throw new Error(
      `setEnv(${key}) is not available in this runtime — there is no process to mutate.`,
    );
  }
  process.env[key] = value;
}

/** CLI arguments (argv without script path). */
export function args(): string[] {
  return process.argv.slice(2);
}

/** Exit process with code. */
export function exit(code: number): never {
  return process.exit(code);
}

/** Current working directory. */
export function cwd(): string {
  return process.cwd();
}

/** Terminal size when available. */
export function consoleSize(): { columns: number; rows: number } {
  return {
    columns: process.stdout.columns ?? 80,
    rows: (process.stdout as any).rows ?? 24,
  };
}

/** Set process exit code (for graceful shutdown). */
export function setExitCode(code: number): void {
  process.exitCode = code;
}

/** Check if error is "file/dir not found". */
export function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { code?: string };
    if (e.code === "ENOENT") return true;
  }
  return false;
}

// Filesystem helpers (makeTempDir, readDir, etc.) live in `./fs.ts` under
// the `@effectstream/utils/fs` subpath export. They intentionally do NOT
// re-export from this file, because this file is re-exported by the package
// barrel (`mod.ts`) — dragging `node:fs/promises` into browser bundles.

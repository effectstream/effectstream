/**
 * Helpers for common process operations.
 */

/** Get environment variable. */
export function getEnv(key: string): string | undefined {
  return process.env[key];
}

/** Set environment variable. */
export function setEnv(key: string, value: string): void {
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

/** Cross-runtime process spawn. Re-exported from runtime-spawn. */
export {
  spawn,
  spawnOutput,
  type SpawnChild,
  type SpawnOptions,
  type SpawnOutputResult,
} from "./runtime-spawn.ts";

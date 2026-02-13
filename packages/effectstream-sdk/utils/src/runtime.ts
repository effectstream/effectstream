/**
 * Cross-runtime helpers for Node, Bun, and Deno.
 * Prefer these over Deno.* or process.* when you need code to run in multiple runtimes.
 */

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
  cwd(): string;
  stdout: { columns?: number; rows?: number };
  on(sig: string, fn: () => void): void;
  off(sig: string, fn: () => void): void;
  kill?(pid: number, sig?: string): void;
};

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

/** Get environment variable. Works in Node, Bun, and Deno. */
export function getEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
}

/** Set environment variable. Works in Node, Bun, and Deno. */
export function setEnv(key: string, value: string): void {
  if (typeof process !== "undefined" && process.env) {
    process.env[key] = value;
  }
}

/** CLI arguments (argv without script path). */
export function args(): string[] {
  return process.argv.slice(2);
}

/** Exit process with code. */
export function exit(code: number | undefined): never {
  if (code === undefined && (process as any).exitCode !== undefined) {
    process.exit((process as any).exitCode);
    } else {
    process.exit(code);
  }
}

/** Current working directory. */
export function cwd(): string {
  if (typeof process !== "undefined" && process.cwd) return process.cwd();
  return ".";
}

/** Terminal size when available. */
export function consoleSize(): { columns: number; rows: number } {
  if (typeof process !== "undefined" && process.stdout?.columns != null) {
    return { columns: process.stdout.columns ?? 80, rows: (process.stdout as any).rows ?? 24 };
  }
  return { columns: 80, rows: 24 };
}

/** Set process exit code (for graceful shutdown). */
export function setExitCode(code: number): void {
  (process as any).exitCode = code;
}

/**
 * Register a test. Uses Deno.test when in Deno, node:test when in Node.
 * Use: import { test } from "@effectstream/utils/runtime";
 */
export function test(
  name: string,
  fn: () => void | Promise<void>,
): void {
  if (typeof process !== "undefined") {
    try {
      // dynamic import for ESM; require for CJS
      const mod = typeof require !== "undefined"
        ? require("node:test")
        : null;
      if (mod?.test) mod.test(name, fn);
      return;
    } catch {
      // node:test not available
    }
  }
  throw new Error("No test runner available");
}

/** Check if error is "file/dir not found". */
export function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { code?: string; name?: string };
    if (e.code === "ENOENT") return true;
    if (e.name === "NotFound" || (e as any).constructor?.name === "NotFound") return true;
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

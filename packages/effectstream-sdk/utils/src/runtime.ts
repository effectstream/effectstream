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

/** Get environment variable. Works in Node, Bun, and Deno. */
export function getEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) return process.env[key];
  if (typeof Deno !== "undefined" && (Deno as any).env?.get) return (Deno as any).env.get(key);
  return undefined;
}

/** Set environment variable. Works in Node, Bun, and Deno. */
export function setEnv(key: string, value: string): void {
  if (typeof process !== "undefined" && process.env) {
    process.env[key] = value;
    return;
  }
  if (typeof Deno !== "undefined" && (Deno as any).env?.set) (Deno as any).env.set(key, value);
}

/** CLI arguments (argv without script path). */
export function args(): string[] {
  if (typeof process !== "undefined" && process.argv) return process.argv.slice(2);
  if (typeof Deno !== "undefined" && (Deno as any).args) return (Deno as any).args;
  return [];
}

/** Exit process with code. */
export function exit(code: number): never {
  if (typeof process !== "undefined" && process.exit) process.exit(code);
  if (typeof Deno !== "undefined" && (Deno as any).exit) (Deno as any).exit(code);
  throw new Error(`exit(${code})`);
}

/** Current working directory. */
export function cwd(): string {
  if (typeof process !== "undefined" && process.cwd) return process.cwd();
  if (typeof Deno !== "undefined" && (Deno as any).cwd) return (Deno as any).cwd();
  return ".";
}

/** Terminal size when available. */
export function consoleSize(): { columns: number; rows: number } {
  if (typeof process !== "undefined" && process.stdout?.columns != null) {
    return { columns: process.stdout.columns ?? 80, rows: (process.stdout as any).rows ?? 24 };
  }
  if (typeof Deno !== "undefined" && (Deno as any).consoleSize) {
    return (Deno as any).consoleSize();
  }
  return { columns: 80, rows: 24 };
}

/** Set process exit code (for graceful shutdown). */
export function setExitCode(code: number): void {
  if (typeof process !== "undefined") (process as any).exitCode = code;
  if (typeof Deno !== "undefined") (Deno as any).exitCode = code;
}

/**
 * Register a test. Uses Deno.test when in Deno, node:test when in Node.
 * Use: import { test } from "@effectstream/utils/runtime";
 */
export function test(
  name: string,
  fn: () => void | Promise<void>,
): void {
  if (typeof Deno !== "undefined" && (Deno as any).test) {
    (Deno as any).test(name, fn);
    return;
  }
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
  throw new Error("No test runner (Deno.test or node:test) available");
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

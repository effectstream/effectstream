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

/** Get environment variable. */
export function getEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
}

/** Set environment variable. */
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
 * Register a test with the ambient test runner.
 * - Under `deno test`, registers with `Deno.test`.
 * - Under `node --test` / `bun test`, registers with `node:test`.
 * Use: import { test } from "@effectstream/utils/runtime";
 */
export function test(
  name: string,
  fn: () => void | Promise<void>,
): void {
  // @ts-ignore: Deno is added to global scope in Deno environments
  if (typeof Deno !== "undefined" && typeof Deno.test === "function") {
    // @ts-ignore
    Deno.test(name, fn);
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

// ---------------------------------------------------------------------------
// Filesystem primitives
//
// Thin wrappers over `node:fs/promises`, which works identically under Deno,
// Node, and Bun — so there is no runtime branching here. The surface area is
// intentionally small: only what the codebase actually uses.
// ---------------------------------------------------------------------------

import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Create a unique temp directory and return its absolute path. */
export async function makeTempDir(opts: { prefix?: string } = {}): Promise<string> {
  return await mkdtemp(join(tmpdir(), opts.prefix ?? "tmp-"));
}

/** Create a directory (and parents) if missing. */
export async function mkdirRecursive(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/** Write a UTF-8 string to `path`, overwriting any existing file. */
export async function writeTextFile(path: string, data: string): Promise<void> {
  await writeFile(path, data, "utf8");
}

/** Set access and modification times on `path` (accepts Date or ms). */
export async function setFileTimes(
  path: string,
  atime: Date | number,
  mtime: Date | number,
): Promise<void> {
  await utimes(
    path,
    atime instanceof Date ? atime : new Date(atime),
    mtime instanceof Date ? mtime : new Date(mtime),
  );
}

/**
 * Remove a file or directory. Pass `recursive` to delete non-empty dirs,
 * and `ignoreMissing` to swallow ENOENT.
 */
export async function remove(
  path: string,
  opts: { recursive?: boolean; ignoreMissing?: boolean } = {},
): Promise<void> {
  try {
    await rm(path, { recursive: opts.recursive ?? false, force: false });
  } catch (e) {
    if (opts.ignoreMissing && isNotFoundError(e)) return;
    throw e;
  }
}

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

/** List entries in a directory. Throws (with a NotFound-shaped error) if missing. */
export async function* readDir(path: string): AsyncIterable<DirEntry> {
  const entries = await readdir(path, { withFileTypes: true });
  for (const e of entries) {
    yield { name: e.name, isFile: e.isFile(), isDirectory: e.isDirectory() };
  }
}

/** Stat a file; returns mtime as ms since epoch (0 if unavailable). */
export async function statMtime(path: string): Promise<number> {
  const s = await stat(path);
  return s.mtimeMs ?? s.mtime?.getTime() ?? 0;
}

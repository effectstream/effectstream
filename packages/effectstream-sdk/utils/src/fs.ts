/**
 * Cross-runtime filesystem primitives.
 *
 * Thin wrappers over `node:fs/promises`, which works identically under Deno,
 * Node, and Bun — no runtime branching. The surface area is intentionally
 * small: only what the codebase actually uses.
 *
 * ## Why this lives in its own entry, not in `runtime.ts`
 *
 * `runtime.ts` is re-exported from the package barrel (`mod.ts`). Anything
 * that imports from `@effectstream/utils` (e.g. the explorer client bundled
 * by Vite) drags the entire re-exported graph along. Keeping fs helpers in
 * `runtime.ts` means any browser build pulls `node:fs/promises`,
 * `node:os`, and `node:path` into its bundle — which Vite rightly rejects.
 *
 * This file is deliberately **not** re-exported from `mod.ts`. Importers
 * must reach for the `@effectstream/utils/fs` subpath explicitly, and
 * client/browser code stays clean.
 */

import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isNotFoundError } from "./runtime.ts";

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

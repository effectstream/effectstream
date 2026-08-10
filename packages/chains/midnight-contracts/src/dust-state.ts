// Dust-state persistence — the ONLY disk I/O behind the `./wallet-info`
// subpath, split into its own module so it stays out of browser bundles.
//
// `get-wallet-info.ts` is reachable from browsers (MidnightLocal.connectFromSeed
// imports it to build the wallet facade), and previously carried these
// functions along with their `node:fs` import. Bundlers shim `node:fs` to an
// empty/null module, which once crashed the whole entry at import time and,
// after that was patched, still shipped dead fs/path polyfills to the client.
// Here the functions are reached only via a lazy `await import()` inside
// `waitForDustFundsWithRetry` — a node-side flow — so `node:fs`/`node:path`
// never enter the browser's static graph at all.
import * as path from "node:path";
import * as fs from "node:fs";
import { createHash } from "node:crypto";

const log = console;

/**
 * Build the dust state file path from network + seed.
 *
 * Keyed by a hash of the FULL seed: a prefix of the raw seed is not unique —
 * conventional dev seeds differ only in their last characters
 * (0x00…0002, 0x00…0003, …) and would all collide on one cache file, so one
 * wallet would restore another's dust state. That is harmless with a single
 * wallet per process and actively wrong once one process runs several.
 * Hashing also keeps seed material out of file names.
 *
 * `networkId` is stripped to a safe character set before it reaches
 * `path.join`. No caller currently passes untrusted input here (`networkId`
 * comes from the wallet SDK's own enum or a local CLI env var), but nothing
 * upstream enforces that, and a `networkId` containing `../` would otherwise
 * let the resulting path escape `baseDir`.
 */
export function getDustStatePath(baseDir: string, networkId: string, seed: string): string {
  const seedKey = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  const safeNetworkId = networkId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(baseDir, `${safeNetworkId}-${seedKey}.json`);
}

function isUndeployedNetwork(networkId: string): boolean {
  return networkId.toLowerCase() === "undeployed";
}

/**
 * Save serialized dust wallet state to disk.
 * No-ops for "undeployed" networks (chain resets make cached state invalid).
 * @param seed - Wallet seed hex string (used to derive stable file path)
 */
export function saveDustState(
  baseDir: string,
  networkId: string,
  seed: string,
  serializedState: string,
): string | null {
  if (isUndeployedNetwork(networkId)) return null;
  const filePath = getDustStatePath(baseDir, networkId, seed);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Atomic: a torn write leaves a wallet unable to restore its state, and
    // concurrent writers (multi-wallet / multi-product processes) would
    // otherwise interleave into one file.
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, serializedState, "utf-8");
    fs.renameSync(tmpPath, filePath);
    log.info(`Dust state saved to ${filePath}`);
    return filePath;
  } catch (e) {
    log.warn(`Failed to save dust state to ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Load previously saved dust wallet state from disk.
 * Always returns null for "undeployed" networks.
 * @param seed - Wallet seed hex string (used to derive stable file path)
 */
export function loadDustState(
  baseDir: string,
  networkId: string,
  seed: string,
): string | null {
  if (isUndeployedNetwork(networkId)) return null;
  const filePath = getDustStatePath(baseDir, networkId, seed);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

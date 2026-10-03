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

const log = console;

/**
 * Build the dust state file path from network + seed.
 * Uses first 16 hex chars of the seed as a stable identifier — the seed
 * deterministically maps to a dust address, so this is a unique key per wallet
 * that is available before building the facade.
 *
 * `networkId` is stripped to a safe character set before it reaches
 * `path.join`. No caller currently passes untrusted input here (`networkId`
 * comes from the wallet SDK's own enum or a local CLI env var), but nothing
 * upstream enforces that, and a `networkId` containing `../` would otherwise
 * let the resulting path escape `baseDir`.
 */
export function getDustStatePath(baseDir: string, networkId: string, seed: string): string {
  const seedKey = seed.slice(0, 16);
  const safeNetworkId = networkId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(baseDir, `${safeNetworkId}-${seedKey}.json`);
}

/**
 * `text` with the seed-derived file name of `filePath` replaced, for logs
 * (00050 E7: the name embeds the first 16 hex characters of the seed).
 */
function redactPath(text: string, filePath: string): string {
  return text.split(path.basename(filePath)).join("<dust-state file>");
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
    fs.writeFileSync(filePath, serializedState, "utf-8");
    // The file name embeds a seed prefix: log only the directory (00050 E7).
    log.info(`Dust state saved in ${path.dirname(filePath)} (${networkId})`);
    return filePath;
  } catch (e) {
    log.warn(
      `Failed to save dust state in ${path.dirname(filePath)} (${networkId}): ` +
        redactPath(e instanceof Error ? e.message : String(e), filePath),
    );
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

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
 * Options shared by save/load.
 *
 * `snapshotNetworkId` exists for one caller and should stay that way: the
 * dust-restore harness (test/dust-restore-harness.ts) deliberately drives a
 * wallet bound to `undeployed` while keying persistence under a *named* id,
 * because a local stack can only ever be `undeployed` and persistence no-ops
 * there — the only way to exercise restore locally at all (Phase 1 §2). Every
 * production caller wants the default, where the id the snapshot recorded must
 * equal the id we are loading it for.
 */
export interface DustStateOptions {
  /** Network id the snapshot body is expected to carry. Default: `networkId`. */
  snapshotNetworkId?: string;
  /**
   * Dust public key this seed's wallet must have, as a decimal string — see
   * `deriveDustPublicKey`. When given, a snapshot belonging to a different
   * wallet is neither loaded nor written, which is what keeps a caller that
   * pairs the wrong seed with a wallet (the adapter's injected-wallet path)
   * from handing one wallet's dust state to another. Opt-in because it costs a
   * key derivation; every caller in this package opts in.
   */
  expectedPublicKey?: string;
}

/** The facts we can check about a snapshot without the wallet SDK. */
export interface DustSnapshotFacts {
  /** Network id the snapshot recorded for itself. */
  networkId: string;
  /** Dust public key of the wallet that wrote it, as a decimal string. */
  publicKey: string;
  /** `progress.appliedIndex` at save time; 0 when the field was absent. */
  offset: bigint;
  /**
   * False when the SDK wrote no `offset`. The field is optional in
   * `SnapshotSchema`, and a missing one silently degrades restore into a full
   * replay (`Serialization.ts:100` reads `snapshot.offset ?? 0n`) — worth a
   * warning, not a rejection: a full replay is what we would do anyway.
   */
  hasOffset: boolean;
}

function isHexString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length % 2 === 0 &&
    /^[0-9a-fA-F]+$/.test(value);
}

function toOffset(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

/**
 * Validate a serialized snapshot against the shape
 * `wallet-sdk-dust-wallet@4.2.0` writes (`Serialization.ts:62-70`) and pull out
 * the two facts we can act on. Returns null for anything we would rather
 * cold-sync than hand to `DustWallet.restore`.
 *
 * This is a *shape* check, not a decode: `state` carries raw
 * `ledger.DustLocalState` bytes whose meaning belongs to `@midnight-ntwrk/
 * ledger-v8`, and there is no format-version envelope to check it against
 * (master-plan Q4). A snapshot that passes here can still fail to decode after
 * a ledger upgrade, which is why the restore call site *also* falls back to a
 * cold sync instead of throwing.
 *
 * Deliberately not strict beyond the recorded fields: an SDK that adds a field
 * must not silently disable persistence. An SDK that *renames* one will fail
 * here — loudly, in the log, degrading to a cold sync rather than to garbage.
 */
export function readDustSnapshotFacts(serializedState: string): DustSnapshotFacts | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedState);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const s = parsed as Record<string, unknown>;

  const publicKey = s.publicKey;
  if (!publicKey || typeof publicKey !== "object" || Array.isArray(publicKey)) return null;
  const dustPublicKey = (publicKey as Record<string, unknown>).publicKey;
  if (dustPublicKey === undefined || dustPublicKey === null) return null;

  if (!isHexString(s.state)) return null;
  if (s.protocolVersion === undefined || s.protocolVersion === null) return null;
  if (typeof s.networkId !== "string" || s.networkId.length === 0) return null;

  const hasOffset = s.offset !== undefined && s.offset !== null;
  const offset = hasOffset ? toOffset(s.offset) : 0n;
  if (offset === null) return null;

  return {
    networkId: s.networkId,
    publicKey: String(dustPublicKey),
    offset,
    hasOffset,
  };
}

function sameNetwork(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function readSnapshotFactsAt(filePath: string): DustSnapshotFacts | null {
  try {
    return readDustSnapshotFacts(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Move an unusable snapshot aside so the next process start cannot restore it
 * again, without destroying the evidence an operator needs to explain a
 * surprise cold sync. One `.rejected` file is kept per wallet; a second
 * rejection overwrites it (rename is atomic, so there is never a window with
 * neither file).
 */
export function quarantineDustState(
  baseDir: string,
  networkId: string,
  seed: string,
  reason: string,
): string | null {
  if (isUndeployedNetwork(networkId)) return null;
  const filePath = getDustStatePath(baseDir, networkId, seed);
  const rejectedPath = `${filePath}.rejected`;
  try {
    fs.renameSync(filePath, rejectedPath);
    log.warn(
      `Dust state ${filePath} was unusable (${reason}); moved to ${rejectedPath}. ` +
        `This wallet will sync from scratch.`,
    );
    return rejectedPath;
  } catch (e) {
    if (!isMissingFile(e)) {
      log.warn(
        `Failed to quarantine unusable dust state ${filePath}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return null;
  }
}

function isMissingFile(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "ENOENT";
}

/** The exact shape {@link saveDustState} gives its temp file, and only that. */
const TMP_SUFFIX_PATTERN = /^\.(\d+)\.tmp$/;

/**
 * Is this pid running? `EPERM` means the process exists and belongs to someone
 * else — very much alive — so only `ESRCH` counts as gone.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as { code?: string }).code === "EPERM";
  }
}

/**
 * Delete `<snapshot>.<pid>.tmp` siblings left behind by processes that died
 * mid-save, and report what went.
 *
 * `saveDustState`'s `catch` block already unlinks the temp file when a *write*
 * fails. It cannot help when the process is killed: `SIGKILL` runs no catch
 * block, and the preprod kill matrix measured **8 of 14 `kill -9`s leaking a
 * full 5.1 MB temp file** (sweep brief §2 step 4). A crash-looping batcher
 * therefore leaks a whole snapshot per restart, unbounded. Phase 1 predicted
 * this from code review but could not observe it at a 13.7 KB payload, where
 * the write is over too fast to be caught.
 *
 * Two files are deliberately never swept:
 *
 * - **Anything owned by a live pid.** That temp file is that process's
 *   in-flight write, and removing it makes its `rename` fail — trading an
 *   unbounded leak for a lost checkpoint is not an improvement.
 * - **Anything owned by THIS pid.** It is either the write currently in
 *   flight, or the residue of one whose `catch` block already tried; deleting
 *   our own active temp file would be self-inflicted.
 *
 * A dead pid that has since been *reused* by an unrelated process makes us skip
 * a file we could have removed. That is the safe direction: the leak survives
 * one more cycle, nobody's write is destroyed, and the next sweep sees a
 * different pid table.
 *
 * Scoped to siblings of this wallet's snapshot: every wallet sweeps its own on
 * save and on load, so a shared state directory is covered without one wallet
 * reaching into another's files.
 */
export function sweepStaleDustStateTmpFiles(
  baseDir: string,
  networkId: string,
  seed: string,
): string[] {
  if (isUndeployedNetwork(networkId)) return [];
  const filePath = getDustStatePath(baseDir, networkId, seed);
  const dirPath = path.dirname(filePath);
  const base = path.basename(filePath);

  let entries: string[];
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    // No directory yet, or unreadable. Nothing to sweep either way.
    return [];
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.startsWith(`${base}.`)) continue;
    const match = TMP_SUFFIX_PATTERN.exec(entry.slice(base.length));
    if (!match) continue;
    const pid = Number(match[1]);
    // `process.kill(0, ...)` signals the entire process group, so a
    // non-positive "pid" must never reach the liveness check. Nothing we write
    // can produce one; a file that claims otherwise is not ours to delete.
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;
    if (pid === process.pid) continue;
    if (isProcessAlive(pid)) continue;

    const orphanPath = path.join(dirPath, entry);
    try {
      fs.unlinkSync(orphanPath);
      removed.push(orphanPath);
    } catch {
      // Raced with the owner's own cleanup, or we lack permission. Either way
      // the next save or load tries again.
    }
  }
  if (removed.length > 0) {
    log.info(
      `Swept ${removed.length} stale dust-state temp file(s) left by killed ` +
        `processes: ${removed.join(", ")}`,
    );
  }
  return removed;
}

/**
 * Persist the directory entry created by a rename. Best-effort: opening a
 * directory for fsync is a POSIX behaviour that not every platform or
 * filesystem supports, and failing to durably record the rename is strictly
 * better than failing the save.
 */
function syncDirectory(dirPath: string): void {
  let dirFd: number | undefined;
  try {
    dirFd = fs.openSync(dirPath, "r");
    fs.fsyncSync(dirFd);
  } catch {
    /* not supported here; the file's own fsync still happened */
  } finally {
    if (dirFd !== undefined) {
      try {
        fs.closeSync(dirFd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Save serialized dust wallet state to disk.
 * No-ops for "undeployed" networks (chain resets make cached state invalid).
 *
 * Refuses to write a snapshot that is malformed, belongs to another network,
 * or whose `offset` regresses below the one already on disk. The regression
 * rule is the one that matters operationally: Phase 1 §2 measured the batcher
 * re-persisting a *poisoned* snapshot on the stall path (gwi:707) and again on
 * final failure (gwi:721), so an unusable state outlived the process and every
 * restart repeated the same ~5-minute failure. A save may move a snapshot
 * forward or leave it where it is; it may never move it backwards.
 *
 * @param seed - Wallet seed hex string (used to derive stable file path)
 */
export function saveDustState(
  baseDir: string,
  networkId: string,
  seed: string,
  serializedState: string,
  options?: DustStateOptions,
): string | null {
  if (isUndeployedNetwork(networkId)) return null;
  const filePath = getDustStatePath(baseDir, networkId, seed);

  // Before the validity guards, not after: a batcher that crash-loops while
  // its snapshot is being rejected (offset regression, network mismatch) still
  // returns here every checkpoint, and that is exactly the process that leaks.
  sweepStaleDustStateTmpFiles(baseDir, networkId, seed);

  const incoming = readDustSnapshotFacts(serializedState);
  if (!incoming) {
    log.warn(
      `Refusing to save malformed dust state to ${filePath} — keeping whatever is already there.`,
    );
    return null;
  }
  const expectedNetworkId = options?.snapshotNetworkId ?? networkId;
  if (!sameNetwork(incoming.networkId, expectedNetworkId)) {
    log.warn(
      `Refusing to save dust state to ${filePath}: snapshot records networkId ` +
        `"${incoming.networkId}" but this wallet is on "${expectedNetworkId}".`,
    );
    return null;
  }
  if (options?.expectedPublicKey && incoming.publicKey !== options.expectedPublicKey) {
    log.warn(
      `Refusing to save dust state to ${filePath}: the snapshot belongs to dust wallet ` +
        `${incoming.publicKey}, but this file is keyed for ${options.expectedPublicKey}.`,
    );
    return null;
  }
  const existing = readSnapshotFactsAt(filePath);
  if (existing && incoming.offset < existing.offset) {
    log.warn(
      `Refusing to save dust state to ${filePath}: offset would regress ` +
        `${existing.offset} -> ${incoming.offset}. Keeping the newer snapshot.`,
    );
    return null;
  }

  // Atomic: a torn write leaves a wallet unable to restore its state, and
  // concurrent writers (multi-wallet / multi-product processes) would
  // otherwise interleave into one file.
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // fsync before rename, and again on the directory afterwards. Phase 1's
    // kill -9 matrix (14/14 clean) proved rename atomicity against process
    // death, which is all the page cache needs to survive — but a kernel panic
    // or power loss can still lose the data or reorder it past the rename, and
    // the whole point of the snapshot is that it is there after a hard stop.
    const fd = fs.openSync(tmpPath, "w");
    try {
      fs.writeFileSync(fd, serializedState, "utf-8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, filePath);
    syncDirectory(path.dirname(filePath));
    log.info(`Dust state saved to ${filePath}`);
    return filePath;
  } catch (e) {
    log.warn(`Failed to save dust state to ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    // A failed write or rename otherwise leaves the `.pid.tmp` behind forever
    // (Phase 1's atomic-write review). Now that saves happen every few minutes
    // rather than once at init, a leak here would accumulate.
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* nothing to clean up, or we cannot — either way the save already failed */
    }
    return null;
  }
}

/**
 * Load previously saved dust wallet state from disk.
 * Always returns null for "undeployed" networks.
 *
 * Returns null — i.e. "cold-sync this wallet" — for any snapshot we would
 * otherwise hand to `DustWallet.restore` without knowing it is usable:
 * malformed or truncated JSON, missing required fields, or a snapshot recorded
 * on a different network. `networkId` is the one identity field the snapshot
 * carries and Phase 1 §2 measured that nobody ever compared it: the SDK's
 * `restore` only reads the configured id in `startWithSeed`/`startWithSecretKey`
 * (`DustWallet.ts:295-300`), so a snapshot from another chain restored silently.
 *
 * Rejection is logged at warn level and never throws: a cold sync is expensive
 * (~66 min on preprod) but survivable; handing bad state to `restore` is not —
 * it throws synchronously out of wallet init.
 *
 * @param seed - Wallet seed hex string (used to derive stable file path)
 */
export function loadDustState(
  baseDir: string,
  networkId: string,
  seed: string,
  options?: DustStateOptions,
): string | null {
  if (isUndeployedNetwork(networkId)) return null;
  const filePath = getDustStatePath(baseDir, networkId, seed);

  // Startup is the one moment we know the previous run's writer is gone, so it
  // is where a leak from a killed process is cheapest to clear — and it runs
  // even when there is no snapshot to load, which is the crash-loop case that
  // never reached a successful save.
  sweepStaleDustStateTmpFiles(baseDir, networkId, seed);

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const facts = readDustSnapshotFacts(raw);
  if (!facts) {
    log.warn(
      `Ignoring dust state at ${filePath}: malformed, truncated, or missing required ` +
        `fields. Syncing this wallet from scratch.`,
    );
    return null;
  }
  const expectedNetworkId = options?.snapshotNetworkId ?? networkId;
  if (!sameNetwork(facts.networkId, expectedNetworkId)) {
    log.warn(
      `Ignoring dust state at ${filePath}: recorded networkId "${facts.networkId}" ` +
        `does not match "${expectedNetworkId}". Syncing this wallet from scratch.`,
    );
    return null;
  }
  if (options?.expectedPublicKey && facts.publicKey !== options.expectedPublicKey) {
    log.warn(
      `Ignoring dust state at ${filePath}: it belongs to dust wallet ${facts.publicKey}, ` +
        `not ${options.expectedPublicKey}. Syncing this wallet from scratch.`,
    );
    return null;
  }
  if (!facts.hasOffset) {
    log.warn(
      `Dust state at ${filePath} carries no offset — restore will replay the whole ` +
        `event log rather than resuming.`,
    );
  }
  return raw;
}

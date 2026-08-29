import { ENV } from "@effectstream/utils/node-env";
import { cwd } from "@effectstream/utils/runtime";
import {
  mkdirRecursive,
  readDir,
  remove,
  statMtime,
} from "@effectstream/utils/fs";
import { spawnOutput } from "@effectstream/utils/runtime-spawn";
import { ensure, sleep, until, type Operation } from "effection";

/** `process.env` works under Node, Bun, and Deno (via node: compat). */
declare const process: { env: Record<string, string | undefined> };

export interface SnapshotRetentionConfig {
  /** One per hour for last 24 h. Default: `true` */
  lastDayHourly?: boolean;
  /** One per 6 h for last 3 days. Default: `true` */
  last3DaysSixHourly?: boolean;
  /** Days of daily snapshots to keep. Default: `7` */
  lastNDaysDaily?: number;
}

export interface SnapshotConfig {
  /** Wall-clock seconds between snapshots. Default: `3600` (1 hour) */
  intervalSeconds?: number;
  /** Output directory. Default: `"./snapshots"` */
  path?: string;
  /** Time-based tiered retention (uses file mtime). */
  retention?: SnapshotRetentionConfig;
}

interface ResolvedSnapshotConfig {
  intervalSeconds: number;
  path: string;
  retention: Required<SnapshotRetentionConfig>;
}

/**
 * Precedence: explicit config field > env var > hardcoded default.
 * Env vars other than INTERVAL_SECONDS carry their hardcoded defaults inside
 * `ENV.getConfig`, so `??` here only needs to cover INTERVAL_SECONDS (whose
 * env `defaultValue` is intentionally `undefined`).
 */
function resolveSnapshotConfig(config?: SnapshotConfig): ResolvedSnapshotConfig {
  return {
    intervalSeconds:
      config?.intervalSeconds
      ?? ENV.EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS
      ?? 3600,
    path: config?.path ?? ENV.EFFECTSTREAM_SNAPSHOT_PATH,
    retention: {
      lastDayHourly:
        config?.retention?.lastDayHourly
        ?? ENV.EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY,
      last3DaysSixHourly:
        config?.retention?.last3DaysSixHourly
        ?? ENV.EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY,
      lastNDaysDaily:
        config?.retention?.lastNDaysDaily
        ?? ENV.EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS,
    },
  };
}

/**
 * Creates a database snapshot using `pg_dump` in custom format (`-F c`).
 * Must be called AFTER releasing the DB mutex (pg_dump opens its own connection).
 *
 * @param signal - optional; aborting it kills the `pg_dump` child. Pass one
 *   whenever the caller's own lifetime is bounded (see {@link runSnapshotLoop}),
 *   otherwise a cancelled caller leaves a full dump running unsupervised.
 *
 * @see docs/home/1000-effectstream-engine/1003-database-snapshots.md
 */
export async function createSnapshot(
  config?: SnapshotConfig,
  signal?: AbortSignal,
): Promise<void> {
  // pg_dump queries pg_catalog directly; PGlite's catalog may not match the
  // locally-installed pg_dump version, so skip snapshots under PGlite.
  if (ENV.PGLITE) {
    console.log(`[Snapshot] Skipping: pg_dump is not compatible with PGlite.`);
    return;
  }

  const resolved = resolveSnapshotConfig(config);
  const snapshotDir = resolved.path;
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}/, "");
  const snapshotPath = `${snapshotDir}/snapshot-${timestamp}.dump`;

  await mkdirRecursive(snapshotDir);
  console.log(`[Snapshot] Creating snapshot at ${snapshotPath}...`);

  // Inherit the ambient env and add PGPASSWORD. `process.env` is populated on
  // Node/Bun natively and on Deno via node:compat when --allow-env is set.
  const ambientEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) ambientEnv[k] = v;
  }

  const result = await spawnOutput("pg_dump", {
    args: [
      "-h", ENV.DB_HOST,
      "-p", String(ENV.DB_PORT),
      "-U", ENV.DB_USER,
      "-d", ENV.DB_NAME,
      "-F", "c",
      "-f", snapshotPath,
    ],
    env: { ...ambientEnv, PGPASSWORD: ENV.DB_PW ?? "" },
    stdout: "inherit",
    stderr: "inherit",
    signal,
  });
  if (!result.success) {
    throw new Error(`[Snapshot] pg_dump failed with exit code ${result.code}`);
  }

  console.log(`[Snapshot] Snapshot created: ${snapshotPath}`);
  await applyRetentionPolicy(snapshotDir, resolved.retention);
}

/**
 * Long-lived fiber that fires snapshots on a fixed cadence, independent of
 * block production. Spawn once at startup; cadence is `intervalSeconds`.
 * Blocking on `createSnapshot` makes overlapping dumps structurally impossible.
 */
export function* runSnapshotLoop(
  snapshotConfig: SnapshotConfig,
): Operation<void> {
  const resolved = resolveSnapshotConfig(snapshotConfig);
  const intervalMs = resolved.intervalSeconds * 1000;
  console.log(`[Snapshot] Loop started (interval ${intervalMs / 1000}s, path ${resolved.path}, cwd ${cwd()})`);

  // A dump is a child process holding its own database connection. `until`
  // only abandons the promise on cancellation, so without this the loop can be
  // torn down while `pg_dump` keeps running — the runtime would report a clean
  // shutdown with a live child still writing.
  let abortInFlight: (() => void) | undefined;
  let inFlightExit: Promise<void> | undefined;
  yield* ensure(function* () {
    abortInFlight?.();
    if (inFlightExit) yield* until(inFlightExit);
  });

  while (true) {
    yield* sleep(intervalMs);
    console.log(`[Snapshot] Firing`);
    const controller = new AbortController();
    const dump = createSnapshot(resolved, controller.signal);
    abortInFlight = () => controller.abort();
    // Settles when the child is gone, however it ended; the rejection is
    // observed here so abandoning `dump` cannot become an unhandled rejection.
    inFlightExit = dump.then(() => {}, () => {});
    try {
      yield* until(dump);
      console.log(`[Snapshot] Done; sleeping ${intervalMs / 1000}s`);
    } catch (e) {
      console.error("[Snapshot] Failed:", e);
    }
    // Deliberately not in a `finally`: on cancellation the generator's finally
    // blocks run BEFORE the `ensure` above, which would clear the handle the
    // ensure needs to kill the child.
    abortInFlight = undefined;
    inFlightExit = undefined;
  }
}

/**
 * Time-based tiered retention: keeps one file per bucket (newest wins),
 * deletes everything beyond `lastNDaysDaily` days.
 *
 * Bucket keys are derived from the file's wall-clock mtime, not from its
 * age relative to `now`. A file's bucket is therefore fixed at write time
 * and does not slide forward every tick, which is what lets files actually
 * age into the 6-hourly and daily tiers.
 */
export async function applyRetentionPolicy(
  snapshotDir: string,
  retention: Required<SnapshotRetentionConfig>,
  nowMs: number = Date.now(),
): Promise<void> {
  const { lastDayHourly, last3DaysSixHourly, lastNDaysDaily } = retention;

  const now    = nowMs;
  const MS_1H  = 3_600_000;
  const MS_24H = 24 * MS_1H;
  const MS_3D  = 3  * MS_24H;
  const MS_ND  = lastNDaysDaily * MS_24H;

  const entries: { path: string; mtime: number }[] = [];

  try {
    for await (const entry of readDir(snapshotDir)) {
      if (!entry.isFile || !entry.name.startsWith("snapshot-") || !entry.name.endsWith(".dump")) continue;
      const filePath = `${snapshotDir}/${entry.name}`;
      try {
        const mtime = await statMtime(filePath);
        entries.push({ path: filePath, mtime });
      } catch { /* file vanished between readDir and stat */ }
    }
  } catch (e) {
    console.warn("[Snapshot] Could not read snapshot directory for retention:", e);
    return;
  }

  if (entries.length === 0) return;

  // Newest first so the first entry per bucket is always the one we keep.
  entries.sort((a, b) => b.mtime - a.mtime);

  const keepers     = new Set<string>();
  const seenBuckets = new Set<string>();

  for (const entry of entries) {
    const age = now - entry.mtime;
    if (age > MS_ND) continue;

    let bucketKey: string;

    if (age <= MS_24H) {
      if (!lastDayHourly) { keepers.add(entry.path); continue; }
      bucketKey = `h:${Math.floor(entry.mtime / MS_1H)}`;
    } else if (age <= MS_3D) {
      if (!last3DaysSixHourly) { keepers.add(entry.path); continue; }
      bucketKey = `6h:${Math.floor(entry.mtime / (6 * MS_1H))}`;
    } else {
      bucketKey = `d:${Math.floor(entry.mtime / MS_24H)}`;
    }

    if (!seenBuckets.has(bucketKey)) {
      seenBuckets.add(bucketKey);
      keepers.add(entry.path);
    }
  }

  for (const entry of entries) {
    if (!keepers.has(entry.path)) {
      try {
        await remove(entry.path);
        console.log(`[Snapshot] Retention: deleted ${entry.path}`);
      } catch (e) {
        console.warn(`[Snapshot] Failed to delete ${entry.path}:`, e);
      }
    }
  }
}

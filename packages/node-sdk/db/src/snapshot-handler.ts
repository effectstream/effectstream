import { ENV } from "@effectstream/utils/node-env";

export interface SnapshotRetentionConfig {
  /** One per hour for last 24 h. Default: `true` */
  lastDayHourly?: boolean;
  /** One per 6 h for last 3 days. Default: `true` */
  last3DaysSixHourly?: boolean;
  /** Days of daily snapshots to keep. Default: `7` */
  lastNDaysDaily?: number;
}

export interface SnapshotConfig {
  /** Rollup blocks between snapshots. Default: `100` */
  interval?: number;
  /** Output directory. Default: `"./snapshots"` */
  path?: string;
  /** Time-based tiered retention (uses file mtime). */
  retention?: SnapshotRetentionConfig;
}

/**
 * Creates a database snapshot using `pg_dump` in custom format (`-F c`).
 * Must be called AFTER releasing the DB mutex (pg_dump opens its own connection).
 *
 * @see docs/home/1000-effectstream-engine/1003-database-snapshots.md
 */
export async function createSnapshot(
  blockHeight: number,
  config?: SnapshotConfig,
): Promise<void> {
  // pg_dump queries pg_catalog directly; PGlite's catalog may not match the
  // locally-installed pg_dump version, so skip snapshots under PGlite.
  if (ENV.PGLITE) {
    console.log(`[Snapshot] Skipping at block ${blockHeight}: pg_dump is not compatible with PGlite.`);
    return;
  }

  const snapshotDir = config?.path ?? "./snapshots";
  const snapshotPath = `${snapshotDir}/snapshot-${blockHeight}.dump`;

  await Deno.mkdir(snapshotDir, { recursive: true });
  console.log(`[Snapshot] Creating snapshot at ${snapshotPath}...`);

  const cmd = new Deno.Command("pg_dump", {
    args: [
      "-h", ENV.DB_HOST,
      "-p", String(ENV.DB_PORT),
      "-U", ENV.DB_USER,
      "-d", ENV.DB_NAME,
      "-F", "c",
      "-f", snapshotPath,
    ],
    env: { PGPASSWORD: ENV.DB_PW ?? "" },
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await cmd.output();
  if (!status.success) {
    throw new Error(`[Snapshot] pg_dump failed with exit code ${status.code}`);
  }

  console.log(`[Snapshot] Snapshot created: ${snapshotPath}`);
  await applyRetentionPolicy(snapshotDir, config?.retention);
}

/**
 * Time-based tiered retention: keeps one file per bucket (newest wins),
 * deletes everything beyond `lastNDaysDaily` days.
 */
async function applyRetentionPolicy(
  snapshotDir: string,
  retention?: SnapshotRetentionConfig,
): Promise<void> {
  const lastDayHourly      = retention?.lastDayHourly      ?? true;
  const last3DaysSixHourly = retention?.last3DaysSixHourly ?? true;
  const lastNDaysDaily     = retention?.lastNDaysDaily      ?? 7;

  const now    = Date.now();
  const MS_1H  = 3_600_000;
  const MS_24H = 24 * MS_1H;
  const MS_3D  = 3  * MS_24H;
  const MS_ND  = lastNDaysDaily * MS_24H;

  const entries: { path: string; mtime: number }[] = [];

  try {
    for await (const entry of Deno.readDir(snapshotDir)) {
      if (!entry.isFile || !entry.name.startsWith("snapshot-") || !entry.name.endsWith(".dump")) continue;
      const filePath = `${snapshotDir}/${entry.name}`;
      try {
        const stat = await Deno.stat(filePath);
        entries.push({ path: filePath, mtime: stat.mtime?.getTime() ?? 0 });
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
      bucketKey = `h:${Math.floor(age / MS_1H)}`;
    } else if (age <= MS_3D) {
      if (!last3DaysSixHourly) { keepers.add(entry.path); continue; }
      bucketKey = `6h:${Math.floor(age / (6 * MS_1H))}`;
    } else {
      bucketKey = `d:${Math.floor(age / MS_24H)}`;
    }

    if (!seenBuckets.has(bucketKey)) {
      seenBuckets.add(bucketKey);
      keepers.add(entry.path);
    }
  }

  for (const entry of entries) {
    if (!keepers.has(entry.path)) {
      try {
        await Deno.remove(entry.path);
        console.log(`[Snapshot] Retention: deleted ${entry.path}`);
      } catch (e) {
        console.warn(`[Snapshot] Failed to delete ${entry.path}:`, e);
      }
    }
  }
}

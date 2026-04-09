import { ENV } from "@effectstream/utils/node-env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotRetentionConfig {
  /**
   * Keep one snapshot per hour for the last 24 hours.
   * Default: true
   */
  lastDayHourly?: boolean;
  /**
   * Keep one snapshot per 6-hour window for the last 3 days
   * (excluding the last 24 hours, which is covered by `lastDayHourly`).
   * Default: true
   */
  last3DaysSixHourly?: boolean;
  /**
   * Keep one snapshot per day for the last N days
   * (excluding the last 3 days, which are covered by the tiers above).
   * Default: 7
   */
  lastNDaysDaily?: number;
}

export interface SnapshotConfig {
  /**
   * How many rollup blocks to wait between snapshots.
   * Default: 100
   */
  interval?: number;
  /**
   * Directory where snapshot files are written.
   * Default: "./snapshots"
   */
  path?: string;
  /**
   * Time-based tiered retention policy.
   * Uses file mtime to decide which snapshots to keep.
   * See {@link SnapshotRetentionConfig} for tier details.
   */
  retention?: SnapshotRetentionConfig;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a database snapshot at `blockHeight` using **pg_dump**.
 *
 * ## Why pg_dump instead of PGlite's `dumpDataDir()`
 *
 * The previous approach (see `feature/db-snapshots`) called `db.dumpDataDir()`
 * from inside the PGlite TCP-server wrapper (`start-pglite.ts`). This only
 * worked for PGlite because the hook lived inside that process.
 *
 * `pg_dump` connects to the database via the standard PostgreSQL wire protocol
 * and therefore works identically for:
 * - **PGlite** – which exposes a pg-gateway TCP server on `DB_PORT`
 * - **Real PostgreSQL** – a regular `pg_dump` run
 *
 * ## Locking behaviour
 *
 * `pg_dump` uses PostgreSQL's **MVCC** to snapshot the database at the moment
 * the command starts. It holds only an `ACCESS SHARE` lock on each table.
 *
 * - **Not blocked:** `SELECT`, `INSERT`, `UPDATE`, `DELETE` — the node sync
 *   process continues uninterrupted.
 * - **Blocked:** DDL commands (`DROP TABLE`, `TRUNCATE`, `ALTER TABLE`,
 *   `VACUUM FULL`) are blocked for the duration of the dump.
 *
 * ## Snapshot format
 *
 * Snapshots are written in pg_dump **custom format** (`-F c`), which is
 * compressed and supports selective table restore via `pg_restore`.
 *
 * ## How to restore a snapshot
 *
 * ```bash
 * # Restore into an existing database (drops & recreates objects):
 * pg_restore -h localhost -p 5432 -U postgres -d postgres --clean snapshot-N.dump
 *
 * # List the contents of a dump without restoring:
 * pg_restore --list snapshot-N.dump
 *
 * # Restore only a specific table:
 * pg_restore -h localhost -p 5432 -U postgres -d postgres -t my_table snapshot-N.dump
 * ```
 *
 * ## IMPORTANT – DB mutex must be released before calling this
 *
 * For PGlite, `pg_dump` opens its own TCP connection to the gateway server.
 * If the DB mutex is still held when `createSnapshot` is called, PGlite will
 * deadlock waiting for the mutex. Always call this function *after* releasing
 * `acquireDBMutex`.
 *
 * @param blockHeight - Rollup block number at which the snapshot is taken.
 *                      Used as part of the filename for human readability.
 * @param config      - Snapshot configuration. All fields are optional;
 *                      sensible defaults are applied when omitted.
 */
export async function createSnapshot(
  blockHeight: number,
  config?: SnapshotConfig,
): Promise<void> {
  // pg_dump connects via the PostgreSQL wire protocol and queries pg_catalog
  // tables directly. PGlite emulates a specific PostgreSQL version whose
  // catalog schema may not exactly match the locally-installed pg_dump binary,
  // leading to errors like "column daticulocale does not exist". Skip snapshot
  // creation entirely when running under PGlite.
  if (ENV.PGLITE) {
    console.log(`[Snapshot] Skipping snapshot at block ${blockHeight}: pg_dump is not compatible with PGlite.`);
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
      // Custom format: compressed, allows pg_restore to selectively restore tables.
      // Use pg_restore (not psql) to apply these files.
      "-F", "c",
      // Write directly to a file rather than stdout; pg_dump handles the I/O
      // itself so the runtime does not need to buffer the dump in memory.
      "-f", snapshotPath,
    ],
    env: {
      // PGPASSWORD is the standard mechanism for non-interactive authentication.
      // PGlite's pg-gateway uses "trust" auth, so the password is ignored there.
      PGPASSWORD: ENV.PGLITE ? "" : (ENV.DB_PW ?? ""),
    },
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

// ---------------------------------------------------------------------------
// Retention policy
// ---------------------------------------------------------------------------

/**
 * Applies a **time-based tiered retention policy** to `.dump` files in
 * `snapshotDir`.
 *
 * File age is determined by `mtime`. The three tiers are:
 *
 * | Age of file        | What is kept                              |
 * |--------------------|-------------------------------------------|
 * | ≤ 24 hours         | One snapshot per **hour** (most recent)   |
 * | 24 h – 3 days      | One snapshot per **6-hour window**        |
 * | 3 days – N days    | One snapshot per **calendar day**         |
 * | > N days           | Deleted                                   |
 *
 * Within each bucket the **newest** file is kept; older files in the same
 * bucket are deleted.
 *
 * A tier can be disabled by setting the corresponding flag to `false`, in
 * which case all files in that age range are kept.
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

  // ---- Gather all .dump files with their mtime ----------------------------
  interface SnapshotEntry { path: string; mtime: number; }
  const entries: SnapshotEntry[] = [];

  try {
    for await (const entry of Deno.readDir(snapshotDir)) {
      if (
        !entry.isFile ||
        !entry.name.startsWith("snapshot-") ||
        !entry.name.endsWith(".dump")
      ) continue;

      const filePath = `${snapshotDir}/${entry.name}`;
      try {
        const stat = await Deno.stat(filePath);
        entries.push({ path: filePath, mtime: stat.mtime?.getTime() ?? 0 });
      } catch {
        // skip files that became inaccessible between readDir and stat
      }
    }
  } catch (e) {
    console.warn("[Snapshot] Could not read snapshot directory for retention:", e);
    return;
  }

  if (entries.length === 0) return;

  // Sort newest-first so the first entry in each bucket is always the newest.
  entries.sort((a, b) => b.mtime - a.mtime);

  // ---- Assign each file to a tier bucket ----------------------------------
  const keepers    = new Set<string>();
  const seenBuckets = new Set<string>();

  for (const entry of entries) {
    const age = now - entry.mtime;

    if (age > MS_ND) {
      // Beyond the maximum retention window — do not keep.
      continue;
    }

    let bucketKey: string;

    if (age <= MS_24H) {
      if (!lastDayHourly) {
        // Tier disabled → keep all files in this age range.
        keepers.add(entry.path);
        continue;
      }
      // Hour bucket (0 = most recent hour relative to now).
      bucketKey = `h:${Math.floor(age / MS_1H)}`;

    } else if (age <= MS_3D) {
      if (!last3DaysSixHourly) {
        keepers.add(entry.path);
        continue;
      }
      // Six-hour bucket.
      bucketKey = `6h:${Math.floor(age / (6 * MS_1H))}`;

    } else {
      // Daily bucket (3d – Nd range).
      bucketKey = `d:${Math.floor(age / MS_24H)}`;
    }

    if (!seenBuckets.has(bucketKey)) {
      seenBuckets.add(bucketKey);
      keepers.add(entry.path); // first (newest) file in this bucket wins
    }
  }

  // ---- Delete files not in keepers ----------------------------------------
  let deleted = 0;
  for (const entry of entries) {
    if (!keepers.has(entry.path)) {
      try {
        await Deno.remove(entry.path);
        console.log(`[Snapshot] Retention: deleted ${entry.path}`);
        deleted++;
      } catch (e) {
        console.warn(`[Snapshot] Failed to delete ${entry.path}:`, e);
      }
    }
  }

  if (deleted > 0) {
    console.log(
      `[Snapshot] Retention complete: kept ${keepers.size} snapshot(s), deleted ${deleted}.`,
    );
  }
}

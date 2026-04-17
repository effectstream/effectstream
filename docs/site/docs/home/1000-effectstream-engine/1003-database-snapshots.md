# Database Snapshots

Effectstream supports automated database snapshots using **`pg_dump`**. Snapshots let you take point-in-time backups of your node's database while it continues syncing — no downtime, no interruption.

## How it works

Snapshots are triggered by **wall-clock time** — once the configured interval (default: 1 hour) has elapsed since the last snapshot, the next processed block triggers a new one.

The runtime spawns `pg_dump` as a **background task** using Effection's `spawn()`, so the sync loop continues processing blocks while the dump runs. A guard flag prevents overlapping dumps — if `pg_dump` is still running when the next interval elapses, it waits until the current dump finishes.

Because `pg_dump` uses PostgreSQL's **MVCC**, it takes a consistent snapshot at the moment the command starts. Normal operations — `SELECT`, `INSERT`, `UPDATE`, `DELETE` — continue uninterrupted. Only DDL statements (`DROP TABLE`, `ALTER TABLE`, `TRUNCATE`) are briefly blocked.

This feature requires a **real PostgreSQL** instance — snapshots are skipped when running under PGlite (`PGLITE=true`), because PGlite's internal catalog schema may not match the locally-installed `pg_dump` version.

## Prerequisites

`pg_dump` connects to the database using the same connection variables your node already uses. Make sure these are set correctly in your environment:

| Variable | Description | Example |
|---|---|---|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PW` | PostgreSQL password | `mysecretpassword` |
| `DB_NAME` | Database to snapshot | `effectstream` |

These are the same variables used by the node's database connection — no extra configuration needed. The password is passed to `pg_dump` via the `PGPASSWORD` environment variable (the standard `libpq` mechanism).

Additionally, `pg_dump` must be installed and on the `PATH` of the process running the node:
- **Debian/Ubuntu:** `apt install postgresql-client`
- **macOS:** `brew install libpq`

## Setup

Add `snapshotConfig` to your `StartConfig`. Every field is optional — an empty object `{}` is enough to get started:

```typescript
yield* start({
  appName: "my-app",
  appVersion: "1.0.0",
  syncInfo: ...,
  // An empty object uses all defaults (every 3600 seconds, ./snapshots directory,
  // full tiered retention policy).
  snapshotConfig: {},
});
```

### Full configuration

```typescript
snapshotConfig: {
  // Wall-clock seconds between snapshots. Default: 3600 (1 hour)
  intervalSeconds: 1800,

  // Directory where .dump files are written. Default: "./snapshots"
  path: "./backups",

  retention: {
    // Keep one snapshot per hour for the last 24 hours. Default: true
    lastDayHourly: true,
    // Keep one snapshot per 6-hour window for the last 3 days. Default: true
    last3DaysSixHourly: true,
    // Keep one snapshot per day for the last N days. Default: 7
    lastNDaysDaily: 14,
  },
}
```

### Environment variable overrides

All config fields can also be driven from environment variables:

| Variable | Overrides | Default |
|---|---|---|
| `EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS` | `intervalSeconds` | `3600` (1 hour) |
| `EFFECTSTREAM_SNAPSHOT_PATH` | `path` | `./snapshots` |
| `EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY` | `retention.lastDayHourly` | `true` |
| `EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY` | `retention.last3DaysSixHourly` | `true` |
| `EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS` | `retention.lastNDaysDaily` | `7` |

## Retention policy

The retention policy is **time-based**, using each file's modification time (`mtime`). Three tiers apply automatically:

| File age | What is kept |
|---|---|
| ≤ 24 hours | One snapshot per **hour** |
| 24 hours – 3 days | One snapshot per **6-hour window** |
| 3 days – N days | One snapshot per **day** |
| Older than N days | Deleted |

Within each time window the **newest** file is kept; older files in the same window are deleted.

Setting a tier flag to `false` disables that tier's pruning — all files in that age range are kept as-is.

## Restoring a snapshot

Snapshot files use `pg_dump` custom format. Use `pg_restore` to apply them.

**Restore into an existing database (drops and recreates all objects):**
```bash
pg_restore -h localhost -p 5432 -U postgres -d postgres --clean snapshot-2026-04-09T14-30-00Z.dump
```

**List the contents of a dump without restoring:**
```bash
pg_restore --list snapshot-2026-04-09T14-30-00Z.dump
```

**Restore only a specific table:**
```bash
pg_restore -h localhost -p 5432 -U postgres -d postgres -t my_table snapshot-2026-04-09T14-30-00Z.dump
```

## File naming

Each snapshot is named with a UTC timestamp:

```
./snapshots/
  snapshot-2026-04-09T10-00-00Z.dump
  snapshot-2026-04-09T11-00-00Z.dump
  snapshot-2026-04-09T12-00-00Z.dump
```

The timestamp is for human readability only. The retention policy uses file `mtime`, not the filename, to determine which files to keep.

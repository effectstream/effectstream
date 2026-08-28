import { equal as assertEquals, ok as assert } from "node:assert/strict";
import { test } from "bun:test";
import {
  makeTempDir,
  mkdirRecursive,
  readDir,
  remove,
  setFileTimes,
  writeTextFile,
} from "@effectstream/utils/fs";
import { applyRetentionPolicy } from "./snapshot-handler.ts";

const MS_1H = 3_600_000;
const MS_24H = 24 * MS_1H;

const DEFAULT_RETENTION = {
  lastDayHourly: true,
  last3DaysSixHourly: true,
  lastNDaysDaily: 7,
};

async function makeSnapshotDir(): Promise<string> {
  return await makeTempDir({ prefix: "snapshot-retention-test-" });
}

/**
 * Seeds `dir` with one file per hour for `hours` hours, mtimes descending
 * from `now` (offset 0h, 1h, ..., hours-1h).
 */
async function seedHourlySnapshots(
  dir: string,
  hours: number,
  now: number,
): Promise<void> {
  for (let i = 0; i < hours; i++) {
    const mtimeMs = now - i * MS_1H;
    const iso = new Date(mtimeMs).toISOString().replace(/:/g, "-").replace(/\.\d{3}/, "");
    const path = `${dir}/snapshot-${iso}.dump`;
    await writeTextFile(path, "x");
    await setFileTimes(path, mtimeMs, mtimeMs);
  }
}

async function listSnapshots(dir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const e of readDir(dir)) {
    if (e.isFile && e.name.startsWith("snapshot-") && e.name.endsWith(".dump")) out.push(e.name);
  }
  return out;
}

test("retention: single pass over 8 days populates all tiers", async () => {
  const dir = await makeSnapshotDir();
  // Align `now` to a 24h UTC boundary so bucket math is deterministic.
  const now = Math.floor(Date.now() / MS_24H) * MS_24H;
  await seedHourlySnapshots(dir, 8 * 24, now);

  await applyRetentionPolicy(dir, DEFAULT_RETENTION, now);

  const survivors = await listSnapshots(dir);
  // Expected (boundary-inclusive math, `now` aligned to 24h):
  //   hourly tier i=0..24 (age ≤ 24h) → 25 distinct hour buckets → 25 files
  //   6h tier    i=25..72 (24h<age≤72h), mtimes span 48h → 8 distinct 6h bins → 8 files
  //   daily tier i=73..168 (72h<age≤7d), mtimes span 96h → 4 distinct day bins → 4 files
  //   deleted    i=169..191 (age > 7d) → 0 files
  assertEquals(survivors.length, 25 + 8 + 4);
});

test("retention: bucket keys are stable across successive passes (regression)", async () => {
  // The bug: age-relative bucket keys slide forward every call, so the file
  // kept in "bucket 6h:4" gets replaced each tick by a newer file that just
  // crossed 24h. After many iterations only ~hourly files survive.
  //
  // With mtime-absolute bucket keys a file's bucket is fixed at write time.
  // Simulate 8 days of hourly snapshots with retention running each hour and
  // confirm the survivor count stays consistent with multi-tier retention.
  const dir = await makeSnapshotDir();
  const baseNow = Math.floor(Date.now() / MS_24H) * MS_24H;

  // Simulate 8 days * 24 ticks: each tick drops a new snapshot and runs retention.
  const totalTicks = 8 * 24;
  for (let tick = 0; tick < totalTicks; tick++) {
    const now = baseNow + tick * MS_1H;
    const iso = new Date(now).toISOString().replace(/:/g, "-").replace(/\.\d{3}/, "");
    const path = `${dir}/snapshot-${iso}.dump`;
    await writeTextFile(path, "x");
    await setFileTimes(path, now, now);
    await applyRetentionPolicy(dir, DEFAULT_RETENTION, now);
  }

  const survivors = await listSnapshots(dir);
  // With the old (buggy) bucketing this collapses to ~26 (hourly tier plus
  // a handful of in-flight files). With the fix we expect ~37.
  assert(
    survivors.length >= 32,
    `expected multi-tier retention to keep ≥32 files after 8 days of ticks, got ${survivors.length}`,
  );
  assert(
    survivors.length <= 42,
    `expected ≤42 files after retention, got ${survivors.length}`,
  );
});

test("retention: lastDayHourly=false keeps all files in hourly tier", async () => {
  const dir = await makeSnapshotDir();
  const now = Math.floor(Date.now() / MS_24H) * MS_24H;
  await seedHourlySnapshots(dir, 24, now);

  await applyRetentionPolicy(
    dir,
    { ...DEFAULT_RETENTION, lastDayHourly: false },
    now,
  );

  const survivors = await listSnapshots(dir);
  assertEquals(survivors.length, 24);
});

test("retention: last3DaysSixHourly=false keeps all files in 24h–72h tier", async () => {
  const dir = await makeSnapshotDir();
  const now = Math.floor(Date.now() / MS_24H) * MS_24H;
  // Seed 72 hourly files spanning 3 days.
  await seedHourlySnapshots(dir, 72, now);

  await applyRetentionPolicy(
    dir,
    { ...DEFAULT_RETENTION, last3DaysSixHourly: false },
    now,
  );

  const survivors = await listSnapshots(dir);
  // Hourly tier (i=0..24) → 25 distinct-hour keepers
  // 6h tier with short-circuit → all i=25..71 kept (47 files)
  assertEquals(survivors.length, 25 + 47);
});

test("retention: lastNDaysDaily=1 deletes everything past 24h", async () => {
  const dir = await makeSnapshotDir();
  const now = Math.floor(Date.now() / MS_24H) * MS_24H;
  await seedHourlySnapshots(dir, 48, now);

  await applyRetentionPolicy(
    dir,
    { ...DEFAULT_RETENTION, lastNDaysDaily: 1 },
    now,
  );

  const survivors = await listSnapshots(dir);
  // Only i=0..24 survive (age ≤ 24h = MS_ND). 25 distinct hour buckets.
  assertEquals(survivors.length, 25);
});

test("retention: empty directory is a no-op", async () => {
  const dir = await makeSnapshotDir();
  await applyRetentionPolicy(dir, DEFAULT_RETENTION, Date.now());
  const survivors = await listSnapshots(dir);
  assertEquals(survivors.length, 0);
});

test("retention: missing directory is a no-op (warns, does not throw)", async () => {
  const dir = await makeTempDir({ prefix: "snapshot-retention-missing-" });
  await remove(dir, { recursive: true });
  // Should not throw.
  await applyRetentionPolicy(dir, DEFAULT_RETENTION, Date.now());
});

test("retention: leaves non-snapshot files untouched", async () => {
  const dir = await makeSnapshotDir();
  await mkdirRecursive(dir);
  const now = Math.floor(Date.now() / MS_24H) * MS_24H;
  // Seed an ancient snapshot that would be deleted by policy (age > 7d).
  await seedHourlySnapshots(dir, 1, now - 30 * MS_24H);
  // Seed unrelated files that must be left alone.
  await writeTextFile(`${dir}/README.md`, "keep me");
  await writeTextFile(`${dir}/snapshot-bad-name.txt`, "keep me");
  await writeTextFile(`${dir}/other.dump`, "keep me");

  await applyRetentionPolicy(dir, DEFAULT_RETENTION, now);

  const remaining: string[] = [];
  for await (const e of readDir(dir)) remaining.push(e.name);
  assert(remaining.includes("README.md"));
  assert(remaining.includes("snapshot-bad-name.txt"));
  assert(remaining.includes("other.dump"));
  // Ancient snapshot-*.dump should have been deleted.
  assertEquals(remaining.filter((n) => n.startsWith("snapshot-") && n.endsWith(".dump")).length, 0);
});

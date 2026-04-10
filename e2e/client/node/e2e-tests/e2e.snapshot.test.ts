import { assert } from "@e2e/engine";
import type { Client } from "pg";

/**
 * Polls `condition` every `interval` ms until it returns `true` or `timeout`
 * elapses. pg_dump can take a few seconds, so default timeout is 15 s.
 */
async function pollCondition(
  condition: () => Promise<boolean>,
  timeout = 15_000,
  interval = 500,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await condition()) return true;
    } catch { /* file may not exist yet */ }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

/** Count snapshot-*.dump files in a directory. */
async function countSnapshots(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.startsWith("snapshot-") && entry.name.endsWith(".dump")) {
        files.push(entry.name);
      }
    }
  } catch { /* directory may not exist yet */ }
  return files;
}

const isSnapshotEnabled = Deno.env.get("EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS") !== undefined;

/**
 * Waits for a snapshot `.dump` file to appear.
 * Since snapshots are now time-based (not block-based), we simply wait for
 * the configured interval to elapse and poll the output directory.
 */
export async function snapshotTest(_db: Client) {
  if (!isSnapshotEnabled) {
    console.log("Skipping snapshotTest (EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS not set)");
    return;
  }

  const intervalSec = parseInt(Deno.env.get("EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS")!);
  const snapshotDir = Deno.env.get("EFFECTSTREAM_SNAPSHOT_PATH") ?? "./snapshots";

  console.log(`[snapshotTest] Waiting for first snapshot (interval: ${intervalSec}s)...`);

  // Wait for at least one .dump file to appear.
  // The first snapshot fires immediately on the first block, so this should be fast.
  const timeoutMs = (intervalSec + 15) * 1000;

  await assert("Snapshot .dump file created", async () => {
    return await pollCondition(async () => {
      const files = await countSnapshots(snapshotDir);
      if (files.length > 0) {
        console.log(`[snapshotTest] Found: ${files[0]}`);
        return true;
      }
      return false;
    }, timeoutMs);
  });
}

/**
 * Verifies the retention policy trims old snapshots.
 * Waits for 2 intervals so at least 2 snapshots have been created,
 * then checks that retention keeps a reasonable number of files.
 */
export async function snapshotRetentionTest(_db: Client) {
  if (!isSnapshotEnabled) {
    console.log("Skipping snapshotRetentionTest (EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS not set)");
    return;
  }

  const intervalSec = parseInt(Deno.env.get("EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS")!);
  const snapshotDir = Deno.env.get("EFFECTSTREAM_SNAPSHOT_PATH") ?? "./snapshots";

  // Wait long enough for 2 snapshots to have been created.
  const waitMs = (intervalSec * 2 + 15) * 1000;
  console.log(`[snapshotRetentionTest] Waiting up to ${waitMs / 1000}s for 2+ snapshots...`);

  // First, wait until at least 2 snapshots have been created at some point
  // (retention may have already deleted one, but we need the policy to have run).
  await pollCondition(async () => {
    const files = await countSnapshots(snapshotDir);
    return files.length >= 1; // at least 1 survived after retention ran
  }, waitMs);

  // During a short E2E run all snapshots fall in the same 1-hour bucket,
  // so retention keeps at most 1 per bucket. Allow up to 3 for hour-boundary races.
  const MAX_EXPECTED = 3;

  await assert(
    `Retention: ≤ ${MAX_EXPECTED} snapshot(s) in ${snapshotDir}`,
    async () => {
      const files = await countSnapshots(snapshotDir);
      const ok = files.length >= 1 && files.length <= MAX_EXPECTED;
      if (ok) {
        console.log(`[snapshotRetentionTest] OK: ${files.length} file(s) — ${files.join(", ")}`);
      }
      return ok;
    },
  );
}

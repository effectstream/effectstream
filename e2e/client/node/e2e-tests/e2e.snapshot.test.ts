import { assert, blockWatcher } from "@e2e/engine";
import type { Client } from "pg";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Polls `condition` every `interval` ms until it returns `true` or `timeout`
 * elapses. Returns `true` on success, `false` on timeout.
 *
 * pg_dump takes longer than the old PGlite `dumpDataDir()` approach, so the
 * default timeout is 10 s instead of 5 s.
 */
async function pollCondition(
  condition: () => Promise<boolean>,
  timeout = 10_000,
  interval = 200,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await condition()) return true;
    } catch {
      // ignore errors during polling — the file may not exist yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const isSnapshotEnabled = Deno.env.get("PAIMA_SNAPSHOT_INTERVAL") !== undefined;

/**
 * Waits for the next snapshot interval to elapse, then asserts that a
 * `snapshot-<blockHeight>.dump` file was created with non-zero size.
 *
 * Snapshot files use pg_dump custom format and can be restored with:
 *   pg_restore -h localhost -p 5432 -U postgres -d postgres --clean snapshot-N.dump
 */
export async function snapshotTest(_db: Client) {
  if (!isSnapshotEnabled) {
    console.log("Skipping snapshotTest (PAIMA_SNAPSHOT_INTERVAL not set)");
    return;
  }

  const interval   = parseInt(Deno.env.get("PAIMA_SNAPSHOT_INTERVAL")!);
  const snapshotDir = Deno.env.get("PAIMA_SNAPSHOT_PATH") ?? "./snapshots";

  const currentBlock  = blockWatcher.getLatestBlock();
  // Round up to the next multiple of interval.
  const targetBlock   = Math.ceil((currentBlock + 1) / interval) * interval;
  const snapshotPath  = `${snapshotDir}/snapshot-${targetBlock}.dump`;

  console.log(
    `[snapshotTest] Waiting for rollup block ${targetBlock} (current: ${currentBlock})...`,
  );
  // Wait one block past the trigger to give createSnapshot time to finish.
  await blockWatcher.waitForBlock("__main__", targetBlock + 1);

  await assert(`Snapshot created at ${snapshotPath}`, async () => {
    return await pollCondition(async () => {
      try {
        const stat = await Deno.stat(snapshotPath);
        if (stat.isFile && stat.size > 0) {
          console.log(`[snapshotTest] Found ${snapshotPath} (${stat.size} bytes)`);
          return true;
        }
      } catch {
        // not found yet
      }
      return false;
    });
  });
}

/**
 * Verifies that the time-based retention policy trims old snapshots.
 *
 * During a short E2E run all snapshots are created within the same 1-hour
 * bucket, so the `lastDayHourly` tier (default: enabled) keeps exactly one
 * file per hour — meaning only the most recent snapshot survives.
 *
 * We assert a loose bound (`>= 1` and `<= 3`) to stay robust near hour
 * boundaries where a second bucket could briefly exist.
 */
export async function snapshotRetentionTest(_db: Client) {
  if (!isSnapshotEnabled) {
    console.log("Skipping snapshotRetentionTest (PAIMA_SNAPSHOT_INTERVAL not set)");
    return;
  }

  const interval    = parseInt(Deno.env.get("PAIMA_SNAPSHOT_INTERVAL")!);
  const snapshotDir = Deno.env.get("PAIMA_SNAPSHOT_PATH") ?? "./snapshots";

  // Ensure at least two snapshots have been created so the retention policy
  // has had a chance to run.
  const currentBlock     = blockWatcher.getLatestBlock();
  const snapshotsSoFar   = Math.floor(currentBlock / interval);

  if (snapshotsSoFar < 2) {
    const firstTarget  = Math.ceil((currentBlock + 1) / interval) * interval;
    const secondTarget = firstTarget + interval;

    console.log(`[snapshotRetentionTest] Waiting for 2nd snapshot at block ${secondTarget}...`);
    await blockWatcher.waitForBlock("__main__", secondTarget + 1);
  } else {
    console.log(
      `[snapshotRetentionTest] ${snapshotsSoFar} snapshot(s) should already exist at block ${currentBlock}.`,
    );
  }

  // With the tiered time-based policy all E2E snapshots fall within the same
  // 1-hour bucket, so only 1 file should remain.  We allow up to 3 to handle
  // the rare case of an hour boundary crossing during the test run.
  const MAX_EXPECTED = 3;

  await assert(
    `Retention policy applied: ≤ ${MAX_EXPECTED} snapshot(s) in ${snapshotDir}`,
    async () => {
      return await pollCondition(async () => {
        try {
          const files: string[] = [];
          for await (const entry of Deno.readDir(snapshotDir)) {
            if (
              entry.isFile &&
              entry.name.startsWith("snapshot-") &&
              entry.name.endsWith(".dump")
            ) {
              files.push(entry.name);
            }
          }

          const ok = files.length >= 1 && files.length <= MAX_EXPECTED;
          if (ok) {
            console.log(
              `[snapshotRetentionTest] Retention OK: ${files.length} file(s) — ${files.join(", ")}`,
            );
          }
          return ok;
        } catch (e) {
          console.error(`[snapshotRetentionTest] Error reading ${snapshotDir}:`, e);
          return false;
        }
      });
    },
  );
}

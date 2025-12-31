import { assert, blockWatcher } from "@e2e/engine";
import type { Client } from "pg";

const isSnapshotEnabled = Deno.env.get("PAIMA_SNAPSHOT_INTERVAL") !== undefined;

async function pollCondition(condition: () => Promise<boolean>, timeout = 5000, interval = 200): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await condition()) return true;
    } catch (e) {
      // Ignore errors during polling
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

export async function snapshotTest(db: Client) {
  if (!isSnapshotEnabled) {
    console.log("Skipping snapshotTest (PAIMA_SNAPSHOT_INTERVAL not set)");
    return;
  }
  const interval = parseInt(Deno.env.get("PAIMA_SNAPSHOT_INTERVAL")!);

  console.log(`Running snapshotTest with interval ${interval}...`);

  // Wait for at least one snapshot interval
  // We'll wait for block height to cross a multiple of interval.

  const currentBlock = blockWatcher.getLatestBlock();
  const targetBlock = Math.ceil((currentBlock + 1) / interval) * interval; // next multiple
  
  console.log(`Running snapshotTest: waiting for rollup block ${targetBlock} to trigger snapshot... (Current rollup block: ${currentBlock})`);
  await blockWatcher.waitForBlock("__main__", targetBlock + 1); // wait past the trigger block

  // Check if snapshot file exists
  // The path relative to CWD (which is typically e2e/client/node when running the test task?)
  // start-pglite.ts writes to ./snapshots relative to where IT runs.
  // The Pglite process runs in e2e/client/node (workspace).
  const snapshotPath = `./snapshots/snapshot-${targetBlock}.tar.gz`;
  const snapshotAbsPath = new URL(snapshotPath, `file://${Deno.cwd()}/`).pathname;
  
  await assert(`Snapshot created at ${snapshotPath}`, async () => {
    return await pollCondition(async () => {
      try {
        const stats = await Deno.stat(snapshotPath);
        if (stats.isFile && stats.size > 0) {
          console.log(`Snapshot found: ${snapshotPath}, size: ${stats.size}`);
          return true;
        }
      } catch (e) {
        // Ignore not found during polling
      }
      return false;
    });
  });
}

export async function snapshotRetentionTest(db: Client) {
  // Only run if snapshot interval is configured
  if (!isSnapshotEnabled) {
    console.log("Skipping snapshotRetentionTest (PAIMA_SNAPSHOT_INTERVAL not set)");
    return;
  }
  const interval = parseInt(Deno.env.get("PAIMA_SNAPSHOT_INTERVAL")!);
  const maxSnapshots = 1; // Hardcoded to 1 for testing retention

  console.log(`Running snapshotRetentionTest with maxSnapshots=${maxSnapshots}, interval=${interval}...`);

  // Get snapshot directory path
  const snapshotDir = Deno.env.get("PAIMA_SNAPSHOT_PATH") || "./snapshots";

  // Check if enough blocks have elapsed to already have 2+ snapshots
  // We need at least 2 snapshots to test retention (verify older ones are deleted)
  const currentBlock = blockWatcher.getLatestBlock();
  const snapshotsCreatedSoFar = Math.floor(currentBlock / interval);
  
  if (snapshotsCreatedSoFar >= 2) {
    // Enough blocks have elapsed - check if we already have snapshots
    console.log(`Current block ${currentBlock} suggests ${snapshotsCreatedSoFar} snapshot(s) should already exist. Checking...`);
  } else {
    // Need to wait for more snapshots to be created
    const firstTargetBlock = Math.ceil((currentBlock + 1) / interval) * interval;
    const secondTargetBlock = firstTargetBlock + interval;
    
    console.log(`Waiting for first snapshot at block ${firstTargetBlock}...`);
    await blockWatcher.waitForBlock("__main__", firstTargetBlock + 1);
    
    console.log(`Waiting for second snapshot at block ${secondTargetBlock}...`);
    await blockWatcher.waitForBlock("__main__", secondTargetBlock + 1);
  }

  // Count snapshot files in the directory
  await assert(`Only ${maxSnapshots} snapshot(s) exist with retention policy`, async () => {
    return await pollCondition(async () => {
      try {
        const snapshotFiles: string[] = [];
        for await (const entry of Deno.readDir(snapshotDir)) {
          if (entry.isFile && entry.name.startsWith("snapshot-") && entry.name.endsWith(".tar.gz")) {
            snapshotFiles.push(entry.name);
          }
        }
        
        if (snapshotFiles.length === maxSnapshots) {
          console.log(`✓ Retention policy working correctly: ${snapshotFiles.length} snapshot(s) found (expected ${maxSnapshots})`);
          return true;
        }
        return false;
      } catch (e) {
        console.error(`Error reading snapshot directory ${snapshotDir}:`, e);
        return false;
      }
    });
  });
}

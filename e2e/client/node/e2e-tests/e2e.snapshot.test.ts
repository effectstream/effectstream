import { assert, blockWatcher } from "@e2e/engine";
import type { Client } from "pg";

export async function snapshotTest(db: Client) {
  // Only run if configured
  const intervalStr = Deno.env.get("PAIMA_SNAPSHOT_INTERVAL");
  if (!intervalStr) {
    console.log("Skipping snapshotTest (PAIMA_SNAPSHOT_INTERVAL not set)");
    return;
  }
  const interval = parseInt(intervalStr);

  console.log(`Running snapshotTest with interval ${interval}...`);

  // Wait for at least one snapshot interval
  // We assume the chain is running.
  // We'll wait for block height to cross a multiple of interval.
  
  const currentBlock = await blockWatcher.getLatestBlock("parallelEvmRPC_fast");
  const targetBlock = Math.ceil((currentBlock + 1) / interval) * interval; // next multiple
  
  console.log(`Waiting for block ${targetBlock} to trigger snapshot...`);
  await blockWatcher.waitForBlock("parallelEvmRPC_fast", targetBlock + 1); // wait past the trigger block

  // Check if snapshot file exists
  // The path relative to CWD (which is typically e2e/client/node when running the test task?)
  // start-pglite.ts writes to ./snapshots relative to where IT runs.
  // The Pglite process runs in e2e/client/node (workspace).
  const snapshotPath = `./snapshots/snapshot-${targetBlock}.tar.gz`;
  
  await assert(`Snapshot created at ${snapshotPath}`, async () => {
    try {
      const stats = await Deno.stat(snapshotPath);
      console.log(`Snapshot found: ${snapshotPath}, size: ${stats.size}`);
      return stats.isFile && stats.size > 0;
    } catch (e) {
      console.error(`Snapshot not found at ${snapshotPath}`);
      return false;
    }
  });
}

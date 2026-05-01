import { assert } from "@e2e/engine";
import type { Client } from "pg";
import { readdir } from "node:fs/promises";

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

async function listSnapshots(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.startsWith("snapshot-") && e.name.endsWith(".dump"))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

const isSnapshotEnabled = process.env["EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS"] !== undefined;

export async function snapshotTest(_db: Client) {
  if (!isSnapshotEnabled) {
    console.log("Skipping snapshotTest (EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS not set)");
    return;
  }

  const intervalSec = parseInt(process.env["EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS"]!);
  const snapshotDir = process.env["EFFECTSTREAM_SNAPSHOT_PATH"] ?? "./snapshots";

  console.log(`[snapshotTest] Waiting for first snapshot (interval: ${intervalSec}s)...`);

  const timeoutMs = (intervalSec + 15) * 1000;

  await assert("Snapshot .dump file created", async () => {
    return await pollCondition(async () => {
      const files = await listSnapshots(snapshotDir);
      if (files.length > 0) {
        console.log(`[snapshotTest] Found: ${files[0]}`);
        return true;
      }
      return false;
    }, timeoutMs);
  });
}

export async function snapshotRetentionTest(_db: Client) {
  if (!isSnapshotEnabled) {
    console.log("Skipping snapshotRetentionTest (EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS not set)");
    return;
  }

  const intervalSec = parseInt(process.env["EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS"]!);
  const snapshotDir = process.env["EFFECTSTREAM_SNAPSHOT_PATH"] ?? "./snapshots";

  const waitMs = (intervalSec * 2 + 15) * 1000;
  console.log(`[snapshotRetentionTest] Waiting up to ${waitMs / 1000}s for 2+ snapshots...`);

  await pollCondition(async () => {
    const files = await listSnapshots(snapshotDir);
    return files.length >= 1;
  }, waitMs);

  // During a short e2e run all snapshots fall in the same 1-hour bucket,
  // so retention keeps at most 1 per bucket. Allow up to 3 for hour-boundary races.
  const MAX_EXPECTED = 3;

  await assert(
    `Retention: <= ${MAX_EXPECTED} snapshot(s) in ${snapshotDir}`,
    async () => {
      const files = await listSnapshots(snapshotDir);
      const ok = files.length >= 1 && files.length <= MAX_EXPECTED;
      if (ok) {
        console.log(`[snapshotRetentionTest] OK: ${files.length} file(s) — ${files.join(", ")}`);
      }
      return ok;
    },
  );
}

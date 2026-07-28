/** E2E: coalesced vs non-coalesced syncs produce the same DB; resume through coalescing matches a clean run. */
import { expect, test } from "bun:test";
import { setupHarness } from "./harness.ts";
import {
  compareConsistencySnapshots,
  type ConsistencySnapshot,
  dumpConsistencySnapshot,
  type SnapshotDiff,
  type SnapshotOpts,
  SYNC_BOOKKEEPING_TABLES,
} from "./consistency-snapshot.ts";

function summarize(snap: ConsistencySnapshot): string {
  let rows = 0;
  for (const f of snap.values()) rows += f.rowCount;
  return `${snap.size} tables, ${rows} rows`;
}

function formatDiffs(diffs: SnapshotDiff[]): string {
  return diffs
    .map((d) => `${d.table} [${d.reason} A=${d.aRows ?? "—"} B=${d.bRows ?? "—"}]`)
    .join(", ");
}

function logComparison(
  tag: string,
  aLabel: string,
  a: ConsistencySnapshot,
  bLabel: string,
  b: ConsistencySnapshot,
  diffs: SnapshotDiff[],
): void {
  console.log(tag);
  console.log(`${tag}   ${aLabel}: ${summarize(a)}`);
  console.log(`${tag}   ${bLabel}: ${summarize(b)}`);
  console.log(
    diffs.length === 0
      ? `${tag}   → IDENTICAL (0 differences)`
      : `${tag}   → ${diffs.length} diff(s): ${formatDiffs(diffs)}`,
  );
}

test(
  "coalesced and non-coalesced from-scratch syncs produce identical databases",
  async () => {
    const events = [
      { atBlock: 25, marker: "e25" },
      { atBlock: 50, marker: "e50" },
      { atBlock: 75, marker: "e75" },
    ];

    const runOnce = async (
      coalesce: boolean,
      apiPort: number,
    ): Promise<ConsistencySnapshot> => {
      const h = await setupHarness();
      try {
        await h.runToHeight({
          events,
          tips: { mainClock: 100, parallelP: 200 },
          target: 100,
          apiPort,
          coalesce,
        });
        return await dumpConsistencySnapshot(h.pool);
      } finally {
        await h.teardown();
      }
    };

    const off = await runOnce(false, 19160);
    const on = await runOnce(true, 19161);

    const { diffs } = compareConsistencySnapshots(off, on);
    logComparison("[coalesce A] from-scratch sync to height 100:", "coalesce OFF", off, "coalesce ON", on, diffs);
    expect(diffs).toEqual([]);
  },
  120_000,
);

test(
  "a coalesced sync that resumes matches a clean coalesced sync",
  async () => {
    const events = [{ atBlock: 20, marker: "gap20" }];
    const parallelStepSize = 1000;
    const dumpOpts: SnapshotOpts = { excludeTables: SYNC_BOOKKEEPING_TABLES };

    const ref = await setupHarness();
    let refSnap: ConsistencySnapshot;
    try {
      await ref.runToHeight({
        events,
        parallelStepSize,
        tips: { mainClock: 30, parallelP: 50 },
        target: 30,
        apiPort: 19170,
        coalesce: true,
      });
      refSnap = await dumpConsistencySnapshot(ref.pool, dumpOpts);
    } finally {
      await ref.teardown();
    }

    const resumed = await setupHarness();
    let resumeSnap: ConsistencySnapshot;
    try {
      await resumed.runToHeight({
        events,
        parallelStepSize,
        tips: { mainClock: 10, parallelP: 50 },
        target: 10,
        apiPort: 19171,
        coalesce: true,
      });
      await resumed.runToHeight({
        events,
        parallelStepSize,
        tips: { mainClock: 30, parallelP: 50 },
        target: 30,
        apiPort: 19172,
        coalesce: true,
      });
      resumeSnap = await dumpConsistencySnapshot(resumed.pool, dumpOpts);
    } finally {
      await resumed.teardown();
    }

    const { diffs } = compareConsistencySnapshots(refSnap, resumeSnap);
    logComparison("[coalesce B] clean vs resumed coalesced sync to height 30:", "clean ref", refSnap, "resumed", resumeSnap, diffs);
    expect(diffs).toEqual([]);
  },
  120_000,
);

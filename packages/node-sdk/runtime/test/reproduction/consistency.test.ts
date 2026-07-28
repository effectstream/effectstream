/**
 * E2E database-consistency checks over the synthetic `test` chain.
 *
 * The database the engine builds must be a pure function of the source blocks —
 * independent of *how* it got there. Two scenarios:
 *
 *   A. Determinism baseline — two from-scratch syncs to the same height produce
 *      identical databases. Expected to PASS (proves reproducibility).
 *
 *   B. Resume guarantee — a sync that stops mid-chunk and resumes to N must
 *      match a clean sync to N. Regression test for block-accurate resume
 *      (see @effectstream/sync CLAUDE.md, design idea #5): a restart must
 *      re-fetch (committed, chunk_end] instead of silently skipping it.
 *
 * Each node runs in its own subprocess (see harness.ts / node-runner.ts): a
 * restart is a genuine new OS process whose in-memory Deque is gone while the
 * database keeps every committed row — exactly the production restart condition.
 *
 * These tests assert a property of the **production** database path, so they run
 * only against real Postgres — i.e. only when `PGLITE=false` and `postgresql@18`
 * is installed. In the default PGLite mode (or if Postgres isn't installed) they
 * skip rather than run, since PGLite is not the backend whose fidelity these
 * guarantees are about.
 */
import { expect, test } from "bun:test";
import { postgresAvailable, setupHarness } from "./harness.ts";
import {
  compareConsistencySnapshots,
  type ConsistencySnapshot,
  dumpConsistencySnapshot,
  type SnapshotDiff,
  type SnapshotOpts,
  SYNC_BOOKKEEPING_TABLES,
} from "./consistency-snapshot.ts";

// Postgres-only: run only when PGLITE=false and Postgres is present.
const canRun = process.env.PGLITE === "false" && postgresAvailable();
const it = canRun ? test : test.skip;

/** "<n> tables, <m> rows". */
function summarize(snap: ConsistencySnapshot): string {
  let rows = 0;
  for (const f of snap.values()) rows += f.rowCount;
  return `${snap.size} tables, ${rows} rows`;
}

/** e.g. "effectstream.primitive_accounting [row-count A=1 B=0]". */
function formatDiffs(diffs: SnapshotDiff[]): string {
  return diffs
    .map((d) => `${d.table} [${d.reason} A=${d.aRows ?? "—"} B=${d.bRows ?? "—"}]`)
    .join(", ");
}

/** Log the two snapshots and their comparison result. */
function logComparison(
  tag: string,
  label: string,
  aLabel: string,
  a: ConsistencySnapshot,
  bLabel: string,
  b: ConsistencySnapshot,
  diffs: SnapshotDiff[],
): void {
  console.log(`${tag} ${label}`);
  console.log(`${tag}   ${aLabel}: ${summarize(a)}`);
  console.log(`${tag}   ${bLabel}: ${summarize(b)}`);
  console.log(
    diffs.length === 0
      ? `${tag}   → IDENTICAL (0 differences)`
      : `${tag}   → ${diffs.length} difference(s): ${formatDiffs(diffs)}`,
  );
}

it("two from-scratch syncs to the same height produce identical databases", async () => {
  const events = [
    { atBlock: 25, marker: "e25" },
    { atBlock: 50, marker: "e50" },
    { atBlock: 75, marker: "e75" },
  ];

  // A fresh harness == a fresh database == "syncing again from scratch".
  const runFromScratch = async (
    apiPort: number,
  ): Promise<ConsistencySnapshot> => {
    const h = await setupHarness({ backend: "postgres" });
    try {
      await h.runToHeight({
        events,
        tips: { mainClock: 100, parallelP: 200 },
        target: 100,
        apiPort,
      });
      return await dumpConsistencySnapshot(h.pool);
    } finally {
      await h.teardown();
    }
  };

  const snapA = await runFromScratch(19140);
  const snapB = await runFromScratch(19141);

  const { diffs } = compareConsistencySnapshots(snapA, snapB);
  logComparison(
    "[consistency A]",
    "two from-scratch syncs to height 100:",
    "run A",
    snapA,
    "run B",
    snapB,
    diffs,
  );
  expect(diffs).toEqual([]);
}, 120_000);

it(
  "a mid-chunk restart resumes to the same database as a clean sync",
  async () => {
    // One event inside the gap the restart will skip: it must fall in
    // (phase-1 committed height 10, parallel page 50] AND be ≤ the phase-2 main
    // tip 30, so a *correct* engine would re-fetch and commit it after resume.
    const events = [{ atBlock: 20, marker: "gap20" }];
    // Large parallel stepSize => the whole tip is fetched as ONE chunk, so its
    // page row persists at page_number = tip (the chunk-granular watermark that
    // Fix D wrongly resumes from).
    const parallelStepSize = 1000;
    // Sync bookkeeping (page queue, version/migration history) legitimately
    // differs after a restart even in a correct engine; compare observable
    // state only.
    const dumpOpts: SnapshotOpts = { excludeTables: SYNC_BOOKKEEPING_TABLES };

    // Reference: one clean sync straight to height 30. Parallel stays ahead of
    // the main clock so the final main block can finalize (the merge gates block
    // T on the parallel page advancing past T). Contains the block-20 event.
    const ref = await setupHarness({ backend: "postgres" });
    let refSnap: ConsistencySnapshot;
    try {
      await ref.runToHeight({
        events,
        parallelStepSize,
        tips: { mainClock: 30, parallelP: 50 },
        target: 30,
        apiPort: 19150,
      });
      refSnap = await dumpConsistencySnapshot(ref.pool, dumpOpts);
    } finally {
      await ref.teardown();
    }

    // Resumed: one database, two subprocess runs (= a real restart).
    const resumed = await setupHarness({ backend: "postgres" });
    let resumeSnap: ConsistencySnapshot;
    try {
      // Phase 1: the parallel fetcher (no backpressure) races to its own tip
      // (50) into the in-memory Deque, but the main clock only drives commits to
      // height 10 — so parallel blocks 11..50 (incl. the event at 20) are fetched
      // but never committed, and the in-memory Deque is lost when the process
      // exits. The runtime persists a block-accurate resume marker at the last
      // COMMITTED parallel block (≤ 10), not the fetched-ahead tip.
      await resumed.runToHeight({
        events,
        parallelStepSize,
        tips: { mainClock: 10, parallelP: 50 },
        target: 10,
        apiPort: 19151,
      });

      // Phase 2 (restart): a new process boots against the same database. Its
      // Deque is empty; restoreState reads the persisted resume marker (the last
      // committed parallel block ≤ 10) and resumes parallel from there. The main
      // clock now advances to 30, so the parallel blocks it needs (11..30,
      // including the event at 20) are re-fetched and committed.
      await resumed.runToHeight({
        events,
        parallelStepSize,
        tips: { mainClock: 30, parallelP: 50 },
        target: 30,
        apiPort: 19152,
      });
      resumeSnap = await dumpConsistencySnapshot(resumed.pool, dumpOpts);
    } finally {
      await resumed.teardown();
    }

    const { diffs } = compareConsistencySnapshots(refSnap, resumeSnap);
    logComparison(
      "[consistency B]",
      "clean sync vs mid-chunk restart, both to height 30:",
      "clean ref",
      refSnap,
      "resumed  ",
      resumeSnap,
      diffs,
    );
    expect(diffs).toEqual([]);
  },
  120_000,
);

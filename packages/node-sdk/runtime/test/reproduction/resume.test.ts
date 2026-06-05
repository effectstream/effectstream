/**
 * Resume-marker position over the synthetic `test` chain.
 *
 * Companion to consistency.test.ts (which proves a mid-chunk restart re-fetches
 * uncommitted data instead of skipping it). This file pins down *where* the
 * persisted resume marker lands for a chain whose data is sparse — the property
 * that bounds restart re-scan (see @effectstream/sync CLAUDE.md, design idea #5).
 *
 * The marker is the highest datum merged into the committed block, and because
 * each fetched chunk's boundary page is buffered and consumed even when empty, it
 * tracks the **committed frontier** — NOT the last block that happened to carry
 * data. So a chain that produced one event long ago and has been quiet since
 * still resumes near the frontier, re-fetching at most ~stepSize blocks, never
 * its whole quiet tail. Here: data lives only at block 5, yet the marker must sit
 * at the frontier (height 50 / 60), not stuck back at 5.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  countEventRows,
  type Harness,
  latestFinalizedHeight,
  maxPage,
  setupHarness,
} from "./harness.ts";

let h: Harness;

beforeAll(async () => {
  h = await setupHarness();
});

afterAll(async () => {
  await h?.teardown();
});

test(
  "a sparse chain's resume marker tracks the frontier, not its last data block",
  async () => {
    // Data lives ONLY at parallel block 5; everything after is quiet. Block 5 is
    // the marker a naive "resume from last data" scheme would persist.
    const events = [{ atBlock: 5, marker: "evt5" }];

    // Phase 1 — sync the main clock to 50 (parallel tip stays ahead so the merge
    // can finalize). The block-5 event is merged early; the chain is quiet after.
    await h.runToHeight({
      events,
      tips: { mainClock: 50, parallelP: 200 },
      target: 50,
      apiPort: 19161,
    });

    expect(await latestFinalizedHeight(h.pool)).toBe(50);
    expect(await countEventRows(h.pool, "evt5")).toBe(1);

    // The crux: the parallel marker tracks the committed frontier (50), NOT the
    // last data block (5). A restart therefore resumes from ~51 and re-scans only
    // the bounded gap up to the frontier — never blocks 6..50 from scratch.
    expect(await maxPage(h.pool, "parallelP")).toBe(50);
    expect(await maxPage(h.pool, "parallelP")).not.toBe(5);

    // Phase 2 (restart) — boot a fresh process against the same DB and sync on to
    // 60. The parallel chain resumes from the frontier (51), not from block 5.
    await h.runToHeight({
      events,
      tips: { mainClock: 60, parallelP: 200 },
      target: 60,
      apiPort: 19162,
    });

    expect(await latestFinalizedHeight(h.pool)).toBe(60);
    // Marker advanced with the new frontier...
    expect(await maxPage(h.pool, "parallelP")).toBe(60);
    // ...and block 5 was neither re-fetched (resume started past it) nor lost.
    expect(await countEventRows(h.pool, "evt5")).toBe(1);
  },
  120_000,
);

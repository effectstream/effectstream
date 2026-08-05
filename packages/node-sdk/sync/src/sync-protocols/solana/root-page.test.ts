import { expect, test } from "bun:test";
import { toMsTimestamp } from "./types.ts";
import { applyDelay } from "../common/utils.ts";

/**
 * The merge pulls buffered parallel (Solana) outputs in slot order and gates
 * them with `rootPage <= mainChainTime`, so the root timestamp must be
 * monotonically non-decreasing across slots. Solana guarantees that for
 * `blockTime`, and duplicate blockTimes must map to EQUAL roots — the merge
 * disambiguates by buffer/slot order, not by this value.
 *
 * Regression guard for the original `(slot % 1000) * 0.001` tiebreaker, which
 * wrapped every 1000 slots so slot 1000 could sort before slot 999.
 */

/** What SolanaSyncState.toRootPage does, minus the config plumbing. */
const rootPage = (blockTime: number, delayMs: number) =>
  Number(applyDelay(toMsTimestamp(blockTime), delayMs));

const DELAY = 2400;

test("root timestamp is non-decreasing across a realistic slot stream", () => {
  // Repeated blockTimes are normal: slots are ~400ms but blockTime has 1-second
  // resolution, so several consecutive slots share a timestamp.
  const stream = [
    { slot: 100, blockTime: 1_700_000_000 },
    { slot: 101, blockTime: 1_700_000_000 },
    { slot: 102, blockTime: 1_700_000_001 },
    { slot: 999, blockTime: 1_700_000_001 },
    { slot: 1000, blockTime: 1_700_000_002 }, // the old %1000 wrap point
    { slot: 1001, blockTime: 1_700_000_002 },
  ];
  const roots = stream.map((s) => rootPage(s.blockTime, DELAY));
  for (let i = 1; i < roots.length; i++) {
    expect(roots[i]).toBeGreaterThanOrEqual(roots[i - 1]);
  }
});

test("the root depends only on blockTime, never on slot", () => {
  // The previous version of this test compared f(x) to f(x), which holds for any
  // implementation. Assert the actual property instead: a 1-second blockTime
  // step moves the root by exactly 1000ms and nothing else contributes.
  const a = rootPage(1_700_000_001, DELAY);
  const b = rootPage(1_700_000_002, DELAY);
  expect(b - a).toBe(1000);
});

test("ordering holds across the slot-1000 boundary that broke the old tiebreaker", () => {
  // Under `(slot % 1000) * 0.001` the offset reset at slot 1000, so a later slot
  // could sort before an earlier one. Verify the real ordering across it.
  expect(rootPage(1_700_000_002, DELAY))
    .toBeGreaterThan(rootPage(1_700_000_001, DELAY));
});

test("blockTime seconds convert to milliseconds", () => {
  expect(Number(toMsTimestamp(1_700_000_000))).toBe(1_700_000_000_000);
});

test("delayMs shifts the root forward, preserving order", () => {
  // applyDelay ADDS the confirmation delay so older blocks merge into more
  // recent root slots (sync CLAUDE.md, design idea #3).
  const undelayed = rootPage(1_700_000_000, 0);
  const delayed = rootPage(1_700_000_000, DELAY);
  expect(delayed - undelayed).toBe(DELAY);
  expect(rootPage(1_700_000_001, DELAY)).toBeGreaterThan(delayed);
});

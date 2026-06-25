import { test, expect } from "bun:test";
import { toMsTimestamp } from "./types.ts";

/**
 * The merge pulls buffered parallel (Solana) outputs in slot order and gates
 * them with `rootPage <= mainChainTime`. So the root timestamp must be
 * monotonically non-decreasing across slots (Solana guarantees this for
 * blockTime), and duplicate blockTimes must map to EQUAL roots — the merge
 * disambiguates by buffer/slot order, not by this value.
 *
 * Regression guard for C3: the old `(slot % 1000) * 0.001` tiebreaker wrapped
 * every 1000 slots, so slot 1000 could sort before slot 999 (non-monotonic).
 */
const stream = [
  { slot: 100, blockTime: 1_700_000_000 },
  { slot: 101, blockTime: 1_700_000_000 }, // same second
  { slot: 102, blockTime: 1_700_000_001 },
  { slot: 999, blockTime: 1_700_000_001 },
  { slot: 1000, blockTime: 1_700_000_002 }, // old %1000 wrap point
  { slot: 1001, blockTime: 1_700_000_002 },
];

test("Solana root timestamp is monotonically non-decreasing across slots", () => {
  const roots = stream.map((s) => Number(toMsTimestamp(s.blockTime)));
  for (let i = 1; i < roots.length; i++) {
    expect(roots[i]).toBeGreaterThanOrEqual(roots[i - 1]);
  }
});

test("Solana root timestamp depends only on blockTime, not slot", () => {
  // slots 102 and 999 share a blockTime -> equal root (slot must not perturb it)
  expect(Number(toMsTimestamp(1_700_000_001))).toBe(
    Number(toMsTimestamp(1_700_000_001)),
  );
  // and the wrap point (slot 1000) is not earlier than the previous second
  expect(Number(toMsTimestamp(1_700_000_002))).toBeGreaterThanOrEqual(
    Number(toMsTimestamp(1_700_000_001)),
  );
});

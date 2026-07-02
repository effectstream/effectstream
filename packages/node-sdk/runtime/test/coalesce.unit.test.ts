import { expect, test } from "bun:test";
import {
  type EmptyRunBoundaries,
  isCoalescableEmptyBlock,
} from "../src/coalesce.ts";

const NO_BOUNDARIES: EmptyRunBoundaries = {
  minScheduledBlockHeight: null,
  minScheduledTimestampMs: null,
};

function block(
  blockNumber: number,
  timestamp: number,
  primitives: unknown[] = [],
): any {
  return { blockNumber, timestamp, blockInfo: [], resumePages: [], primitives };
}

test("empty block with no boundaries is coalescable", () => {
  expect(isCoalescableEmptyBlock(block(10, 10_000), NO_BOUNDARIES, undefined))
    .toBe(true);
});

test("block with on-chain content is NOT coalescable", () => {
  expect(
    isCoalescableEmptyBlock(block(10, 10_000, [{}]), NO_BOUNDARIES, undefined),
  ).toBe(false);
});

test("block where a migration fires is NOT coalescable", () => {
  const migrations = [{ name: "m1", sql: "", blockHeight: 10 }];
  expect(isCoalescableEmptyBlock(block(10, 10_000), NO_BOUNDARIES, migrations))
    .toBe(false);
  expect(isCoalescableEmptyBlock(block(9, 9_000), NO_BOUNDARIES, migrations))
    .toBe(true);
});

test("block at/after a pending block-height-scheduled input is NOT coalescable", () => {
  const boundaries: EmptyRunBoundaries = {
    minScheduledBlockHeight: 10,
    minScheduledTimestampMs: null,
  };
  expect(isCoalescableEmptyBlock(block(9, 9_000), boundaries, undefined)).toBe(
    true,
  );
  expect(isCoalescableEmptyBlock(block(10, 10_000), boundaries, undefined)).toBe(
    false,
  );
  expect(isCoalescableEmptyBlock(block(11, 11_000), boundaries, undefined)).toBe(
    false,
  );
});

test("block at/after a due timestamp-scheduled input is NOT coalescable", () => {
  const boundaries: EmptyRunBoundaries = {
    minScheduledBlockHeight: null,
    minScheduledTimestampMs: 10_000,
  };
  expect(isCoalescableEmptyBlock(block(9, 9_999), boundaries, undefined)).toBe(
    true,
  );
  expect(isCoalescableEmptyBlock(block(10, 10_000), boundaries, undefined)).toBe(
    false,
  );
  expect(isCoalescableEmptyBlock(block(11, 10_001), boundaries, undefined)).toBe(
    false,
  );
});

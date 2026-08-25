// What a failed dust-sync attempt is allowed to write back, and when a
// well-formed snapshot has to be thrown away.
//
// Phase 1 §2 measured the failure these pin down. A snapshot whose `offset` is
// past the end of the indexer's event log leaves the wallet emitting exactly
// once, `isConnected` false, `appliedIndex` frozen at the offset — hung past a
// 45 s window. The batcher then re-saved that state on the stall path
// (gwi:707) and again on final failure (gwi:721), and both `gwi:640` and
// `gwi:712` require `appliedIndex === 0n` to escape, which a restored wallet
// never satisfies. So all five retries re-restored the same unusable snapshot,
// init failed after ~5 minutes, and the poisoned file outlived the process:
// every restart repeated the outage until an operator deleted it by hand.

import { describe, expect, test } from "bun:test";
import { dustSyncAttemptMadeProgress } from "../src/get-wallet-info.ts";

describe("a failed attempt may only persist state that moved forward", () => {
  test("a wallet frozen at its restored offset is not worth persisting", () => {
    // The measured poisoned case: restored at 999999, still at 999999.
    expect(dustSyncAttemptMadeProgress(999_999n, 999_999n)).toBe(false);
  });

  test("a stalled but advancing sync IS worth persisting", () => {
    // The checkpoint that makes stall-retry worth having: 128 -> 5000 means
    // the next attempt resumes 4872 events further along.
    expect(dustSyncAttemptMadeProgress(128n, 5_000n)).toBe(true);
  });

  test("a cold sync that never applied an event is not worth persisting", () => {
    expect(dustSyncAttemptMadeProgress(0n, 0n)).toBe(false);
  });

  test("a backwards jump is never progress", () => {
    expect(dustSyncAttemptMadeProgress(128n, 0n)).toBe(false);
  });
});

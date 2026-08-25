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
import { isSnapshotOffsetPastLog } from "../src/get-wallet-info.ts";

describe("a snapshot whose offset is past the indexer's log must be discarded", () => {
  // The measured signature, from §2: restored (so appliedIndex > 0), no
  // progress at all this attempt, the wallet never reached `isConnected`, and
  // the target index it is being compared against is still 0 because no event
  // ever arrived to set one. Every clause is load-bearing — see the negative
  // cases below.
  test("no progress + never connected + nothing restored-past is the signature", () => {
    expect(
      isSnapshotOffsetPastLog({
        restoredFromOffset: 999_999n,
        appliedIndex: 999_999n,
        highestRelevantWalletIndex: 0n,
        isConnected: false,
      }),
    ).toBe(true);
  });

  test("a connected wallet is syncing, however slowly", () => {
    // Connected means the subscription delivered something; the cursor is
    // inside the log. Discarding here would throw away a good snapshot and buy
    // a multi-hour resync for nothing.
    expect(
      isSnapshotOffsetPastLog({
        restoredFromOffset: 999_999n,
        appliedIndex: 999_999n,
        highestRelevantWalletIndex: 1_000_500n,
        isConnected: true,
      }),
    ).toBe(false);
  });

  test("a wallet that learned a target index has heard from the log", () => {
    // `highestRelevantWalletIndex` only moves when the indexer delivered
    // something, so a non-zero one means the cursor is inside the log even if
    // the subscription has since dropped. A restored wallet that has heard
    // nothing keeps the 0 that `CoreWallet.restore` gives it.
    expect(
      isSnapshotOffsetPastLog({
        restoredFromOffset: 999_999n,
        appliedIndex: 999_999n,
        highestRelevantWalletIndex: 1_000_500n,
        isConnected: false,
      }),
    ).toBe(false);
  });

  test("a wallet that applied even one event is not past the log", () => {
    expect(
      isSnapshotOffsetPastLog({
        restoredFromOffset: 999_999n,
        appliedIndex: 1_000_000n,
        highestRelevantWalletIndex: 0n,
        isConnected: false,
      }),
    ).toBe(false);
  });

  test("a cold sync that stalls is a stall, not a bad snapshot", () => {
    // Nothing was restored, so there is no snapshot to blame and nothing to
    // discard — this must stay an ordinary retry.
    expect(
      isSnapshotOffsetPastLog({
        restoredFromOffset: 0n,
        appliedIndex: 0n,
        highestRelevantWalletIndex: 0n,
        isConnected: false,
      }),
    ).toBe(false);
  });
});

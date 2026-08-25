// A dust snapshot that the SDK cannot decode must cost a cold sync, never the
// whole wallet.
//
// Phase 1 §2 measured both halves of this: truncating a snapshot made
// `DustWallet.restore` throw `getOrThrow called on a Left` straight out of
// buildWalletFacade, and `waitForDustFundsWithRetry` rethrew it without ever
// rebuilding from scratch (gwi:701-730) — one bad file bricks wallet init
// until an operator deletes it by hand. The same path catches a post-sdk-
// upgrade decode failure (master-plan Q4), since the snapshot carries no
// format version.
//
// The decision under test is deliberately separated from the SDK wiring: the
// fallback must fire for a *decode* failure and nothing else. Wrapping the
// whole facade build instead would also swallow indexer/network errors and
// would throw away a perfectly good snapshot on a transient outage — a 66-min
// preprod resync (master plan, first preprod measurements) for no reason.

import { describe, expect, test } from "bun:test";
import { restoreDustWalletWithColdSyncFallback } from "../src/get-wallet-info.ts";

describe("dust restore — an unusable snapshot must cold-sync, not brick init", () => {
  test("a snapshot that will not decode falls back to a cold start", () => {
    const rejected: string[] = [];
    const wallet = restoreDustWalletWithColdSyncFallback(
      "corrupt-snapshot",
      () => {
        throw new Error("getOrThrow called on a Left");
      },
      () => "cold-start" as const,
      (reason) => rejected.push(reason),
    );

    expect(wallet).toEqual("cold-start");
    // The caller has to learn the snapshot was rejected — it is what moves the
    // poisoned file aside so the next restart does not repeat the failure.
    expect(rejected).toEqual(["getOrThrow called on a Left"]);
  });

  test("a usable snapshot is restored and never cold-starts", () => {
    let coldStarts = 0;
    const rejected: string[] = [];
    const wallet = restoreDustWalletWithColdSyncFallback(
      "good-snapshot",
      (state) => `restored:${state}`,
      () => {
        coldStarts++;
        return "cold-start";
      },
      (reason) => rejected.push(reason),
    );

    expect(wallet).toEqual("restored:good-snapshot");
    expect(coldStarts).toEqual(0);
    expect(rejected).toEqual([]);
  });

  test("no snapshot cold-starts without reporting a rejection", () => {
    const rejected: string[] = [];
    for (const empty of [null, undefined, ""]) {
      expect(
        restoreDustWalletWithColdSyncFallback(
          empty,
          () => "restored",
          () => "cold-start",
          (reason) => rejected.push(reason),
        ),
      ).toEqual("cold-start");
    }
    // Nothing was rejected here — there was nothing to reject. Reporting one
    // would quarantine a file that is not at fault.
    expect(rejected).toEqual([]);
  });
});

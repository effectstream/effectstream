// Dust generation is a projection from a timestamp, so reading it at the wrong
// clock reads the wrong number.
//
// `DustWalletState.availableCoins` takes no time argument: `resolveTime`
// (CoinsAndBalances.ts:105) falls back to `state.state.syncTime`, which only
// advances when a dust EVENT is applied. Phase 1 §2 measured a fully synced
// wallet whose syncTime was 377 days behind wall clock on a quiet chain. The
// batcher's spendability gate read `generatedNow` straight off that getter, so
// on a quiet chain or during a dust-event lull it under-reports generated dust
// and can mark a wallet exhausted while spendable dust exists.
//
// The SDK does not have this problem by accident: `waitForGeneratedDust`
// (DustWallet.ts:443-458) documents that "the projection only advances because
// the time is re-read each tick" and drives it from a 1 s clock. The capability
// underneath takes the time as a parameter —
// `CoinsAndBalancesCapability.getAvailableCoins(state, time?)` — which is what
// this reads instead.

import { describe, expect, test } from "bun:test";
import { resolveDustCoinValuesAt } from "../src/get-wallet-info.ts";

/** A dust state shaped like the SDK's: stale getter, time-aware capability. */
function dustStateAt(syncTimeValue: bigint) {
  return {
    state: { marker: "core-wallet" },
    // What the no-argument getter would return: the value at syncTime.
    availableCoins: [{ generatedNow: syncTimeValue }, { generatedNow: syncTimeValue }],
    capabilities: {
      coinsAndBalances: {
        getAvailableCoins: (state: unknown, time?: Date) => {
          expect(state).toEqual({ marker: "core-wallet" });
          const value = time === undefined ? syncTimeValue : BigInt(time.getTime());
          return [{ generatedNow: value }, { generatedNow: value * 2n }];
        },
      },
    },
  };
}

describe("dust coin values are read at a live clock", () => {
  test("values are projected at the requested time, not at syncTime", () => {
    const at = new Date(1_700_000_000_000);
    const read = resolveDustCoinValuesAt(dustStateAt(0n), at);
    expect(read.values).toEqual([1_700_000_000_000n, 3_400_000_000_000n]);
    expect(read.liveClock).toBe(true);
  });

  test("a state with no time-aware capability falls back and says so", () => {
    // Reporting the fallback matters: the gate is then reading a possibly
    // stale number, and an operator should be able to see that in health info
    // rather than infer it from a wallet that looks starved.
    const read = resolveDustCoinValuesAt(
      { availableCoins: [{ generatedNow: 7n }] },
      new Date(1_700_000_000_000),
    );
    expect(read.values).toEqual([7n]);
    expect(read.liveClock).toBe(false);
  });

  test("coin values survive the SDK's bigint-as-string serialization", () => {
    const read = resolveDustCoinValuesAt(
      { availableCoins: [{ generatedNow: "12345" }, {}] },
      new Date(),
    );
    expect(read.values).toEqual([12345n, 0n]);
  });

  test("a wallet with no coins reads as empty, not as an error", () => {
    expect(resolveDustCoinValuesAt({}, new Date()).values).toEqual([]);
    expect(resolveDustCoinValuesAt(null, new Date()).values).toEqual([]);
  });

  test("a capability that throws degrades to the stale getter", () => {
    // Never let a projection failure look like "this wallet has no dust" —
    // that would flip the capacity gate off for the whole batcher.
    const read = resolveDustCoinValuesAt(
      {
        state: {},
        availableCoins: [{ generatedNow: 99n }],
        capabilities: {
          coinsAndBalances: {
            getAvailableCoins: () => {
              throw new Error("wasm boom");
            },
          },
        },
      },
      new Date(),
    );
    expect(read.values).toEqual([99n]);
    expect(read.liveClock).toBe(false);
  });
});

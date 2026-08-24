// Shielded padding needs a shielded wallet that finished syncing. Today it gets
// one that was cut off mid-replay.
//
// Master-plan Q2, answered in Phase 1 §1: fee wallets are built
// `syncMode: 'dust-only'`, but dust-only passes `stopAuxWalletsImmediately:
// false` (gwi:567) — so the shielded wallet syncs from genesis for the whole
// dust-sync window and is then stopped the moment *dust* sync completes
// (gwi:694), however far behind shielded still is. It has no persistence of any
// kind, so every restart replays it from genesis and truncates it again.
//
// `applyShieldedPadding` then performs a real shielded spend against that
// partial state, and the failure is swallowed with a warn per transaction
// (adapter:1973, :1993) — so a padding-enabled deployment degrades silently on
// any chain long enough for shielded sync to outlast dust sync.
//
// The fix is the smallest one that is honest: when padding is possible, wait
// for shielded sync before suspending it. Persisting shielded state would mean
// inventing a second snapshot format, and "documented as unsupported" would
// leave a config that silently does nothing.

import { describe, expect, test } from "bun:test";
import * as Rx from "rxjs";
import { waitForShieldedSyncComplete } from "../src/get-wallet-info.ts";

type Facade = Parameters<typeof waitForShieldedSyncComplete>[0];

const facadeEmitting = (states: Array<boolean | null>): Facade =>
  ({
    state: () =>
      Rx.from(states).pipe(
        Rx.concatMap((complete, i) =>
          Rx.of(
            complete === null
              ? {}
              : { shielded: { state: { progress: { isStrictlyComplete: () => complete } } } },
          ).pipe(Rx.delay(i === 0 ? 0 : 10)),
        ),
      ),
  }) as unknown as Facade;

describe("waiting for shielded sync before suspending it", () => {
  test("resolves true once shielded reports strictly complete", async () => {
    expect(await waitForShieldedSyncComplete(facadeEmitting([false, false, true]), 5_000))
      .toBe(true);
  });

  test("reports false on timeout instead of throwing", async () => {
    // Padding may not be used by every input on this target, so a slow shielded
    // sync must not take the whole batcher down — it must be visible and
    // survivable.
    expect(await waitForShieldedSyncComplete(facadeEmitting([false, false, false]), 60))
      .toBe(false);
  });

  test("a facade with no shielded sub-wallet reports false, not a hang", async () => {
    expect(await waitForShieldedSyncComplete(facadeEmitting([null, null]), 60)).toBe(false);
  });

  test("a stream that errors reports false", async () => {
    const facade = {
      state: () => Rx.throwError(() => new Error("wallet stopped")),
    } as unknown as Facade;
    expect(await waitForShieldedSyncComplete(facade, 60)).toBe(false);
  });
});

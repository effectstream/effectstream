// A dust sync that is working must never be called stalled.
//
// `waitForDustFundsWithRetry` raced `waitForSyncedState` against a plain
// `setTimeout(stallTimeoutMs)` — an absolute deadline on reaching synced state,
// not the "no new state emission within stallTimeoutMs" its own docstring
// promises, and not what the RxJS fallback branch beside it does
// (`Rx.timeout({ each: stallTimeoutMs })`).
//
// With DUST_STALL_TIMEOUT_MS = 60_000 and DUST_MAX_RETRIES = 5 that gave the
// batcher a total sync budget of ~5 minutes. Preprod's dust cold sync was
// measured at ~66 minutes (1.44 M indices, ~365 idx/s — master plan, first
// preprod measurements), so every attempt "stalled" while syncing perfectly
// normally and init threw. Persistence does not rescue it either: each attempt
// only advances the snapshot by ~60 s of sync, so no number of restarts
// converges.
//
// Timings here are milliseconds rather than minutes; the property is the same.

import { describe, expect, test } from "bun:test";
import * as Rx from "rxjs";
import { rejectOnDustSyncSilence } from "../src/get-wallet-info.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("stall detection watches for silence, not for elapsed time", () => {
  test("a stream that never emits stalls", async () => {
    const { promise } = rejectOnDustSyncSilence(new Rx.Subject<unknown>(), 60);
    expect(promise).rejects.toThrow("stall");
    await promise.catch(() => {});
  });

  test("a stream that keeps emitting does NOT stall past the timeout", async () => {
    // The regression that matters: 300 ms of healthy progress under a 60 ms
    // silence budget. The old flat deadline rejected at 60 ms regardless.
    const state$ = new Rx.Subject<unknown>();
    const { promise, dispose } = rejectOnDustSyncSilence(state$, 60);
    let stalled = false;
    void promise.catch(() => {
      stalled = true;
    });

    for (let i = 0; i < 15; i++) {
      await sleep(20);
      state$.next({ appliedIndex: BigInt(i) });
    }

    expect(stalled).toBe(false);
    dispose();
  });

  test("a stream that goes quiet after progress still stalls", async () => {
    // The detector must not become a no-op: a subscription that dies mid-sync
    // is exactly what retry-from-checkpoint exists for.
    const state$ = new Rx.Subject<unknown>();
    const { promise } = rejectOnDustSyncSilence(state$, 60);
    state$.next({ appliedIndex: 1n });
    await sleep(20);
    state$.next({ appliedIndex: 2n });
    expect(promise).rejects.toThrow("stall");
    await promise.catch(() => {});
  });

  test("dispose stops the detector for good", async () => {
    const { promise, dispose } = rejectOnDustSyncSilence(new Rx.Subject<unknown>(), 40);
    let stalled = false;
    void promise.catch(() => {
      stalled = true;
    });
    dispose();
    await sleep(100);
    // Without this the winner of the race leaves a timer armed on a wallet it
    // already finished with, and its rejection surfaces as an unhandled one.
    expect(stalled).toBe(false);
  });
});

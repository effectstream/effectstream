// A dropped indexer websocket must not kill the batcher.
//
// Phase 3 §2.1 run 1, against live preprod, 3 minutes into a 58-minute cold
// sync. Four mechanisms behaved correctly and the process died anyway:
//
//   1. the indexer websocket dropped (`TLS handshake failed`);
//   2. Phase 2's silence detector (`c195c67e`) fired at ~60 s of no emissions;
//   3. Phase 2's progress-gated save (`1f17a578`) wrote the checkpoint;
//   4. retry 2/5 began — "rebuilding wallet from in-memory state";
//   5. the discarded socket's `ErrorEvent` surfaced as an unhandled promise
//      rejection and exited the process before the retry could run.
//
// So every recovery path this project built was unreachable behind one
// transient socket failure. The escape route is a known defect in graphql-ws
// 6.2.1: `subscribe()` does `const [socket, release, waitForRelease] = await
// connect(); if (done) return release();` (`dist/client.js:309-318`), throwing
// away a `Promise.race([..., throwOnClose])` that nobody then awaits. When the
// subscription ends after the socket errored, that race rejects with the ws
// `ErrorEvent` and there is no handler anywhere.
//
// This module's top-of-file handler already knew about the defect — it exempts
// a rejection whose `type` is `"close"`, which is the *graceful* end of the
// same dangling promise. It just never covered the case where the socket died
// first, so `type === "error"` fell through to `process.exit(1)`.
//
// What these pin down:
//   - the process survives a socket ErrorEvent, and still dies on a genuine
//     unhandled rejection (the fix must be narrow, not a blanket swallow);
//   - the classification is by socket-event shape, not by message text;
//   - the failure is *delivered* to whoever is syncing rather than dropped;
//   - delivery shortens the in-flight attempt's stall deadline instead of
//     leaving it to wait out the full silence budget — and a socket that
//     recovers costs nothing, because a later emission restores the budget;
//   - the retry loop actually reaches attempt 2.
//
// Timings here are milliseconds; production is minutes.

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Rx from "rxjs";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import {
  classifyWalletSocketRejection,
  onWalletSocketFailure,
  reportWalletSocketFailure,
  rejectOnDustSyncSilence,
  waitForDustFundsWithRetry,
} from "../src/get-wallet-info.ts";

const MODULE_UNDER_TEST = path.join(import.meta.dir, "../src/get-wallet-info.ts");
const SEED = "0000000000000000000000000000000000000000000000000000000000000001";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `body` in a child `bun` process that has imported this module, and
 * report how it died.
 *
 * "The process survives" is not observable from inside the process — the
 * defect is `process.exit(1)` — so the only honest test is a real child that
 * creates a real unhandled rejection and is asked whether it is still there.
 */
async function runChild(body: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "es00009-socket-"));
  const file = path.join(dir, "fixture.ts");
  fs.writeFileSync(file, `import ${JSON.stringify(MODULE_UNDER_TEST)};\n${body}\n`);
  try {
    const proc = Bun.spawn(["bun", file], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The exact reason recorded in run 1's stderr, minus the seed-free prose. */
const WS_ERROR_EVENT_LITERAL =
  `{ type: "error", ` +
  `message: "WebSocket connection to 'wss://indexer.example/api/v4/graphql/ws' failed: TLS handshake failed", ` +
  `error: new Error("TLS handshake failed") }`;

describe("a dropped indexer websocket does not kill the process", () => {
  test("a socket ErrorEvent surfacing as an unhandled rejection is survivable", async () => {
    const child = await runChild(
      `Promise.reject(${WS_ERROR_EVENT_LITERAL});\n` +
        `setTimeout(() => { console.log("SURVIVED"); process.exit(0); }, 500);`,
    );
    expect(child.stdout).toContain("SURVIVED");
    expect(child.code).toBe(0);
  }, 30_000);

  test("a graceful socket close stays survivable", async () => {
    // The case the original handler already covered; it must not regress.
    const child = await runChild(
      `Promise.reject({ type: "close", code: 1000, reason: "Normal Closure", wasClean: true });\n` +
        `setTimeout(() => { console.log("SURVIVED"); process.exit(0); }, 500);`,
    );
    expect(child.stdout).toContain("SURVIVED");
    expect(child.code).toBe(0);
  }, 30_000);

  test("an ordinary unhandled rejection is still fatal", async () => {
    // The guard rail on the fix: a blanket `unhandledRejection` swallow would
    // pass the two tests above and hide every real bug in the batcher.
    const child = await runChild(
      `Promise.reject(new Error("a genuine bug"));\n` +
        `setTimeout(() => { console.log("SURVIVED"); process.exit(0); }, 500);`,
    );
    expect(child.stdout).not.toContain("SURVIVED");
    expect(child.code).toBe(1);
  }, 30_000);
});

describe("classifying a rejection as a wallet socket event", () => {
  test("an ErrorEvent-shaped rejection is a socket error", () => {
    expect(
      classifyWalletSocketRejection({ type: "error", message: "TLS handshake failed" }),
    ).toEqual("error");
  });

  test("a CloseEvent-shaped rejection is a socket close", () => {
    expect(
      classifyWalletSocketRejection({ type: "close", code: 1000, reason: "Normal Closure" }),
    ).toEqual("close");
  });

  test("a plain Error is not a socket event", () => {
    expect(classifyWalletSocketRejection(new Error("boom"))).toBeNull();
  });

  test("an Error that happens to carry type='error' is not a socket event", () => {
    // Classification is by shape, and an `Error` is never a DOM event. Without
    // this, any application error with a `type` field would be swallowed.
    const e = Object.assign(new Error("boom"), { type: "error" });
    expect(classifyWalletSocketRejection(e)).toBeNull();
  });

  test("neither primitives nor other event types are socket events", () => {
    for (const reason of [null, undefined, "error", 7, { type: "message" }, { type: 1 }, []]) {
      expect(classifyWalletSocketRejection(reason)).toBeNull();
    }
  });
});

// The registry is process-global, and `bun test` runs every file in one
// process — other suites in this package drive `waitForDustFundsWithRetry`
// against an unreachable indexer and leave their attempt listeners registered.
// So delivery counts are asserted as deltas against a baseline rather than
// absolutely, or these pass and fail by file ordering.
const deliveryCount = (): number => reportWalletSocketFailure("error", { type: "error" });

describe("a socket failure is delivered to whoever is syncing", () => {
  test("a registered listener receives the failure", () => {
    const baseline = deliveryCount();
    const seen: string[] = [];
    const off = onWalletSocketFailure((f) => seen.push(f.kind));
    try {
      expect(deliveryCount()).toEqual(baseline + 1);
    } finally {
      off();
    }
    expect(seen).toEqual(["error"]);
  });

  test("unsubscribing stops delivery", () => {
    const baseline = deliveryCount();
    let calls = 0;
    const off = onWalletSocketFailure(() => calls++);
    off();
    expect(deliveryCount()).toEqual(baseline);
    expect(calls).toEqual(0);
  });

  test("a listener that throws does not stop the others", () => {
    // These run from an unhandled-rejection handler. A throw there would be
    // the very failure mode this whole fix exists to remove.
    let reached = false;
    const offBad = onWalletSocketFailure(() => {
      throw new Error("listener bug");
    });
    const offGood = onWalletSocketFailure(() => {
      reached = true;
    });
    try {
      expect(() => deliveryCount()).not.toThrow();
    } finally {
      offBad();
      offGood();
    }
    expect(reached).toBe(true);
  });

  test("reporting is a no-op, not a throw", () => {
    expect(() => deliveryCount()).not.toThrow();
  });
});

describe("a socket failure shortens the stall deadline it cannot escape", () => {
  test("a nudged detector stalls on the short grace, not the full budget", async () => {
    const { promise, nudge } = rejectOnDustSyncSilence(new Rx.Subject<unknown>(), 30_000);
    const startedAt = Date.now();
    nudge(40);
    await expect(promise).rejects.toThrow("stall");
    // The point of routing the error in at all: a socket we know is dead does
    // not get to burn the full silence budget (60 s in production).
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  test("an emission after a nudge restores the full budget", async () => {
    // The SDK's own sync stream retries with exponential backoff, so a socket
    // blip that recovers must cost nothing — otherwise five blips across a
    // 58-minute cold sync would exhaust the retry budget and fail init.
    const state$ = new Rx.Subject<unknown>();
    const { promise, nudge, dispose } = rejectOnDustSyncSilence(state$, 400);
    let stalled = false;
    void promise.catch(() => {
      stalled = true;
    });
    nudge(30);
    await sleep(10);
    state$.next({ appliedIndex: 1n });
    await sleep(120);
    expect(stalled).toBe(false);
    dispose();
  });

  test("a nudge cannot lengthen the deadline", async () => {
    const { promise, nudge } = rejectOnDustSyncSilence(new Rx.Subject<unknown>(), 50);
    nudge(60_000);
    await expect(promise).rejects.toThrow("stall");
  });

  test("a nudge after dispose does nothing", async () => {
    const { promise, nudge, dispose } = rejectOnDustSyncSilence(new Rx.Subject<unknown>(), 30_000);
    let stalled = false;
    void promise.catch(() => {
      stalled = true;
    });
    dispose();
    nudge(20);
    await sleep(100);
    expect(stalled).toBe(false);
  });
});

describe("the retry machinery gets to run after a socket failure", () => {
  test("attempt 2 is built after a socket failure kills attempt 1", async () => {
    // Run 1's exact shape, without a chain: each attempt's wallet goes quiet
    // and its socket reports an error. Before the fix the first report exited
    // the process; the assertion that matters is that attempt 2 was built.
    const syncedState = {
      state: {
        progress: {
          appliedIndex: 5n,
          highestRelevantWalletIndex: 100n,
          isConnected: true,
        },
      },
    };

    const builds: number[] = [];
    const buildWallet = async (): Promise<any> => {
      builds.push(Date.now());
      const state$ = new Rx.BehaviorSubject<unknown>(syncedState);
      // A socket error arrives shortly after this attempt starts waiting —
      // the same ordering as a live indexer dropping mid-sync.
      setTimeout(() => {
        reportWalletSocketFailure("error", {
          type: "error",
          message: "WebSocket connection failed: TLS handshake failed",
        });
      }, 60);
      return {
        wallet: {
          dust: {
            state: state$,
            // Never settles — a dust sync that will not complete.
            waitForSyncedState: () => new Promise(() => {}),
            serializeState: async () => "{}",
          },
          stop: async () => {},
        },
      };
    };

    const startedAt = Date.now();
    await expect(
      waitForDustFundsWithRetry({
        networkUrls: {
          id: "undeployed" as NetworkId.NetworkId,
          indexer: "http://127.0.0.1:1/api/v4/graphql",
          indexerWS: "ws://127.0.0.1:1/api/v4/graphql/ws",
          node: "http://127.0.0.1:1",
          proofServer: "http://127.0.0.1:1",
        },
        seed: SEED,
        // `undeployed` keeps persistence a no-op, so this touches no disk.
        networkId: "undeployed" as NetworkId.NetworkId,
        // Deliberately far longer than the test can take: if the socket
        // failure were dropped, the attempts could only end by waiting this
        // out, and the elapsed assertion below would fail.
        stallTimeoutMs: 30_000,
        socketFailureGraceMs: 40,
        maxRetries: 2,
        buildWallet,
      }),
    ).rejects.toThrow(/stalled after 2 attempts/);

    expect(builds.length).toEqual(2);
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  }, 30_000);
});

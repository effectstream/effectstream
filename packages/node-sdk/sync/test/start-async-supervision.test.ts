/**
 * Repro for sync/CLAUDE.md Finding #5 (unsupervised `startAsync`).
 *
 * `orchestration/sync.ts` starts the streaming producer with a bare
 * `yield* spawn(function* () { yield* iState.startAsync(); })`. There is no
 * try/catch, no restart, and no liveness check. Streaming chains (utxorpc today,
 * midnight if it moves to subscriptions) put ALL of their data on that path, so
 * its two exit modes are both unhandled:
 *
 *   5a — the stream ENDS CLEANLY. `WatchMultiplexer.runWatcher` logs
 *        "stream ended unexpectedly" and returns; `start()` resolves; the spawned
 *        task completes normally. The chain now receives nothing, forever, while
 *        the polling loop keeps running and every health counter stays clean.
 *        The merge then blocks on that chain's page and the node stops producing
 *        blocks — with nothing anywhere reporting an error.
 *
 *   5b — the stream THROWS. The error escapes the spawned task and tears down the
 *        enclosing scope, which in production is `start()` — i.e. one flaky gRPC
 *        connection takes the whole node down, including every unrelated chain.
 *
 * Both tests document CURRENT behaviour. After the fix (supervise + restart with
 * backoff, and treat a returned producer as a failure), 5a should show the
 * producer restarted and 5b should show the sibling loop still running.
 */
import { expect, test } from "bun:test";
import { type Operation, run, sleep } from "effection";
import { startSync } from "../src/sync-protocols/orchestration/sync.ts";

const POLL_MS = 20;

/**
 * Minimal stand-in for a streaming `SyncState`. Only the members `startSync`
 * touches are implemented. `stateToInput` always reports "caught up", which is
 * what a streaming chain does while it waits for its producer to deliver.
 */
function makeStreamingState(startAsyncBody: () => Operation<void>) {
  const counters = { startAsyncCalls: 0, pollPasses: 0 };
  const state = {
    name: "streamer",
    consecutiveErrors: 0,
    lastErrorTimestamp: 0,
    lastSuccessfulFetchMs: 0,
    getNamespace: () => ["streamer", "streamer"],
    *startAsync(): Operation<void> {
      counters.startAsyncCalls++;
      yield* startAsyncBody();
    },
    *stateToInput(): Operation<undefined> {
      counters.pollPasses++;
      return undefined;
    },
    fetcher: {
      config: { syncProtocol: { name: "streamer", pollingInterval: POLL_MS } },
      producerChannel: { *send(): Operation<void> {} },
      *readData(): Operation<never> {
        throw new Error("unreachable: stateToInput always returns undefined");
      },
    },
    *updateState(): Operation<void> {},
  };
  return { state, counters };
}

test("KNOWN-BROKEN 5a: a producer that ends cleanly is never restarted and reports nothing", async () => {
  // The multiplexer's `for await (const event of stream)` falling through —
  // the stream closed and `runWatcher` returned.
  const { state, counters } = makeStreamingState(function* () {
    // returns immediately
  });

  await run(function* () {
    yield* startSync(state as never);
    yield* sleep(300);
  });

  // The producer ran once and was never restarted...
  expect(counters.startAsyncCalls).toBe(1);
  // ...the polling loop carried on, oblivious...
  expect(counters.pollPasses).toBeGreaterThan(1);
  // ...and not one health counter moved. This is the silent stall: from the
  // outside the protocol looks perfectly healthy while it is receiving nothing.
  expect(state.consecutiveErrors).toBe(0);
  expect(state.lastErrorTimestamp).toBe(0);
}, 30_000);

test("KNOWN-BROKEN 5b: a producer that throws tears down the whole scope", async () => {
  const { state, counters } = makeStreamingState(function* () {
    yield* sleep(50);
    throw new Error("gRPC stream died");
  });

  let rejection: unknown;
  await run(function* () {
    yield* startSync(state as never);
    yield* sleep(300);
  }).catch((err) => {
    rejection = err;
  });

  // The error escaped the spawned task and killed the enclosing scope. In
  // production that scope is `start()` — every other chain dies with it.
  expect(rejection).toBeInstanceOf(Error);
  expect(String(rejection)).toContain("gRPC stream died");

  // And the sibling polling loop is gone: its counter is frozen from here on.
  const passesAtCrash = counters.pollPasses;
  await new Promise((resolve) => setTimeout(resolve, 5 * POLL_MS));
  expect(counters.pollPasses).toBe(passesAtCrash);
}, 30_000);

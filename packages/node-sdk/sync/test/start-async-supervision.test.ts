/**
 * Regression guard for sync/CLAUDE.md Finding #5 (unsupervised `startAsync`).
 *
 * `orchestration/sync.ts` used to start the streaming producer with a bare
 * `yield* spawn(function* () { yield* iState.startAsync(); })` — no try/catch,
 * no restart, no liveness check. Streaming chains (utxorpc today, midnight if
 * it moves to subscriptions) put ALL of their data on that path, so both of its
 * exit modes were unhandled:
 *
 *   5a — the stream ENDS CLEANLY. `WatchMultiplexer.runWatcher` logs
 *        "stream ended unexpectedly" and returns; the spawned task completed
 *        normally. The chain then received nothing forever while every health
 *        counter stayed clean, and the merge blocked on its page — a total stall
 *        with nothing reporting an error.
 *
 *   5b — the stream THROWS. The error escaped the spawned task and tore down the
 *        enclosing scope, which in production is `start()`: one flaky gRPC
 *        connection took down every unrelated chain with it.
 *
 * Now supervised — both modes are treated as failure and restarted with capped
 * exponential backoff, counted in `producerRestarts`. A returning producer
 * counts as failure because the observable effect is identical: no more data.
 *
 * Supervision is gated on `hasAsyncProducer` so polled chains, whose
 * `startAsync` is the base-class no-op, are still run exactly once (5c).
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
function makeStreamingState(
  startAsyncBody: () => Operation<void>,
  hasAsyncProducer = true,
) {
  const counters = { startAsyncCalls: 0, pollPasses: 0 };
  const state = {
    name: "streamer",
    consecutiveErrors: 0,
    lastErrorTimestamp: 0,
    lastSuccessfulFetchMs: 0,
    hasAsyncProducer,
    producerRestarts: 0,
    producerErrors: 0,
    lastProducerErrorMs: 0,
    pollingIntervalMs: POLL_MS,
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

test("5a: a producer that ends cleanly is restarted and counted", async () => {
  // The multiplexer's `for await (const event of stream)` falling through —
  // the stream closed and `runWatcher` returned.
  const { state, counters } = makeStreamingState(function* () {
    // returns immediately
  });

  await run(function* () {
    yield* startSync(state as never);
    // Long enough for the first restart (1s backoff) plus room to spare.
    yield* sleep(1_500);
  });

  // Restarted rather than abandoned...
  expect(counters.startAsyncCalls).toBeGreaterThan(1);
  // ...and the restart is visible to health instead of being silent.
  expect(state.producerRestarts).toBeGreaterThan(0);
  // A clean return is not an *error*, so only the restart counter moves.
  expect(state.producerErrors).toBe(0);
  // The sibling polling loop is unaffected.
  expect(counters.pollPasses).toBeGreaterThan(1);
}, 30_000);

test("5b: a producer that throws is restarted and does not kill the scope", async () => {
  const { state, counters } = makeStreamingState(function* () {
    yield* sleep(50);
    throw new Error("gRPC stream died");
  });

  let rejection: unknown;
  await run(function* () {
    yield* startSync(state as never);
    yield* sleep(1_500);
  }).catch((err) => {
    rejection = err;
  });

  // The scope survived: no error escaped to tear down `start()`.
  expect(rejection).toBeUndefined();
  // The throw was caught, counted, and the producer restarted.
  expect(counters.startAsyncCalls).toBeGreaterThan(1);
  expect(state.producerRestarts).toBeGreaterThan(0);
  expect(state.producerErrors).toBeGreaterThan(0);
  expect(state.lastProducerErrorMs).toBeGreaterThan(0);
  // Counted on the PRODUCER's own tally, not the fetch loop's. Sharing
  // `consecutiveErrors` conflated two signals: only a successful `readData`
  // clears it, so an idle streaming chain stayed `erroring` long after its
  // producer recovered, and a successful poll erased the record of a flap.
  expect(state.consecutiveErrors).toBe(0);
  // And the sibling polling loop kept running throughout.
  expect(counters.pollPasses).toBeGreaterThan(1);
}, 30_000);

test("5c: a polled chain's no-op producer is run once, not supervised", async () => {
  const { state, counters } = makeStreamingState(function* () {}, false);

  await run(function* () {
    yield* startSync(state as never);
    yield* sleep(1_500);
  });

  // Without this gate, every polled chain would "restart" its no-op forever.
  expect(counters.startAsyncCalls).toBe(1);
  expect(state.producerRestarts).toBe(0);
  expect(counters.pollPasses).toBeGreaterThan(1);
}, 30_000);

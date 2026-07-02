// Proves the second half of the error-isolation contract:
//
//   Sync-protocol errors (chain RPC failures, malformed data, anything thrown
//   out of `stateToInput` / `readData`) are caught IN-BAND by `tryYield`
//   (utils/concurrency/retry.ts) inside the `startSync` polling loop, counted on
//   `state.consecutiveErrors`, logged, and retried forever. They NEVER escape to
//   the effection root, and therefore NEVER reach the global `unhandledRejection`
//   handler — that handler is the safety net for pg blips only (see
//   packages/node-sdk/db/src/unhandled-rejection-wiring.test.ts for the other half).
//
// The contrast tests pin the *structural* boundary: what matters is WHERE the
// error is thrown, not its shape. Even a pg-shaped error thrown from a fetcher
// is handled by the effection loop, not the pg exemption.

import { test, expect, mock, afterEach } from "bun:test";
import { run, sleep, createChannel } from "effection";
import { buildUnhandledRejectionHandler } from "@effectstream/log";
import { isTransientPgError } from "@effectstream/db";
import { startSync } from "../src/sync-protocols/orchestration/sync.ts";

// Track listeners we add so we always restore the process global, even on
// assertion failure (a leaked `unhandledRejection` listener would poison every
// subsequent test in the bun process).
const addedListeners: Array<(reason: unknown) => void> = [];
const addRejectionListener = (fn: (reason: unknown) => void) => {
  process.on("unhandledRejection", fn);
  addedListeners.push(fn);
};
afterEach(() => {
  while (addedListeners.length) {
    process.removeListener("unhandledRejection", addedListeners.pop()!);
  }
});

// Minimal stand-in for an `AllSyncProtocols` member. Cast through `unknown`
// because `AllSyncProtocols` is an intersection of every concrete chain state;
// `startSync` only touches the small surface implemented here.
type SyncStateParam = Parameters<typeof startSync>[0];

const makeState = (opts: {
  throwInStateToInput?: unknown;
  throwInReadData?: unknown;
  pollingInterval?: number;
  // Throw this many times from stateToInput, then report caught-up forever.
  stateToInputFailuresThenIdle?: number;
  // Throw this many times from startAsync, then succeed.
  startAsyncFailures?: number;
}): SyncStateParam => {
  const pollingInterval = opts.pollingInterval ?? 1;
  let stateToInputCalls = 0;
  let startAsyncCalls = 0;
  return {
    consecutiveErrors: 0,
    lastErrorTimestamp: 0,
    lastSuccessfulFetchMs: 0,
    // Test-only instrumentation.
    get _startAsyncCalls() {
      return startAsyncCalls;
    },
    *startAsync() {
      startAsyncCalls++;
      if (
        opts.startAsyncFailures != null &&
        startAsyncCalls <= opts.startAsyncFailures
      ) {
        throw new Error(`startAsync failed (attempt ${startAsyncCalls})`);
      }
    },
    *stateToInput() {
      stateToInputCalls++;
      if (opts.throwInStateToInput !== undefined) throw opts.throwInStateToInput;
      if (
        opts.stateToInputFailuresThenIdle != null &&
        stateToInputCalls <= opts.stateToInputFailuresThenIdle
      ) {
        throw new Error(`stateToInput failed (attempt ${stateToInputCalls})`);
      }
      if (opts.stateToInputFailuresThenIdle != null) return undefined; // caught up
      return 1; // non-null Input so the loop proceeds to readData
    },
    getNamespace: () => ["test", "mock"],
    fetcher: {
      config: { syncProtocol: { pollingInterval } },
      *readData() {
        if (opts.throwInReadData !== undefined) throw opts.throwInReadData;
        return { output: [], lastPage: { own: 1, ownBlockNumber: 1, root: 1 } };
      },
      producerChannel: createChannel(),
    },
    *updateState() {},
  } as unknown as SyncStateParam;
};

// Drive `startSync` for a short window. This mirrors the production wiring in
// runtime/src/main.ts (`for (const sp of syncProtocols) yield* startSync(sp)`):
// `startSync` spawns its polling loop as a child of the CURRENT scope and returns
// immediately; we keep the scope alive by sleeping, and returning tears all
// linked children down. Keeping the scope actively yielding (vs. an extra
// `spawn` wrapper) is what lets the polling loop's `sleep` timers pump — exactly
// as the real `start()` apply loop does.
//
// If an error escaped the polling loop's `tryYield`, the linked child would fail
// and halt this scope, so the `run` promise would reject — failing the test. So
// `run` resolving cleanly is itself the proof that the effection loop stayed
// alive and handled the error itself.
const runFor = (state: SyncStateParam, ms: number) =>
  run(function* () {
    yield* startSync(state);
    yield* sleep(ms);
  });

test("readData sync errors are swallowed by tryYield and never reach the global unhandledRejection handler", async () => {
  const state = makeState({
    throwInReadData: new Error("RPC call failed: 503 Service Unavailable"),
  });
  const spy = mock();
  addRejectionListener(spy);

  await runFor(state, 30);
  await Promise.resolve(); // flush the microtask queue

  expect(state.consecutiveErrors).toBeGreaterThanOrEqual(2);
  expect(state.lastErrorTimestamp).toBeGreaterThan(0);
  // The whole point: no rejection ever escaped to the process-level handler.
  expect(spy).toHaveBeenCalledTimes(0);
});

test("stateToInput sync errors are likewise contained in the effection loop", async () => {
  const state = makeState({
    throwInStateToInput: new Error("failed to fetch latest block height"),
  });
  const spy = mock();
  addRejectionListener(spy);

  await runFor(state, 30);
  await Promise.resolve();

  expect(state.consecutiveErrors).toBeGreaterThanOrEqual(2);
  expect(spy).toHaveBeenCalledTimes(0);
});

test("CONTRAST: a pg-SHAPED error thrown from readData is still handled by effection, not the pg exemption", async () => {
  // This object WOULD be classified transient by isTransientPgError...
  const pgShaped = {
    code: "ECONNRESET",
    message: "Connection terminated unexpectedly",
    stack: "    at node_modules/pg-pool/index.js:45:11",
  };
  expect(isTransientPgError(pgShaped)).toBe(true);

  // ...but isTransientPgError only runs inside the global unhandledRejection
  // handler, which only fires for errors that LEAK OUT of everything. Since this
  // is thrown inside the fetcher, tryYield catches it first and it never gets
  // there. So the pg "survive" exemption is irrelevant: what catches an error is
  // decided by WHERE it's thrown (which try wraps it), not by its shape.
  const state = makeState({ throwInReadData: pgShaped });
  const spy = mock();
  addRejectionListener(spy);

  await runFor(state, 30);
  await Promise.resolve();

  expect(state.consecutiveErrors).toBeGreaterThanOrEqual(2);
  expect(spy).toHaveBeenCalledTimes(0);
});

test("CONTRAST: the production unhandledRejection handler stays idle while sync errors are handled by effection", async () => {
  // The real production handler (buildUnhandledRejectionHandler wired with
  // isTransientPgError, same shape as unhandled-rejection-wiring.test.ts) attached
  // as a genuine process listener. It must never fire for sync errors.
  const exits: number[] = [];
  const handle = buildUnhandledRejectionHandler(
    "pglite",
    isTransientPgError,
    (code) => exits.push(code),
  );
  addRejectionListener(handle);

  const state = makeState({
    throwInReadData: new Error("chain websocket disconnected mid-stream"),
  });

  await runFor(state, 30);
  await Promise.resolve();

  expect(state.consecutiveErrors).toBeGreaterThanOrEqual(2);
  expect(exits).toEqual([]); // the global handler's fatal branch never ran
});

test("consecutiveErrors resets once stateToInput reports caught-up after transient errors", async () => {
  // An idle iteration must end the failure streak, not just a successful fetch.
  const state = makeState({ stateToInputFailuresThenIdle: 2, pollingInterval: 1 });

  await runFor(state, 30);
  await Promise.resolve();

  expect(state.consecutiveErrors).toBe(0);
  expect(state.lastErrorTimestamp).toBeGreaterThan(0); // errors did happen
});

// Both startAsync tests set `stateToInputFailuresThenIdle: 0` to idle the
// polling loop: a synchronous mock's success path never sleeps, so it would
// starve the timers the retry sleeps and test window depend on.

test("startAsync is retried through transient failure and recovers", async () => {
  // 2 failures < max attempts (5); `runFor` resolving cleanly proves the
  // failures never escaped the retry loop.
  const state = makeState({
    startAsyncFailures: 2,
    stateToInputFailuresThenIdle: 0,
    pollingInterval: 1,
  });

  await runFor(state, 30);

  expect((state as unknown as { _startAsyncCalls: number })._startAsyncCalls)
    .toBe(3); // 2 failures + 1 success
});

test("startAsync halts the scope once retries are exhausted", async () => {
  // Retrying forever would hide a dead producer; exhaustion must rethrow
  // the real error and halt the scope.
  const state = makeState({
    startAsyncFailures: Infinity,
    stateToInputFailuresThenIdle: 0,
    pollingInterval: 1,
  });

  // Promise.resolve: bun's `.rejects` needs a real Promise, not effection's Task.
  await expect(Promise.resolve(runFor(state, 200))).rejects.toThrow(
    "startAsync failed",
  );
  expect((state as unknown as { _startAsyncCalls: number })._startAsyncCalls)
    .toBe(5); // STARTASYNC_MAX_ATTEMPTS in sync.ts
});

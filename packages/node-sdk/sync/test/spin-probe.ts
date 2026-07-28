/**
 * Child process for `poll-loop-spin.test.ts` (sync/CLAUDE.md Finding #3).
 *
 * Drives the REAL `startSync` fetch loop with a fake `SyncState` that is always
 * "caught up" (`stateToInput` → `undefined`) — the steady state of any protocol
 * whose tip advances slowly. The only variable is whether the protocol config
 * carries a `pollingInterval`, because `orchestration/sync.ts` guards all three
 * of its `sleep`s with `if ("pollingInterval" in config.syncProtocol)`.
 *
 * Runs in its own process because a loop with no sleep can starve the event
 * loop outright, which would hang the test runner rather than fail it. The two
 * exit paths below discriminate the outcomes:
 *
 *   - `reason: "limit"`  — the loop reached `limit` iterations. Reported via
 *                          `writeSync` + `process.exit`, which work even when
 *                          the event loop is starved.
 *   - `reason: "window"` — a `setTimeout` fired first, so the loop is paced and
 *                          the event loop is healthy.
 *
 * Usage: bun spin-probe.ts '{"polling":20,"limit":50000,"windowMs":500,"mode":"call"}'
 */
import { writeSync } from "node:fs";
import { call, type Operation, run } from "effection";
import { startSync } from "../src/sync-protocols/orchestration/sync.ts";

type ProbeSpec = {
  /** `pollingInterval` for the fake protocol config; `null` omits the key entirely. */
  polling: number | null;
  /** Iteration count at which we declare the loop unpaced and bail out. */
  limit: number;
  /** Wall-clock budget; if this timer fires, the loop is paced. */
  windowMs: number;
  /**
   * How `stateToInput` returns:
   *  - "sync" — returns `undefined` with no suspension at all (worst case).
   *  - "call" — `yield* call(() => <sync value>)` first, mirroring utxorpc's
   *             `stateToInput`, which calls the in-memory `fetcher.lastHeight()`
   *             before deciding it is caught up. This is the production shape.
   */
  mode: "sync" | "call";
};

const spec: ProbeSpec = JSON.parse(process.argv[2]);

const startedAt = Date.now();
let iterations = 0;

function report(reason: "limit" | "window"): never {
  writeSync(
    1,
    JSON.stringify({
      reason,
      iterations,
      elapsedMs: Date.now() - startedAt,
    }) + "\n",
  );
  process.exit(0);
}

// Fires only if the loop leaves room for macrotasks.
setTimeout(() => report("window"), spec.windowMs);

const syncProtocol: Record<string, unknown> = { name: "probe" };
if (spec.polling != null) syncProtocol.pollingInterval = spec.polling;

/**
 * Minimal stand-in for a `SyncState`. Only the members `startSync` actually
 * touches are implemented; it is cast at the call site the same way the real
 * states are (`startSync` takes `AllSyncProtocols` and narrows to `ISyncProtocol`).
 */
const fakeState = {
  name: "probe",
  consecutiveErrors: 0,
  lastErrorTimestamp: 0,
  lastSuccessfulFetchMs: 0,
  getNamespace: () => ["probe", "probe"],
  *startAsync(): Operation<void> {},
  *stateToInput(): Operation<undefined> {
    iterations++;
    if (iterations >= spec.limit) report("limit");
    if (spec.mode === "call") {
      // utxorpc reads an in-memory tip here — a `call` over a synchronous value.
      yield* call(() => 0);
    }
    // "caught up": nothing to fetch this pass.
    return undefined;
  },
  fetcher: {
    config: { syncProtocol },
    producerChannel: { *send(): Operation<void> {} },
    *readData(): Operation<never> {
      throw new Error("unreachable: stateToInput always returns undefined");
    },
  },
  *updateState(): Operation<void> {},
};

await run(function* () {
  yield* startSync(fakeState as never);
  // Park forever; one of the two exit paths above ends the process.
  yield* call(() => new Promise<void>(() => {}));
});

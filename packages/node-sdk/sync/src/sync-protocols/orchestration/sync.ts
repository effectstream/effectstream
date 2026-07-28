import type { Operation } from "effection";
import { sleep, spawn } from "effection";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import type { AllSyncProtocols, ISyncProtocol } from "../types.ts";
import { tryYield } from "@effectstream/utils";

/**
 * Used when a protocol config carries no `pollingInterval`.
 *
 * Every polling protocol declares one via `PollingSyncProtocol`, so this should
 * be unreachable — it exists because the cost of getting it wrong is not a slow
 * loop but a dead node. A pass through this loop that neither fetches nor
 * sleeps never yields to the macrotask queue, which starves the entire process:
 * no timers, no HTTP server, no other chain's fetch loop, and (for streaming
 * chains) none of the stream callbacks that would let this loop make progress.
 * See `sync/test/poll-loop-spin.test.ts`.
 */
const FALLBACK_POLLING_INTERVAL_MS = 1_000;

/** This protocol's polling interval, or the fallback above. */
function pollingIntervalOf(config: { syncProtocol: unknown }): number {
  const syncProtocol = config.syncProtocol as { pollingInterval?: number };
  return syncProtocol?.pollingInterval ?? FALLBACK_POLLING_INTERVAL_MS;
}

/** Backoff bounds for restarting a dead streaming producer. */
const PRODUCER_MIN_BACKOFF_MS = 1_000;
const PRODUCER_MAX_BACKOFF_MS = 30_000;

export function* startSync(
  state: AllSyncProtocols,
): Operation<void> {
  const iState: ISyncProtocol = state as ISyncProtocol;

  yield* spawn(function* () {
    if (!iState.hasAsyncProducer) {
      // Polled chain: startAsync is the base-class no-op. Run it once, as
      // before — supervising it would mean restarting a no-op forever.
      yield* iState.startAsync();
      return;
    }

    // Streaming chain: all of this protocol's data arrives through the
    // producer, so if it dies the chain goes silent and the merge blocks on its
    // page forever. Both of its exit modes used to be unhandled — a throw tore
    // down the enclosing scope (in production, `start()`, taking every other
    // chain with it), and a clean return went entirely unnoticed. Supervise
    // both. See `sync/test/start-async-supervision.test.ts`.
    let attempt = 0;
    while (true) {
      const result = yield* tryYield(iState.startAsync());

      if (result.error != null) {
        state.consecutiveErrors++;
        state.lastErrorTimestamp = Date.now();
        log.remote(
          ComponentNames.EFFECTSTREAM_SYNC,
          [...state.getNamespace(), "startAsync"],
          SeverityNumber.ERROR,
          (l) => l(result.error),
        );
      } else {
        // Returning is a failure for a producer: its stream ended. Treated the
        // same as a throw, because the observable effect is identical — no
        // more data.
        log.remote(
          ComponentNames.EFFECTSTREAM_SYNC,
          [...state.getNamespace(), "startAsync"],
          SeverityNumber.WARN,
          (l) => l("producer returned: stream ended, restarting"),
        );
      }

      state.producerRestarts++;
      const backoff = Math.min(
        PRODUCER_MIN_BACKOFF_MS * 2 ** attempt,
        PRODUCER_MAX_BACKOFF_MS,
      );
      attempt++;
      yield* sleep(backoff);
    }
  });

  // spawn polling task
  yield* spawn(function* () {
    while (true) {
      const inputResult = yield* tryYield(iState.stateToInput());
      if (inputResult.error != null) {
        state.consecutiveErrors++;
        state.lastErrorTimestamp = Date.now();
        log.remote(
          ComponentNames.EFFECTSTREAM_SYNC,
          [...state.getNamespace(), "stateToInput"],
          SeverityNumber.ERROR,
          (log) => log(inputResult.error),
        );
        yield* sleep(pollingIntervalOf(state.fetcher.config));
        continue;
      }
      const input = inputResult.data;
      if (input == null) {
        // Caught up. This is the ordinary steady state, and the pass that must
        // never skip its sleep — see FALLBACK_POLLING_INTERVAL_MS.
        yield* sleep(pollingIntervalOf(state.fetcher.config));
        continue;
      }

      const result = yield* tryYield(iState.fetcher.readData(input, iState));
      if (result.error != null) {
        state.consecutiveErrors++;
        state.lastErrorTimestamp = Date.now();
        log.remote(
          ComponentNames.EFFECTSTREAM_SYNC,
          [...state.getNamespace(), "readData"],
          SeverityNumber.ERROR,
          (l) => l(result.error),
        );
        yield* sleep(pollingIntervalOf(state.fetcher.config));
        continue;
      }
      state.consecutiveErrors = 0;
      state.lastSuccessfulFetchMs = Date.now();
      log.remote(
        ComponentNames.EFFECTSTREAM_SYNC,
        [...state.getNamespace(), "data"],
        SeverityNumber.TRACE,
        (log) => log(result.data),
      );
      yield* iState.updateState(input, result.data);
      for (const datum of result.data.output) {
        yield* iState.fetcher.producerChannel.send(datum.output);
      }
    }
  });
}

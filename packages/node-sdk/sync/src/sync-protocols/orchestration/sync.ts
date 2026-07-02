import type { Operation } from "effection";
import { sleep, spawn } from "effection";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import type { AllSyncProtocols, ISyncProtocol } from "../types.ts";
import { tryYield } from "@effectstream/utils";

// ponytail: fixed cap; a producer that can't connect in 5 tries is dead, not flaky.
const STARTASYNC_MAX_ATTEMPTS = 5;

export function* startSync(
  state: AllSyncProtocols,
): Operation<void> {
  const iState: ISyncProtocol = state as ISyncProtocol;
  const { config } = state.fetcher;
  const pollingInterval = "pollingInterval" in config.syncProtocol
    ? config.syncProtocol.pollingInterval
    : undefined;

  // spawn async task — retried like the stages below, but bounded: a dead
  // producer stalls the merge silently, so on exhaustion rethrow and halt.
  yield* spawn(function* () {
    for (let attempt = 1; ; attempt++) {
      const result = yield* tryYield(iState.startAsync());
      if (result.error == null) return;
      state.consecutiveErrors++;
      state.lastErrorTimestamp = Date.now();
      log.remote(
        ComponentNames.EFFECTSTREAM_SYNC,
        [...state.getNamespace(), "startAsync"],
        SeverityNumber.ERROR,
        (log) => log(result.error),
      );
      if (attempt >= STARTASYNC_MAX_ATTEMPTS) throw result.error;
      if (pollingInterval != null) yield* sleep(pollingInterval);
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
        if (pollingInterval != null) yield* sleep(pollingInterval);
        continue;
      }
      const input = inputResult.data;
      if (input == null) {
        // Idle iteration = success too; otherwise errors right before
        // catch-up would leave a stale non-zero streak forever.
        state.consecutiveErrors = 0;
        if (pollingInterval != null) yield* sleep(pollingInterval);
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
        if (pollingInterval != null) yield* sleep(pollingInterval);
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

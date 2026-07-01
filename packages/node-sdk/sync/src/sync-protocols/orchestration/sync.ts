import type { Operation } from "effection";
import { sleep, spawn } from "effection";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import type { AllSyncProtocols, ISyncProtocol } from "../types.ts";
import { tryYield } from "@effectstream/utils";

export function* startSync(
  state: AllSyncProtocols,
): Operation<void> {
  const iState: ISyncProtocol = state as ISyncProtocol;

  // spawn async task
  yield* spawn(function* () {
    yield* iState.startAsync();
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
        const { config } = state.fetcher;
        if ("pollingInterval" in config.syncProtocol) {
          yield* sleep(config.syncProtocol.pollingInterval);
        }
        continue;
      }
      const input = inputResult.data;
      const { config } = state.fetcher;
      if (input == null) {
        if ("pollingInterval" in config.syncProtocol) {
          yield* sleep(config.syncProtocol.pollingInterval);
        }
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
        if ("pollingInterval" in config.syncProtocol) {
          yield* sleep(config.syncProtocol.pollingInterval);
        }
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

      const updateResult = yield* tryYield(
        iState.updateState(input, result.data),
      );
      if (updateResult.error != null) {
        state.consecutiveErrors++;
        state.lastErrorTimestamp = Date.now();
        log.remote(
          ComponentNames.EFFECTSTREAM_SYNC,
          [...state.getNamespace(), "updateState"],
          SeverityNumber.ERROR,
          (l) => l(updateResult.error),
        );
        if ("pollingInterval" in config.syncProtocol) {
          yield* sleep(config.syncProtocol.pollingInterval);
        }
        continue;
      }

      let sendError: unknown = null;
      for (const datum of result.data.output) {
        const sendResult = yield* tryYield(
          iState.fetcher.producerChannel.send(datum.output),
        );
        if (sendResult.error != null) {
          sendError = sendResult.error;
          break;
        }
      }
      if (sendError != null) {
        state.consecutiveErrors++;
        state.lastErrorTimestamp = Date.now();
        log.remote(
          ComponentNames.EFFECTSTREAM_SYNC,
          [...state.getNamespace(), "producerChannel"],
          SeverityNumber.ERROR,
          (l) => l(sendError),
        );
        if ("pollingInterval" in config.syncProtocol) {
          yield* sleep(config.syncProtocol.pollingInterval);
        }
        continue;
      }
    }
  });
}

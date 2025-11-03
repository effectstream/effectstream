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
      const input = yield* iState.stateToInput();
      const { config } = state.fetcher;
      if (input == null) {
        if ("pollingInterval" in config.syncProtocol) {
          yield* sleep(config.syncProtocol.pollingInterval);
        } else {
          console.error(`${self.name} has no polling interval?`);
        }
        continue;
      }

      const result = yield* tryYield(iState.fetcher.readData(input, iState));
      if (result.error != null) {
        console.error(
          `${self.name}`,
          result.error,
        );
        continue;
      }
      log.remote(
        ComponentNames.PAIMA_SYNC,
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

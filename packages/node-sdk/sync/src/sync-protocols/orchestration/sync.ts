import type { Operation, Yielded } from "effection";
import { sleep, spawn } from "effection";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import type { AllSyncProtocols } from "../types.ts";

export function* startSync(
  state: AllSyncProtocols,
): Operation<void> {
  yield* spawn(function* () {
    while (true) {
      const input = yield* state.stateToInput();
      if (input == null) {
        yield* sleep(state.fetcher.config.syncProtocol.pollingInterval);
        continue;
      }

      let data: Yielded<ReturnType<typeof state.fetcher.readData>>;
      try {
        data = yield* state.fetcher.readData(input, state);
      } catch (e) {
        console.error(
          `${self.name}`,
          e,
        );
        continue;
      }
      log.remote(
        ComponentNames.PAIMA_SYNC,
        [...state.getNamespace(), "data"],
        SeverityNumber.TRACE,
        (log) => log(data),
      );
      yield* state.updateState(input, data);
      for (const datum of data.output) {
        yield* state.fetcher.producerChannel.send(datum.output);
      }
    }
  });
}

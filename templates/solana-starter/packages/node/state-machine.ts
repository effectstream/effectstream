import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("solana-program-log", function* (data) {
  const { parsedInput, blockHeight } = data;
  const { slot, program_id, log_messages } = parsedInput;

  console.log(
    `[STM] solana-program-log: block=${blockHeight} slot=${slot} program=${program_id} logs=${log_messages.length}`,
  );

  // Example: store in a user table or process further
  yield* World.resolve(
    async () => {
      // Placeholder for actual database insert
      console.log(`  -> Stored program log event for slot ${slot}`);
    },
    {},
  );
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

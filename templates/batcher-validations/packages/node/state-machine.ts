import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { insertCommand } from "@batcher-validations/database";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("sendMessage", function* (data) {
  const { parsedInput, signerAddress: sender, blockHeight } = data;

  yield* World.resolve(insertCommand, {
    sender,
    message: parsedInput.message,
    block_height: blockHeight,
  });
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

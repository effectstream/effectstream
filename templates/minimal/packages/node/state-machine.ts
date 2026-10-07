import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { insertInput } from "@minimal/database";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("my_action_name", function* (data) {
  const { parsedInput, signerAddress: signer, blockHeight } = data;

  yield* World.resolve(insertInput, {
    signer,
    payload: parsedInput.input,
    block_height: blockHeight,
  });
});

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

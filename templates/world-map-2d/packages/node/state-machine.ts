import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  createGlobalUserState,
  updateUserGlobalPosition,
  updateWorldStateCounter,
} from "@world-map-2d/database";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("joinWorld", function* (data) {
  const { signerAddress: wallet } = data;
  yield* World.resolve(createGlobalUserState, { wallet, x: 0, y: 0 });
});

stm.addStateTransition("submitMove", function* (data) {
  const { signerAddress: wallet, parsedInput } = data;
  const { x, y } = parsedInput;
  yield* World.resolve(updateUserGlobalPosition, { wallet, x, y });
});

stm.addStateTransition("submitIncrement", function* (data) {
  const { parsedInput } = data;
  const { x, y } = parsedInput;
  yield* World.resolve(updateWorldStateCounter, { x, y });
});

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

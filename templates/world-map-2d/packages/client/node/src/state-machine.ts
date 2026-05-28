import { PaimaSTM } from "@effectstream/sm";
import { grammar } from "@world-map-2d/data-types/grammar";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  joinWorld,
  submitMove,
  submitIncrement,
} from "./state-machine/v1/transition.ts";

const stm = new PaimaSTM<typeof grammar, any>(grammar);
type SQLUpdate = [any, any];

stm.addStateTransition("joinWorld", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;
  const result = yield* World.promise<SQLUpdate>(
    joinWorld(
      user!,
      blockHeight,
      {
        input: "joinWorld",
        ...parsedInput,
      },
      randomGenerator
    )
  );
  yield* printSQLQuery(result);
  yield* World.resolve(result[0], result[1]);
});

stm.addStateTransition("submitMove", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;
  const result = yield* World.promise<SQLUpdate>(
    submitMove(
      user!,
      blockHeight,
      {
        input: "submitMove",
        ...parsedInput,
      },
      randomGenerator
    )
  );
  yield* printSQLQuery(result);
  yield* World.resolve(result[0], result[1]);
});

stm.addStateTransition("submitIncrement", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;
  const result = yield* World.promise<SQLUpdate>(
    submitIncrement(
      user!,
      blockHeight,
      {
        input: "submitIncrement",
        ...parsedInput,
      },
      randomGenerator
    )
  );
  yield* printSQLQuery(result);
  yield* World.resolve(result[0], result[1]);
});

function* printSQLQuery(result: any) {
  console.error("--------------------------------");
  console.error(`Processing Query`);
  console.error(`Prepared Query:\n${result[0].queryIR.statement}\n\n`);
  console.error(`Parameters:\n${JSON.stringify(result[1], null, 2)}\n\n`);
}

/**
 * This function allows you to route between different State Transition Functions
 * based on block height. In other words when a new update is pushed for your game
 * that includes new logic, this router allows your game node to cleanly maintain
 * backwards compatibility with the old history before the new update came into effect.
 */
export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput
): SyncStateUpdateStream<void> {
  if (blockHeight >= 0) {
    yield* stm.processInput(input);
  } else {
    yield* stm.processInput(input);
  }
  return;
};

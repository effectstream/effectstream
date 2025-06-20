import { PaimaSTM } from "@paima/sm";
import { grammar } from "@example/data-types";
import type { BaseStfInput } from "@paima/sm";
import { insertStateMachineInput } from "@paima/db";

type MyEvents = {}; // TODO: replace
export const stm = new PaimaSTM<typeof grammar, MyEvents>(grammar);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
stm.addStateTransition(
  "attack",
  async (data) => {
    await sleep(100);
    console.log("HERE", data.parsedInput.playerId);
    return {
      stateTransitions: [
        [insertStateMachineInput, {
          inputs: data.parsedInput.payload || "input data",
          block_height: data.parsedInput.blockHeight || 0,
        }],
      ],
      events: [],
    };
  },
);

stm.addStateTransition(
  "transfer",
  async (data) => {
    console.log("HERE", data.parsedInput.payload);
    return { stateTransitions: [], events: [] };
  },
);

// stm.finalize(); // this avoids people dynamically calling stm.addStateTransition after initialization

// This function allows you to route between different State Transition Functions
// based on block height. In other words when a new update is pushed for your game
// that includes new logic, this router allows your game node to cleanly maintain
// backwards compatibility with the old history before the new update came into effect.
export async function gameStateTransitionRouter(
  blockHeight: number,
  input: BaseStfInput,
) {
  let result;
  if (blockHeight >= 0) {
    result = await stm.processInput(input);
  } else {
    result = await stm.processInput(input);
  }
  return result;
}

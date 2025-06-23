import { PaimaSTM } from "@paima/sm";
import { grammar } from "@example/data-types";
import type { BaseStfInput, BaseStfOutput } from "@paima/sm";
import { insertStateMachineInput } from "@paima/db";

type MyEvents = {}; // TODO: replace
const stm = new PaimaSTM<typeof grammar, MyEvents>(grammar);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
stm.addStateTransition(
  "attack",
  async (data) => {
    await sleep(0);
    // This is where game logic is executed.
    return {
      stateTransitions: [
        [insertStateMachineInput, {
          inputs: typeof data.rawInput.inputData === "string"
            ? data.rawInput.inputData
            : JSON.stringify(data.rawInput.inputData),
          block_height: 0,
        }],
      ],
      events: [],
    };
  },
);

stm.addStateTransition(
  "transfer",
  async (data) => {
    await sleep(0);
    // This is where game logic is executed.
    return {
      stateTransitions: [
        [insertStateMachineInput, {
          inputs: typeof data.rawInput.inputData === "string"
            ? data.rawInput.inputData
            : JSON.stringify(data.rawInput.inputData),
          block_height: 0,
        }],
      ],
      events: [],
    };
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
): Promise<BaseStfOutput<MyEvents>> {
  let result;
  if (blockHeight >= 0) {
    result = await stm.processInput(input);
  } else {
    result = await stm.processInput(input);
  }
  return result;
}

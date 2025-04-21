import { PaimaSTM } from "@paima/sm";
import { grammar } from "@example/data-types";


type MyEvents = {}; // TODO: replace
export const stm = new PaimaSTM<typeof grammar, MyEvents>(grammar);

stm.addStateTransition(
  'attack',
  async (data) => {
    console.log("HERE", data.parsedInput.playerId);
    return { stateTransitions: [], events: [] }
  }
);

stm.addStateTransition(
  'tokenTransfer',
  async (data) {
    console.log("HERE", data.parsedInput.payload);
    return { stateTransitions: [], events: [] }
  }
);

stm.finalize(); // this avoids people dynamically calling stm.addStateTransition after initialization

// This function allows you to route between different State Transition Functions
// based on block height. In other words when a new update is pushed for your game
// that includes new logic, this router allows your game node to cleanly maintain
// backwards compatibility with the old history before the new update came into effect.
export function gameStateTransitionRouter(blockHeight: number) {
  if (blockHeight >= 0) return stm.processInput;
  else return stm.processInput;
}


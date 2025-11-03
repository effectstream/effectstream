import type { Prando } from "@effectstream/crypto";
import type { ProcessTickFn, RoundExecutor, RoundNumbered } from "./types.ts";

// The round executor enables games to build encapsulated "mini-state machines" in their game that natively work with frontends.
// Round executors typically hold most real gameplay logic, and emit `TickEvent`s to describe updates to the `matchState`.
// Data related to the match which should not be mutated by the round executor should be in `matchEnvironment`.
// Data related to match state which should be mutated should be stored in `matchState`.
export interface RoundExecutorInitializer {
  initialize: <
    MatchEnvironment,
    MatchState,
    MoveType extends RoundNumbered,
    TickEvent,
  >(
    matchEnvironment: MatchEnvironment,
    matchState: MatchState,
    submittedMoves: MoveType[],
    randomnessGenerator: Prando,
    processTick: ProcessTickFn<
      MatchEnvironment,
      MatchState,
      MoveType,
      TickEvent
    >,
  ) => RoundExecutor<MatchState, TickEvent>;
}

export const roundExecutor: RoundExecutorInitializer = {
  initialize: (
    matchEnvironment,
    matchState,
    userInputs,
    randomnessGenerator,
    processTick,
  ) => {
    randomnessGenerator.reset();
    return {
      currentTick: 1,
      currentState: matchState,
      tick(): ReturnType<typeof this.tick> {
        const events = processTick(
          matchEnvironment,
          this.currentState,
          userInputs,
          this.currentTick,
          randomnessGenerator,
        );
        this.currentTick++;
        return events;
      },
      processAllTicks(): Exclude<ReturnType<typeof this.tick>, null> {
        const ticks: Exclude<ReturnType<typeof this.tick>, null> = [];
        while (true) {
          // Tick returns null after last event.
          const tick: ReturnType<typeof this.tick> = this.tick();
          if (tick) tick.forEach((t) => ticks.push(t));
          else return ticks;
        }
      },
      endState(): ReturnType<typeof this.endState> {
        while (this.tick() !== null);
        return this.currentState;
      },
    };
  },
};

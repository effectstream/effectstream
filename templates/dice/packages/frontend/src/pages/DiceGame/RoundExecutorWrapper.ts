import Prando from "prando";
import { processTick } from "@dice/game-logic";
import { cloneMatchState } from "@dice/game-logic";
import type { MatchState, TickEvent } from "@dice/utils";
import type { IGetRoundMovesResult } from "@dice/db";

export class RoundExecutorWrapper {
  private moves: IGetRoundMovesResult[];
  private matchEnvironment: { numberOfRounds: number };
  private initialMatchState: MatchState;
  private randomnessGenerator: Prando;

  constructor(
    moves: IGetRoundMovesResult[],
    lobbyData: any,
    initialMatchState: MatchState
  ) {
    this.moves = moves;
    this.matchEnvironment = {
      numberOfRounds: lobbyData.num_of_rounds,
    };
    this.initialMatchState = cloneMatchState(initialMatchState);
    this.randomnessGenerator = new Prando(lobbyData.roundSeed || "default-seed");
  }

  processAllTicks(): TickEvent[] {
    const allEvents: TickEvent[] = [];
    let currentState = cloneMatchState(this.initialMatchState);
    let currentTick = 0;

    while (true) {
      currentTick++;
      const tickEvents = processTick(
        this.matchEnvironment,
        currentState,
        this.moves,
        currentTick,
        this.randomnessGenerator
      );

      if (tickEvents === null) {
        break;
      }

      allEvents.push(...tickEvents);
    }

    return allEvents;
  }

  endState(): MatchState {
    const endState = cloneMatchState(this.initialMatchState);
    let currentTick = 0;

    while (true) {
      currentTick++;
      const tickEvents = processTick(
        this.matchEnvironment,
        endState,
        this.moves,
        currentTick,
        this.randomnessGenerator
      );

      if (tickEvents === null) {
        break;
      }
    }

    return endState;
  }
}

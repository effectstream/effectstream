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
    const seed = lobbyData.roundSeed || "default-seed";
    console.log(`[RoundExecutorWrapper] Using seed: ${seed}`);
    this.randomnessGenerator = new Prando(seed);
  }

  processAllTicks(): TickEvent[] {
    console.log(`[RoundExecutorWrapper] Processing round with ${this.moves.length} moves`);
    console.log(`[RoundExecutorWrapper] initialMatchState:`, {
      turn: this.initialMatchState.turn,
      properRound: this.initialMatchState.properRound,
      players: this.initialMatchState.players.map(p => ({ nftId: p.nftId, turn: p.turn, score: p.score, points: p.points }))
    });
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

      console.log(`[RoundExecutorWrapper] Tick ${currentTick} generated ${tickEvents.length} events`);
      allEvents.push(...tickEvents);
    }

    console.log(`[RoundExecutorWrapper] Total: ${allEvents.length} events`);
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

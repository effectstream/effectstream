// import type { MatchExecutor, RoundExecutor } from '@paimaexample/sdk/executors';
// import { matchExecutor } from '@paimaexample/sdk/executors';
// import { Prando } from "@paimaexample/crypto";

class Prando {
  _seed: string;
  constructor(seed: string) {
    this._seed = seed;
  }
}

import type {
  MatchExecutor,
  MatchState,
  RoundExecutor,
  TickEvent,
} from "@chess/game-logic";
import { initialState } from "@chess/game-logic";
import {
  extractMatchEnvironment,
  initRoundExecutor,
  processTick,
} from "@chess/game-logic";
import type { MatchExecutorData, RoundExecutorData } from "@chess/utils";

export function buildRoundExecutor(
  data: RoundExecutorData,
  round: number,
): RoundExecutor<MatchState, TickEvent> {
  const { seed } = data.block_height;
  console.log(seed, "seed used for the round executor at the middleware");
  const randomnessGenerator: any = new Prando(seed);
  return initRoundExecutor(
    data.lobby,
    round,
    data.match_state,
    data.moves,
    randomnessGenerator,
  );
}

export function buildMatchExecutor({
  lobby,
  moves,
  seeds,
}: MatchExecutorData): MatchExecutor<MatchState, TickEvent> {
  console.log(seeds, "seeds used for the match executor at the middleware");

  const matchExecutor = {
    initialize: (...args: any[]) => {
      console.log("NYI");
      return null as any;
    },
  };
  const matchState: MatchState = { fenBoard: initialState() };
  return matchExecutor.initialize(
    extractMatchEnvironment(lobby),
    lobby.num_of_rounds,
    matchState,
    seeds,
    moves,
    processTick,
  );
}

import type { RoundExecutor } from '@paima/sdk/executors';
import Prando from '@paima/sdk/prando';

import { initRoundExecutor } from '@game/game-logic';
import type { RoundExecutorData } from '@game/utils';

export async function buildRoundExecutor(
  data: RoundExecutorData,
  round: number
): Promise<RoundExecutor> {
  const { seed } = data.block_height;
  console.log(seed, 'seed used for the round executor at the middleware');
  const randomnessGenerator = new Prando(seed);
  return initRoundExecutor(data.lobby, round, data.moves, randomnessGenerator);
}

// export function buildMatchExecutor({ lobby, moves, seeds }: MatchExecutorData): MatchExecutor {
//   console.log(seeds, 'seeds used for the match executor at the middleware');
//   return matchExecutor.initialize(
//     extractMatchEnvironment(lobby, round),
//     lobby.num_of_rounds,
//     extractMatchState(lobby),
//     seeds,
//     moves,
//     processTick
//   );
// }

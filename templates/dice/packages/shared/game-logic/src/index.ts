import type { RoundExecutor } from '@paima/sdk/executors';
import { roundExecutor } from '@paima/sdk/executors';
import type Prando from '@paima/sdk/prando';
import type { MatchState, MatchEnvironment, TickEvent } from '@dice/utils';
import { processTick } from './tick';
import type { IGetLobbyByIdResult, IGetRoundMovesResult } from '@dice/db';
import { cloneMatchState } from './dice-logic';

export * from './tick';
export * from './dice-logic';

// We initialize the round executor object using lobby data + submitted moves + randomness generator.
// This function extracts the match environment and match state from the lobby.
// and the chess `processTick` function
export function initRoundExecutor(
  lobby: IGetLobbyByIdResult,
  matchState: MatchState,
  moves: IGetRoundMovesResult[],
  randomnessGenerator: Prando
): RoundExecutor<MatchState, TickEvent> {
  const paimaMoves = moves.map(move => ({
    ...move,
    round: move.round_within_match,
  }));

  return roundExecutor.initialize(
    extractMatchEnvironment(lobby),
    buildMatchState(matchState),
    paimaMoves,
    randomnessGenerator,
    processTick
  );
}

// From a lobby, extract a match environment which will be used by the round executor.
// A match environment is a piece of immutable data about the match which is
// relevant to the round executor, but which can not be updated.
export function extractMatchEnvironment(lobby: IGetLobbyByIdResult): MatchEnvironment {
  return { practice: lobby.practice, numberOfRounds: lobby.num_of_rounds };
}

// From a given round, construct the match state which will be used by the round executor.
// A match state is comprised of mutable data which the round executor will
// update, and in the end return a final new match state upon completion.
export const buildMatchState = (matchState: MatchState): MatchState => cloneMatchState(matchState);

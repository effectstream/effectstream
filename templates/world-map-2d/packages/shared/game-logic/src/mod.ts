import type { RoundExecutor } from '@paima/sdk/executors';
import { roundExecutor } from '@paima/sdk/executors';
import type Prando from '@paima/sdk/prando';
import type { MatchState, MatchEnvironment, TickEvent } from './types';
import { processTick } from './tick';

export * from './types';
export * from './tick';

// We initialize the round executor object using lobby data + submitted moves + randomness generator.
// This function extracts the match environment and match state from the lobby.
// and the openworld `processTick` function
export function initRoundExecutor(
  matchState: null,
  randomnessGenerator: Prando
): RoundExecutor<MatchState, TickEvent> {
  return roundExecutor.initialize(
    extractMatchEnvironment(),
    buildMatchState(),
    [],
    randomnessGenerator,
    processTick
  );
}

// From a lobby, extract a match environment which will be used by the round executor.
// A match environment is a piece of immutable data about the match which is
// relevant to the round executor, but which can not be updated.
export function extractMatchEnvironment(): MatchEnvironment {
  return {};
}

// From a given round, construct the match state which will be used by the round executor.
// A match state is comprised of mutable data which the round executor will
// update, and in the end return a final new match state upon completion.
export const buildMatchState = (): MatchState => ({});

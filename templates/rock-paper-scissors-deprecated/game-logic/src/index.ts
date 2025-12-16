import type { RoundExecutor } from '@paima/sdk/executors';
import { roundExecutor } from '@paima/sdk/executors';
import type Prando from '@paima/sdk/prando';
// import { MatchState, MatchEnvironment } from './types';
import type { MatchState, MatchEnvironment } from './types';
import { processTick } from './tick';
import type { IGetLobbyByIdResult, IGetCachedMovesResult } from '@game/db';

export * from './types';
export * from './tick';
export * from './rock-paper-scissor';

// We initialize the round executor object using lobby data + submitted moves + randomness generator.
// This function extracts the match environment and match state from the lobby.
// and the chess `processTick` function
export function initRoundExecutor(
  lobby: IGetLobbyByIdResult,
  round: number,
  moves: IGetCachedMovesResult[],
  randomnessGenerator: Prando
): RoundExecutor {
  return roundExecutor.initialize(
    extractMatchEnvironment(lobby, round),
    extractMatchState(lobby),
    moves,
    randomnessGenerator,
    processTick
  );
}

// From a lobby, extract a match environment which will be used by the round executor.
// A match environment is a piece of immutable data about the match which is
// relevant to the round executor, but which can not be updated.
export function extractMatchEnvironment(
  lobby: IGetLobbyByIdResult,
  round: number
): MatchEnvironment {
  return {
    current_round: round,
    num_of_rounds: lobby.num_of_rounds!,
    user1: {
      wallet: lobby.lobby_creator,
    },
    user2: {
      wallet: lobby.player_two!,
    },
  };
}

// From a lobby, extract the match state which will be used by the round executor.
// A match state is comprised of mutable data which the round executor will
// update, and in the end return a final new match state upon completion.
export function extractMatchState(lobby: IGetLobbyByIdResult): MatchState {
  return {
    moves_rps: lobby.latest_match_state,
  };
}

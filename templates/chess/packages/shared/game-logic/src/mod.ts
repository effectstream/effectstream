// import type { RoundExecutor } from '@paimaexample/sdk/executors';
// import { roundExecutor } from '@paimaexample/sdk/executors';
import { Prando } from "@paimaexample/crypto";
import type { MatchEnvironment, MatchState, TickEvent } from "./types.ts";
import { processTick } from "./tick.ts";
import type { IGetLobbyByIdResult, IGetRoundMovesResult } from "@chess/db";
import { BLACK, WHITE } from "chess.js";
import { roundExecutor } from "./round_executor.ts";

export * from "./types.ts";
export type * from "./types.ts";
export * from "./tick.ts";
export * from "./chess-logic.ts";
export * from "./round_executor.ts";
export * from "./match_executor.ts";

// We initialize the round executor object using lobby data + submitted moves + randomness generator.
// This function extracts the match environment and match state from the lobby.
// and the chess `processTick` function
export function initRoundExecutor(
  lobby: IGetLobbyByIdResult,
  round: number,
  matchState: string,
  moves: IGetRoundMovesResult[],
  randomnessGenerator: Prando,
) {
  return roundExecutor.initialize(
    extractMatchEnvironment(lobby),
    buildMatchState(matchState),
    moves,
    randomnessGenerator,
    processTick,
  );
}

// From a lobby, extract a match environment which will be used by the round executor.
// A match environment is a piece of immutable data about the match which is
// relevant to the round executor, but which can not be updated.
export function extractMatchEnvironment(
  lobby: IGetLobbyByIdResult,
): MatchEnvironment {
  return {
    user1: {
      wallet: lobby.lobby_creator,
      color: lobby.player_one_iswhite ? WHITE : BLACK,
    },
    user2: {
      wallet: lobby.player_two!,
      color: lobby.player_one_iswhite !== true ? WHITE : BLACK,
    },
  };
}

// From a given round, construct the match state which will be used by the round executor.
// A match state is comprised of mutable data which the round executor will
// update, and in the end return a final new match state upon completion.
export const buildMatchState = (board: string): MatchState => ({
  fenBoard: board,
});

// initial board state in fen notation
export const initialState = () =>
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

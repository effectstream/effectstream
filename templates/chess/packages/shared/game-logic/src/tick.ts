import type { Prando } from "@effectstream/crypto";
import { Chess } from "chess.js";
import { gameOverFromChess, updateBoard } from "./chess-logic.ts";
import type { MatchEnvironment, MatchState, TickEvent } from "./types.ts";
import type { IGetRoundMovesResult } from "@chess/db";

// Executes a round executor tick and generates a tick event as a result
export function processTick(
  matchEnvironment: MatchEnvironment,
  matchState: MatchState,
  moves: IGetRoundMovesResult[],
  currentTick: number,
  __: Prando,
): TickEvent[] | null {
  // Every tick we intend to process a single move.
  // In chess, there is only one move per round, so there will only be one tick with events.
  const move = moves[currentTick - 1];
  const chess = new Chess();

  // Round ends (by returning null) if no more moves in round or game is finished.
  // This is nearly identical to writing a recursive function, where you want to check
  // the base/halt case before running the rest of the logic.
  if (!move || !move.move_pgn || gameOverFromChess(chess)) return null;

  // If a move does exist, we continue processing the tick by generating the event.
  // Required for frontend visualization and applying match state updates.
  const event: TickEvent = {
    user: move.wallet,
    pgn_move: move.move_pgn,
  };

  // We then call `applyEvents` to mutate the `matchState` based off of the event.
  applyEvents(matchState, event);

  // We return the tick event which gets emitted by the round executor. This is explicitly
  // for the frontend to know what happened during the current tick.
  return [event];
}

// Apply events to match state for the roundExecutor.
// In our case we only have a single event ever emitted in chess
// which simply updates the board state by mutating `matchState` directly.
function applyEvents(matchState: MatchState, event: TickEvent): void {
  const newBoard = updateBoard(matchState.fenBoard, event.pgn_move);
  matchState.fenBoard = newBoard;
}

import type Prando from '@paima/sdk/prando';
import type { IGetCachedMovesResult } from '@game/db';
import type { MatchEnvironment, MatchState, RPSActions, TickEvent } from './types';
import { GameResult, RPSExtendedStates, RPSSummary } from './types';
import { RockPaperScissors } from './rock-paper-scissor';

// Executes a round executor tick and generates a tick event as a result
// Round ends (by returning null) if no more moves in round or game is finished.
// This is nearly identical to writing a recursive function, where you want to check
// the base/halt case before running the rest of the logic.
export function processTick(
  matchEnvironment: MatchEnvironment,
  matchState: MatchState,
  moves: IGetCachedMovesResult[],
  currentTick: number,
  __: Prando
): TickEvent[] | null {
  // Rock Paper Scissors processes all accumulated moves in the first tick.
  if (currentTick > 1) {
    return null;
  }

  //
  // Rock Paper Scissors
  //
  // A tick will execute after two moves or a zombie executer.
  // A move can be a User Input as Rock / Paper / Scissors
  //
  const rps = new RockPaperScissors(matchState.moves_rps);

  if (!moves || !moves.length) {
    rps.endRound(matchEnvironment.current_round);
    console.log('RPS [end]  : ', rps.state);
    // We then call `applyEvents` to mutate the `matchState` based off of the event.
    applyEvents(matchState, rps);
    return null;
  }

  // If a move does exist, we continue processing the tick by generating the event.
  // Required for frontend visualization and applying match state updates.
  const event: TickEvent = {
    user1: matchEnvironment.user1.wallet,
    move1: RPSExtendedStates.DID_NOT_PLAY,
    user2: matchEnvironment.user2.wallet,
    move2: RPSExtendedStates.DID_NOT_PLAY,
    winner: 'tie',
  };

  // If one or two moves apply them and end round.
  moves.forEach(move => {
    if (move.wallet === event.user1) {
      event.move1 = move.move_rps as RPSExtendedStates;
    } else {
      event.move2 = move.move_rps as RPSExtendedStates;
    }

    const isFirstPlayer = move.wallet === matchEnvironment.user1.wallet;
    rps.inputMove(isFirstPlayer, move.move_rps as RPSActions, move.round);
  });

  rps.endRound(matchEnvironment.current_round);

  // We then call `applyEvents` to mutate the `matchState` based off of the event.
  applyEvents(matchState, rps);

  // For RPS 1 Round <=> 1 Tick <=> 1 Event
  // Add the round winner to the emited tick event
  switch (rps.roundWinner(matchEnvironment.current_round)[0]) {
    case GameResult.WIN:
      event.winner = 'user1';
      break;
    case GameResult.LOSS:
      event.winner = 'user2';
      break;
    default:
      event.winner = 'tie';
  }

  // We return the tick event which gets emitted by the round executor. This is explicitly
  // for the frontend to know what happened during the current tick.
  return [event];
}

// Apply events to match state for the roundExecutor.
// In our case we only have a single event ever emitted in chess
// which simply updates the board state by mutating `matchState` directly.
function applyEvents(matchState: MatchState, rps: RockPaperScissors): void {
  matchState.moves_rps = rps.state;
}

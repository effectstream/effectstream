import type { Prando } from '@effectstream/crypto';
import {
  type ApplyPointsTickEvent,
  type MatchEndTickEvent,
  type RollTickEvent,
  type RoundEndTickEvent,
  type TurnEndTickEvent,
  type MatchState,
  type MatchEnvironment,
  type TickEvent,
  TickEventKind,
} from '@dice/data-types/types';
import { genTwoDiceRoll, matchResults, calculateRoundPoints } from './dice-logic.ts';
import type { IGetRoundMovesResult } from '@dice/db';

// TODO: variable number of players
const numPlayers = 2;

// Executes a round executor tick and generates a tick event as a result
export function processTick(
  matchEnvironment: MatchEnvironment,
  matchState: MatchState,
  moves: IGetRoundMovesResult[],
  currentTick: number,
  randomnessGenerator: Prando
): TickEvent[] | null {
  const events: TickEvent[] = [];

  // Every tick we intend to process a single move.
  const move = moves[currentTick - 1];

  // Round ends (by returning null) if no more moves in round or game is finished.
  if (!move) return null;

  // If player passed (roll_again = false), end their turn immediately
  if (!move.roll_again) {
    // Store the turn BEFORE ending it
    const turnThatJustPassed = matchState.turn;

    const turnEndEvents: TurnEndTickEvent[] = [{ kind: TickEventKind.turnEnd }];
    for (const event of turnEndEvents) {
      applyEvent(matchState, event);
      events.push(event);
    }

    // Round ends when turn cycles back to 0 after player 1 (last player) passes
    // This means all players have taken their turns
    const roundEnds = turnThatJustPassed === numPlayers - 1 && matchState.turn === 0;
    const matchEnds = roundEnds && matchState.properRound === matchEnvironment.numberOfRounds - 1;

    if (roundEnds) {
      // Calculate points based on final scores
      const points = calculateRoundPoints(matchState.players);
      const applyPointsEvent: ApplyPointsTickEvent = {
        kind: TickEventKind.applyPoints,
        points,
      };
      applyEvent(matchState, applyPointsEvent);
      events.push(applyPointsEvent);

      const roundEndEvent: RoundEndTickEvent = { kind: TickEventKind.roundEnd };
      applyEvent(matchState, roundEndEvent);
      events.push(roundEndEvent);

      if (matchEnds) {
        const matchEndEvent: MatchEndTickEvent = {
          kind: TickEventKind.matchEnd,
          result: matchResults(matchState),
        };
        applyEvent(matchState, matchEndEvent);
        events.push(matchEndEvent);
      }
    }

    return events;
  }

  // Player chose to roll - generate dice roll event
  const diceRolls = genTwoDiceRoll(randomnessGenerator);
  const rollEvent: RollTickEvent = {
    kind: TickEventKind.roll,
    diceRolls: diceRolls,
    rollAgain: true, // Player stays in their turn after rolling
  };

  applyEvent(matchState, rollEvent);
  events.push(rollEvent);

  return events;
}

// Apply events to match state for the roundExecutor.
export function applyEvent(matchState: MatchState, event: TickEvent): void {
  if (event.kind === TickEventKind.roll) {
    const addedScore = event.diceRolls.reduce((acc, next) => acc + next, 0);
    const turnPlayerIndex = matchState.players.findIndex(player => player.turn === matchState.turn);
    if (turnPlayerIndex === -1) {
      console.error(`applyEvent(roll): No player found with turn ${matchState.turn}`, {
        matchStateTurn: matchState.turn,
        players: matchState.players.map(p => ({ nftId: p.nftId, turn: p.turn }))
      });
      return;
    }
    matchState.players[turnPlayerIndex].score += addedScore;
    return;
  }

  if (event.kind === TickEventKind.applyPoints) {
    for (const i in matchState.players) {
      matchState.players[i].points += event.points[i];
    }
  }

  if (event.kind === TickEventKind.turnEnd) {
    matchState.turn = (matchState.turn + 1) % numPlayers;
    return;
  }

  if (event.kind === TickEventKind.roundEnd) {
    matchState.properRound++;
    // Reset scores for next round
    for (const i in matchState.players) {
      matchState.players[i].score = 0;
    }
  }

  if (event.kind === TickEventKind.matchEnd) {
    matchState.result = event.result;
  }
}

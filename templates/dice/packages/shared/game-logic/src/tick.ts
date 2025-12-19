import type { Prando } from '@paimaexample/crypto';
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
import { genDiceRolls, getPlayerScore, matchResults } from './dice-logic.ts';
import type { IGetRoundMovesResult } from '@dice/db';

// TODO: variable number of players
const numPlayers = 2;

// Executes a round executor tick and generates a tick event as a result
export function processTick(
  matchEnvironment: MatchEnvironment,
  matchState: MatchState,
  // TODO: type for round and match moves is the same, not sure which is provided here
  moves: IGetRoundMovesResult[],
  currentTick: number,
  randomnessGenerator: Prando
): TickEvent[] | null {
  const events: TickEvent[] = [];
  // Every tick we intend to process a single move.
  const move = moves[currentTick - 1];

  // Round ends (by returning null) if no more moves in round or game is finished.
  // This is nearly identical to writing a recursive function, where you want to check
  // the base/halt case before running the rest of the logic.
  if (!move) return null;

  // If a move does exist, we continue processing the tick by generating the event.
  // Required for frontend visualization and applying match state updates.
  const score = getPlayerScore(matchState);
  const diceRolls = genDiceRolls(score, randomnessGenerator);
  const rollEvents: RollTickEvent[] = diceRolls.dice.map((dice, i) => {
    const isLast = i === diceRolls.dice.length - 1;
    return {
      kind: TickEventKind.roll,
      diceRolls: dice,
      rollAgain: !isLast || move.roll_again,
    };
  });

  // We then call `applyEvents` to mutate the `matchState` based off of the event.
  for (const event of rollEvents) {
    applyEvent(matchState, event);
    events.push(event);
  }

  const turnEnds = !rollEvents[rollEvents.length - 1].rollAgain;
  const roundEnds = turnEnds && matchState.turn === numPlayers - 1;
  const matchEnds = roundEnds && matchState.properRound === matchEnvironment.numberOfRounds - 1;

  const applyPointsEvents: ApplyPointsTickEvent[] = (() => {
    if (!roundEnds) return [];

    // rules:
    // Anyone who scored 21 gets 2 points.
    // If nobody scored 21:
    //   Over 21 gets 0 points.
    //   Closest to 21 gets 1 point, but tie is 0 points.

    const points = (() => {
      // replace going over 21 with -1 score, simplifies logic
      const scores = matchState.players.map(player => (player.score > 21 ? -1 : player.score));
      const someoneScored21 = scores.some(score => score === 21);
      if (someoneScored21) {
        return scores.map(score => (score === 21 ? 2 : 0));
      } else {
        const max = Math.max(...scores);

        if (scores.filter(value => value === max).length > 1) return scores.map(() => 0);

        return scores.map(score => (score === max ? 1 : 0));
      }
    })();

    return [
      {
        kind: TickEventKind.applyPoints,
        points,
      },
    ];
  })();
  for (const event of applyPointsEvents) {
    applyEvent(matchState, event);
    events.push(event);
  }

  const turnEndEvents: TurnEndTickEvent[] = turnEnds ? [{ kind: TickEventKind.turnEnd }] : [];
  for (const event of turnEndEvents) {
    applyEvent(matchState, event);
    events.push(event);
  }

  const roundEndEvents: RoundEndTickEvent[] = roundEnds ? [{ kind: TickEventKind.roundEnd }] : [];
  for (const event of roundEndEvents) {
    applyEvent(matchState, event);
    events.push(event);
  }

  const matchEndEvents: MatchEndTickEvent[] = matchEnds
    ? [{ kind: TickEventKind.matchEnd, result: matchResults(matchState) }]
    : [];
  for (const event of matchEndEvents) {
    applyEvent(matchState, event);
    events.push(event);
  }

  // We return the tick event which gets emitted by the round executor. This is explicitly
  // for the frontend to know what happened during the current tick.
  return events;
}

// Apply events to match state for the roundExecutor.
export function applyEvent(matchState: MatchState, event: TickEvent): void {
  if (event.kind === TickEventKind.roll) {
    const addedScore = event.diceRolls.reduce((acc, next) => acc + next, 0);
    const turnPlayerIndex = matchState.players.findIndex(player => player.turn === matchState.turn);
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
    for (const i in matchState.players) {
      matchState.players[i].score = 0;
    }
  }

  if (event.kind === TickEventKind.matchEnd) {
    matchState.result = event.result;
  }
}

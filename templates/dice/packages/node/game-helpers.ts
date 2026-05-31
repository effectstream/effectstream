// Pure dice game helpers. Extracted from the old `@dice/game-logic` package
// during migration; the round/match/tick *executor abstraction* was removed
// (see migration.md Step 3). The pure scoring/validation/points functions live
// here and are applied inline inside the STM transitions in state-machine.ts.

import type { Prando } from "@effectstream/crypto";

// ---------------------------------------------------------------------------
// Types (formerly in @dice/data-types/types.ts)
// ---------------------------------------------------------------------------

// Lobby states
export type LobbyState = "open" | "active" | "finished" | "closed";

// Match results (concise)
export type ConciseResult = "w" | "t" | "l";

// Match result array (one entry per player, ordered by turn)
export type MatchResult = ConciseResult[];

// A single player's in-match state.
export type LobbyPlayer = {
  nftId: number;
  turn: number | undefined;
  points: number; // rounds won across the match
  score: number; // accumulated dice sum within the current round
};

// Mutable match state evolved as moves are applied.
export interface MatchState {
  players: LobbyPlayer[];
  properRound: number; // user-facing round number (0-indexed)
  turn: number; // whose turn it currently is (0 or 1)
  result: MatchResult | undefined; // set once the match ends
}

// TODO: variable number of players. Dice is currently 2-player.
export const NUM_PLAYERS = 2;

// Practice bot NFT id (used by practiceMoves auto-play).
export const PRACTICE_BOT_NFT_ID = 0;

// ---------------------------------------------------------------------------
// Dice primitives
// ---------------------------------------------------------------------------

/** Roll a single die (1-6). */
export function genDieRoll(randomnessGenerator: Prando): number {
  return randomnessGenerator.nextInt(1, 6);
}

/** Roll two dice for a single move; returns the two values. */
export function genTwoDiceRoll(randomnessGenerator: Prando): [number, number] {
  return [genDieRoll(randomnessGenerator), genDieRoll(randomnessGenerator)];
}

/**
 * Final score for a player. Score = abs(21 - sum of all rolls this round).
 * Lower is better (closest to 21 wins the round).
 */
export function calculateFinalScore(totalRolled: number): number {
  return Math.abs(21 - totalRolled);
}

/**
 * Is a move valid? Players can always roll (they choose when to stop) and can
 * always pass — so any move is valid while it's their turn. Kept as a function
 * so callers express intent and future rule changes have one home.
 */
export function isValidMove(_matchState: MatchState, _rollAgain: boolean): boolean {
  return true;
}

/**
 * Points awarded for the round just finished. The player closest to 21 (lowest
 * abs(21 - score)) gets 1 point; ties award 0 to everyone.
 * Returns one entry per player, in the same order as `players`.
 */
export function calculateRoundPoints(players: LobbyPlayer[]): number[] {
  const scores = players.map((p) => calculateFinalScore(p.score));
  const minScore = Math.min(...scores);
  const winnersCount = scores.filter((s) => s === minScore).length;

  if (winnersCount > 1) {
    return scores.map(() => 0);
  }
  return scores.map((s) => (s === minScore ? 1 : 0));
}

/**
 * Final match result per player. Player with the MOST points wins ('w'); a
 * shared maximum is a tie ('t') for those players; everyone else loses ('l').
 * Returns one entry per player, ordered the same as `players`.
 */
export function matchResults(players: LobbyPlayer[]): MatchResult {
  const maxPoints = players.reduce((acc, p) => Math.max(acc, p.points), -Infinity);
  const maxPlayers = players.filter((p) => p.points === maxPoints);

  return players.map((p) => {
    if (p.points < maxPoints) return "l";
    if (maxPlayers.length > 1) return "t";
    return "w";
  });
}

export function getTurnPlayer(matchState: MatchState): LobbyPlayer | undefined {
  return matchState.players.find((p) => p.turn === matchState.turn);
}

// ---------------------------------------------------------------------------
// Single-move resolution (replaces processTick / round_executor / match_executor)
// ---------------------------------------------------------------------------

/**
 * Apply one player's move to the match state, mutating it in place.
 *
 * - rollAgain = true  → roll two dice, add to the current player's round score,
 *                       player keeps the turn.
 * - rollAgain = false → the current player passes; their turn ends. When the
 *                       last player passes (turn cycles back to 0), the round
 *                       resolves: points are awarded, scores reset, properRound
 *                       advances. If that was the final round, the match ends
 *                       and `result` is populated.
 *
 * This inlines what the old `processTick` + executors did, without the event
 * stream / tick-loop indirection.
 */
export function applyMove(
  matchState: MatchState,
  rollAgain: boolean,
  numberOfRounds: number,
  randomnessGenerator: Prando,
): void {
  const turnPlayerIndex = matchState.players.findIndex(
    (p) => p.turn === matchState.turn,
  );
  if (turnPlayerIndex === -1) return;

  // Roll: accumulate dice into the current player's round score and stay.
  if (rollAgain) {
    const [d1, d2] = genTwoDiceRoll(randomnessGenerator);
    matchState.players[turnPlayerIndex].score += d1 + d2;
    return;
  }

  // Pass: end this player's turn.
  const turnThatJustPassed = matchState.turn;
  matchState.turn = (matchState.turn + 1) % NUM_PLAYERS;

  // The round ends once the last player (turn === NUM_PLAYERS - 1) passes and
  // the turn cycles back to 0 — i.e. all players have acted.
  const roundEnds =
    turnThatJustPassed === NUM_PLAYERS - 1 && matchState.turn === 0;
  if (!roundEnds) return;

  // Award round points based on final scores, then reset scores for next round.
  const points = calculateRoundPoints(matchState.players);
  for (let i = 0; i < matchState.players.length; i++) {
    matchState.players[i].points += points[i];
    matchState.players[i].score = 0;
  }

  const matchEnds = matchState.properRound === numberOfRounds - 1;
  matchState.properRound++;

  if (matchEnds) {
    matchState.result = matchResults(matchState.players);
  }
}

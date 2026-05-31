// Pure dice game helpers. Extracted from the old `@paima-dice/game-logic` package
// during migration; the round/match/tick *executor abstraction* was removed
// (see migration.md Step 3). The pure scoring/validation/points functions live
// here and are applied inline inside the STM transitions in state-machine.ts.
//
// Scoring is the original paima-engine-v1 "blackjack dice" model, ported
// faithfully from the v1 game-logic (`dice-logic.ts` / `tick.ts`):
//
//   * A player's turn AUTO-ROLLS two dice repeatedly while their accumulated
//     score is < 16 (the "initial" roll).
//   * Once the score is >= 16, each further move draws a SINGLE extra die; the
//     player decides per move (`rollAgain`) whether to draw it or pass.
//   * Bust if score > 21. A busting *choice* (rollAgain when the draw must push
//     the player over 21) is rejected by `isValidMove`; a busting *initial*
//     roll is accepted and simply ends the turn with a bust.
//   * Round scoring: anyone who hit exactly 21 gets 2 points; otherwise the
//     unique player closest to 21 without busting gets 1 point; ties (including
//     all-bust) award 0 to everyone.
//
// Rolls use the seeded `Prando` randomness generator so the STM stays
// deterministic / replayable.

import type { Prando } from "@effectstream/crypto";

// ---------------------------------------------------------------------------
// Types (formerly in @paima-dice/data-types/types.ts)
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
  score: number; // accumulated raw dice sum within the current round
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

// The score a player auto-rolls towards before they get a choice, and the
// blackjack bust limit. (v1 dice-logic.ts: `< 16` initial loop, `> 21` bust.)
export const STAND_THRESHOLD = 16;
export const BUST_LIMIT = 21;

// ---------------------------------------------------------------------------
// Dice primitives (ported from v1 dice-logic.ts)
// ---------------------------------------------------------------------------

/** Roll a single die (1-6). v1: `genDieRoll`. */
export function genDieRoll(randomnessGenerator: Prando): number {
  return randomnessGenerator.nextInt(1, 6);
}

/**
 * Clone a Prando at its CURRENT state. Prando is fully deterministic from its
 * seed plus the number of iterations consumed, so we recreate from the same
 * seed and replay that many steps.
 *
 * In v1 the move-validity check and the move resolution each used a fresh
 * `new Prando(prandoSeed)` (same starting point). Here the engine shares a
 * single per-block generator across inputs, so `isValidMove` (which must
 * simulate the would-be roll) forks the generator to peek at the next rolls
 * WITHOUT advancing the real one — `applyMove` then draws the identical
 * sequence. Keeps the STM deterministic / replayable.
 */
export function forkGenerator(randomnessGenerator: Prando): Prando {
  const fork = new (randomnessGenerator.constructor as new (
    seed: string | number,
  ) => Prando)(randomnessGenerator._seed);
  fork.skip(randomnessGenerator.iteration);
  return fork;
}

/**
 * The "initial" auto-roll: roll two dice repeatedly while the accumulated sum
 * is < STAND_THRESHOLD (16), returning the total drawn. v1: `genInitialDiceRolls`.
 *
 * The loop condition is checked BEFORE each pair, so the result ends as soon as
 * it reaches/exceeds 16.
 */
export function genInitialRollTotal(randomnessGenerator: Prando): number {
  let total = 0;
  while (total < STAND_THRESHOLD) {
    total += genDieRoll(randomnessGenerator) + genDieRoll(randomnessGenerator);
  }
  return total;
}

/**
 * Is the requested move valid? Ported from v1 `isValidMove`:
 *   * Passing (rollAgain = false) is always valid.
 *   * Rolling when score < 16 is valid only if the forced initial auto-roll
 *     would not bust (<= 21).
 *   * Rolling when score >= 16 is valid only if drawing one more die would not
 *     bust (score + die <= 21).
 *
 * NOTE: like v1, this consumes randomness from `randomnessGenerator`, so callers
 * must pass a generator they are happy to advance (the STM seeds a fresh one per
 * input, so this is deterministic and replayable).
 */
export function isValidMove(
  randomnessGenerator: Prando,
  matchState: MatchState,
  rollAgain: boolean,
): boolean {
  if (!rollAgain) return true;

  const score = getPlayerScore(matchState);
  if (score < STAND_THRESHOLD) {
    return genInitialRollTotal(randomnessGenerator) <= BUST_LIMIT;
  }
  return score + genDieRoll(randomnessGenerator) <= BUST_LIMIT;
}

/**
 * Points awarded for the round just finished. Ported verbatim from v1
 * `tick.ts` applyPoints rules:
 *   * Over 21 (bust) is treated as score -1.
 *   * If anyone scored exactly 21 → they get 2 points, everyone else 0.
 *   * Otherwise the unique maximum (closest to 21 without busting) gets 1
 *     point; a tie at the maximum awards 0 to everyone.
 * Returns one entry per player, in the same order as `players`.
 */
export function calculateRoundPoints(players: LobbyPlayer[]): number[] {
  // Replace going over 21 with -1 score (simplifies the comparison logic).
  const scores = players.map((p) => (p.score > BUST_LIMIT ? -1 : p.score));
  const someoneScored21 = scores.some((s) => s === BUST_LIMIT);

  if (someoneScored21) {
    return scores.map((s) => (s === BUST_LIMIT ? 2 : 0));
  }

  const max = Math.max(...scores);
  if (scores.filter((s) => s === max).length > 1) {
    return scores.map(() => 0);
  }
  return scores.map((s) => (s === max ? 1 : 0));
}

/**
 * Final match result per player. Player with the MOST points wins ('w'); a
 * shared maximum is a tie ('t') for those players; everyone else loses ('l').
 * Ported from v1 `matchResults`. Returns one entry per player, ordered the
 * same as `players`.
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

export function getPlayerScore(matchState: MatchState): number {
  const turnPlayer = getTurnPlayer(matchState);
  return turnPlayer ? turnPlayer.score : 0;
}

// ---------------------------------------------------------------------------
// Single-move resolution (replaces processTick / round_executor / match_executor)
// ---------------------------------------------------------------------------

/**
 * Apply one player's move to the match state, mutating it in place. This inlines
 * what the old v1 `processTick` + `applyEvent` did, without the event-stream /
 * tick-loop indirection.
 *
 * The roll generated depends on the turn player's CURRENT score (v1 `genDiceRolls`):
 *   * score < 16 → the "initial" auto-roll: roll two dice repeatedly until the
 *     accumulated round score reaches >= 16. This happens on the player's first
 *     move of the turn regardless of `rollAgain`.
 *   * score >= 16 → draw a single extra die.
 *
 * The drawn total is added to the player's `score`. Then (v1 `turnEnds`):
 *   * rollAgain = true  → the player keeps the turn (will move again).
 *   * rollAgain = false → the player's turn ends.
 *
 * When the last player (turn === NUM_PLAYERS - 1) ends their turn, the round
 * resolves: points are awarded (`calculateRoundPoints`), scores reset, and
 * `properRound` advances. If that was the final round, the match ends and
 * `result` is populated.
 *
 * A busting *choice* should already have been rejected upstream by
 * `isValidMove`; a busting initial roll is accepted here and simply ends the
 * turn with score > 21 (scored as a bust when points are awarded).
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

  // Generate and apply this move's roll (v1 genDiceRolls + roll TickEvent).
  const score = matchState.players[turnPlayerIndex].score;
  const drawn =
    score < STAND_THRESHOLD
      ? genInitialRollTotal(randomnessGenerator)
      : genDieRoll(randomnessGenerator);
  matchState.players[turnPlayerIndex].score += drawn;

  // The turn continues if the player chose to roll again (v1 `turnEnds`).
  if (rollAgain) return;

  // Pass: end this player's turn.
  const turnThatJustPassed = matchState.turn;
  matchState.turn = (matchState.turn + 1) % NUM_PLAYERS;

  // The round ends once the last player (turn === NUM_PLAYERS - 1) ends their
  // turn and the turn cycles back to 0 — i.e. all players have acted.
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

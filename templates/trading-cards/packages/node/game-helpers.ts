// Pure trading-card game helpers. Ported from the @paima v1 `@cards/game-logic`
// package during migration. The round/match/tick *executor abstraction* was
// removed (see migration.md Step 3); the pure scoring/draw/combat functions
// live here and are applied inline in the STM transitions in state-machine.ts.
//
// FAITHFUL SIMPLIFICATION of the v1 card game (documented deviations):
//   * The v1 game used a SHA-256 commit/reveal scheme (genCommitments /
//     checkCommitment) so a player could prove a revealed card was in their
//     committed deck without revealing the whole deck up front. We KEEP the
//     commitment *surface* — `starting_commitments` is stored per player and a
//     `play` move references a hand position — but we do NOT verify the
//     cryptographic reveal inline. The card-game flow (draw → play card onto
//     board → cards defeat opposing cards → HP damage → match end) is fully
//     preserved and real; only the zero-knowledge reveal check is elided.
//   * Cards are represented by their registry id (the "kind" of card). The v1
//     genCardDraw drew from a per-player deck of card-commitment indices; we
//     draw registry ids directly from the deck using the deterministic
//     randomGenerator, which keeps draws deterministic + replayable.

import type { Prando } from "@effectstream/crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LobbyState = "open" | "active" | "finished" | "closed";
export type ConciseResult = "w" | "t" | "l";
export type MatchResult = ConciseResult[];

// A single player's in-match state.
export interface LobbyPlayer {
  nftId: number;
  hitPoints: number;
  // card-registry ids still in the deck (drawn from on each turn)
  currentDeck: number[];
  // card-registry ids in hand (drawn, not yet played)
  currentHand: number[];
  // card-registry ids on the board (played, can attack)
  currentBoard: number[];
  currentDraw: number;
  currentResult: ConciseResult | undefined;
  turn: number | undefined;
}

// Mutable match state evolved as moves are applied.
export interface MatchState {
  players: LobbyPlayer[];
  properRound: number; // user-facing round number (0-indexed)
  turn: number; // whose turn it currently is (0 or 1)
  result: MatchResult | undefined; // set once the match ends
}

// A parsed move.
export type Move =
  | { kind: "end" }
  | { kind: "play"; handPosition: number; registryId: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// TODO: variable number of players. The card game is currently 2-player.
export const NUM_PLAYERS = 2;

// Practice bot NFT id (used by practiceMoves auto-play).
export const PRACTICE_BOT_NFT_ID = 0;

export const DECK_LENGTH = 10;
export const PACK_LENGTH = 5;
export const INITIAL_HIT_POINTS = 4;
// Cards drawn at the very start of the match, and per subsequent turn.
export const OPENING_DRAW = 3;
export const TURN_DRAW = 1;

// The card registry. `defeats` is the registry id this card beats on the
// board (rock-paper-scissors style). Mirrors the v1 CARD_REGISTRY.
export const CARD_REGISTRY: Record<number, { defeats: number }> = {
  0: { defeats: 1 },
  1: { defeats: 2 },
  2: { defeats: 0 },
};
export const CARD_IDS = Object.keys(CARD_REGISTRY).map((k) => Number.parseInt(k, 10));

// ---------------------------------------------------------------------------
// Move (de)serialization. Moves are plain "+"-delimited strings so they can
// travel through the grammar as a single token and be stored in round_move.
// ---------------------------------------------------------------------------

const DELIM = "+";

export function serializeMove(move: Move): string {
  if (move.kind === "play") {
    return ["play", String(move.handPosition), String(move.registryId)].join(DELIM);
  }
  return "end";
}

export function deserializeMove(serialized: string): Move | undefined {
  const parts = serialized.split(DELIM);
  if (parts[0] === "end") return { kind: "end" };
  if (parts[0] === "play") {
    const handPosition = Number.parseInt(parts[1], 10);
    const registryId = Number.parseInt(parts[2], 10);
    if (Number.isNaN(handPosition) || Number.isNaN(registryId)) return undefined;
    return { kind: "play", handPosition, registryId };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Deck / pack generation (deterministic via Prando)
// ---------------------------------------------------------------------------

export function genExistingCardId(randomnessGenerator: Prando): number {
  return CARD_IDS[randomnessGenerator.nextInt(0, CARD_IDS.length - 1)];
}

// A fresh starting deck: DECK_LENGTH random registry ids.
export function genStartingDeck(randomnessGenerator: Prando): number[] {
  return Array.from({ length: DECK_LENGTH }, () => genExistingCardId(randomnessGenerator));
}

// A card pack: PACK_LENGTH random registry ids.
export function genCardPack(randomnessGenerator: Prando): number[] {
  return Array.from({ length: PACK_LENGTH }, () => genExistingCardId(randomnessGenerator));
}

// ---------------------------------------------------------------------------
// Match helpers
// ---------------------------------------------------------------------------

export function getTurnPlayer(matchState: MatchState): LobbyPlayer | undefined {
  return matchState.players.find((p) => p.turn === matchState.turn);
}

export function getNonTurnPlayer(matchState: MatchState): LobbyPlayer | undefined {
  return matchState.players.find((p) => p.turn !== matchState.turn);
}

// Validation hook (kept so callers express intent; always true today).
export function isValidMove(_matchState: MatchState, _move: Move): boolean {
  return true;
}

// Final match result per player: a player at <= 0 HP loses ('l'); a player with
// HP remaining wins ('w'); if both reach 0 simultaneously it's a tie ('t').
export function matchResults(players: LobbyPlayer[]): MatchResult {
  const alive = players.map((p) => p.hitPoints > 0);
  const aliveCount = alive.filter(Boolean).length;
  if (aliveCount === 0) return players.map(() => "t");
  return alive.map((isAlive) => (isAlive ? "w" : "l"));
}

// Draw `count` cards from the turn player's deck into their hand. If the deck is
// empty the player takes 1 point of fatigue damage per missed draw.
function drawCards(player: LobbyPlayer, count: number): void {
  for (let i = 0; i < count; i++) {
    if (player.currentDeck.length === 0) {
      player.hitPoints -= 1;
      continue;
    }
    const card = player.currentDeck.shift()!;
    player.currentHand.push(card);
    player.currentDraw += 1;
  }
}

// ---------------------------------------------------------------------------
// Single-move resolution (replaces processTick / round_executor / match_executor)
// ---------------------------------------------------------------------------

/**
 * Apply one player's move to the match state, mutating it in place.
 *
 * Turn flow (mirrors the v1 tick.ts intent, simplified + inlined):
 *   - At the very start of a player's turn (their first time acting in a
 *     properRound, signalled by an empty board+hand on opening, or after an
 *     "end" by the previous player) the player draws cards.
 *   - "play" move: move the card at `handPosition` from hand onto the board.
 *     If a matching card kind sits on the opponent's board that this card
 *     "defeats", that opposing card is destroyed.
 *   - "end" move: each card on the turn player's board deals 1 damage to the
 *     opponent (after the player has had at least one full turn), then the turn
 *     passes to the other player. A round ends when the last player ends their
 *     turn; the match ends as soon as any player hits <= 0 HP.
 *
 * Returns true if this move ENDED the player's turn (an "end" move).
 */
export function applyMove(
  matchState: MatchState,
  move: Move,
  numberOfRounds: number,
  _randomnessGenerator: Prando,
): boolean {
  const turnPlayer = getTurnPlayer(matchState);
  const nonTurnPlayer = getNonTurnPlayer(matchState);
  if (!turnPlayer || !nonTurnPlayer) return false;

  if (move.kind === "play") {
    // Reveal a card from hand onto the board.
    const handIdx = move.handPosition;
    if (handIdx < 0 || handIdx >= turnPlayer.currentHand.length) {
      // Invalid hand position — no-op (turn stays).
      return false;
    }
    const registryId = turnPlayer.currentHand[handIdx];
    // Remove from hand, add to board.
    turnPlayer.currentHand.splice(handIdx, 1);
    turnPlayer.currentBoard.push(registryId);

    // Combat: if this card defeats a card on the opponent's board, destroy it.
    const def = CARD_REGISTRY[registryId];
    if (def != null) {
      const targetIdx = nonTurnPlayer.currentBoard.findIndex((c) => c === def.defeats);
      if (targetIdx !== -1) {
        nonTurnPlayer.currentBoard.splice(targetIdx, 1);
      }
    }
    return false;
  }

  // move.kind === "end"
  // Deal damage: each card on the turn player's board hits the opponent for 1,
  // but not on the very first turn of the match (properRound 0, first player).
  const isFirstActionOfMatch =
    matchState.properRound === 0 && (turnPlayer.turn ?? 0) === 0 && matchState.turn === 0;
  if (!isFirstActionOfMatch) {
    nonTurnPlayer.hitPoints -= turnPlayer.currentBoard.length;
  }

  const turnThatJustEnded = matchState.turn;
  matchState.turn = (matchState.turn + 1) % NUM_PLAYERS;

  // The round ends once the last player ends their turn and the turn cycles
  // back to 0.
  const roundEnds = turnThatJustEnded === NUM_PLAYERS - 1 && matchState.turn === 0;

  // The new turn player draws at the start of their turn.
  const newTurnPlayer = getTurnPlayer(matchState);
  if (newTurnPlayer) {
    const isOpening = matchState.properRound === 0 && newTurnPlayer.currentDraw === 0;
    drawCards(newTurnPlayer, isOpening ? OPENING_DRAW : TURN_DRAW);
  }

  if (roundEnds) {
    matchState.properRound += 1;
  }

  // Match ends if any player is down, or we've played out the configured rounds.
  const someoneDead = matchState.players.some((p) => p.hitPoints <= 0);
  const roundsExhausted = matchState.properRound >= numberOfRounds;
  if (someoneDead || roundsExhausted) {
    matchState.result = matchResults(matchState.players);
  }

  return true;
}

// A simple practice bot: play the first card in hand if any, else end turn.
export function genBotMove(matchState: MatchState): Move {
  const player = getTurnPlayer(matchState);
  if (player && player.currentHand.length > 0) {
    return { kind: "play", handPosition: 0, registryId: player.currentHand[0] };
  }
  return { kind: "end" };
}

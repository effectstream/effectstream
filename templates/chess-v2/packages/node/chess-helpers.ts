import type { Color } from "chess.js";
import { Chess } from "chess.js";

export type Timer = {
  player_one_blocks_left: number;
  player_two_blocks_left: number;
};

export type MatchEnvironment = {
  user1: { wallet: string; color: Color };
  user2: { wallet: string; color: Color };
};

export type ConciseResult = "w" | "l" | "t";
export type ExpandedResult = "win" | "loss" | "tie";

export function gameOver(fenBoard: string): boolean {
  const chess = new Chess();
  chess.load(fenBoard);
  return chess.isGameOver();
}

export function didPlayerWin(
  playerColor: Color,
  fen: string,
  opponentTimeLeft: number,
): boolean {
  const chess = new Chess();
  chess.load(fen);
  const isProperWin = chess.isCheckmate() && chess.turn() !== playerColor;
  const isTimeoutWin = !chess.isDraw() && opponentTimeLeft <= 0;
  return isProperWin || isTimeoutWin;
}

export function matchResults(
  fenBoard: string,
  matchEnvironment: MatchEnvironment,
  blocksLeft: Timer,
): [ConciseResult, ConciseResult] {
  const user1won = didPlayerWin(
    matchEnvironment.user1.color,
    fenBoard,
    blocksLeft.player_two_blocks_left,
  );
  if (user1won) return ["w", "l"];

  const user2won = didPlayerWin(
    matchEnvironment.user2.color,
    fenBoard,
    blocksLeft.player_one_blocks_left,
  );
  if (user2won) return ["l", "w"];

  return ["t", "t"];
}

export function isValidMove(fenBoard: string, move: string): boolean {
  const chess = new Chess();
  chess.load(fenBoard);
  try {
    chess.move(move);
    return true;
  } catch {
    return false;
  }
}

export function applyMove(fenBoard: string, move: string): string {
  const chess = new Chess();
  chess.load(fenBoard);
  chess.move(move);
  return chess.fen();
}

export function initialState(): string {
  return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
}

export function extractMatchEnvironment(lobby: {
  lobby_creator: string;
  player_two: string | null;
  player_one_iswhite: boolean;
}): MatchEnvironment {
  return {
    user1: {
      wallet: lobby.lobby_creator,
      color: lobby.player_one_iswhite ? "w" : "b",
    },
    user2: {
      wallet: lobby.player_two!,
      color: lobby.player_one_iswhite ? "b" : "w",
    },
  };
}

export function updateTimer(
  round: { player_one_blocks_left: number; player_two_blocks_left: number; starting_block_height: number; round_within_match: number },
  blockHeight: number,
  playerOneStarts: boolean,
): Timer {
  const elapsedBlocks = blockHeight - round.starting_block_height;
  const playerOneTurn = isPlayerOneTurn(round.round_within_match, playerOneStarts);
  return {
    player_one_blocks_left: Math.max(round.player_one_blocks_left - (playerOneTurn ? elapsedBlocks : 0), 0),
    player_two_blocks_left: Math.max(round.player_two_blocks_left - (playerOneTurn ? 0 : elapsedBlocks), 0),
  };
}

export function isPlayerOneTurn(round: number, playerOneStarts: boolean): boolean {
  return (round % 2 === 1 && playerOneStarts) || (round % 2 === 0 && !playerOneStarts);
}

export function currentPlayer(round: number, lobby: { lobby_creator: string; player_two: string | null; player_one_iswhite: boolean }): string {
  if (!lobby.player_two) return lobby.lobby_creator;
  return isPlayerOneTurn(round, lobby.player_one_iswhite) ? lobby.lobby_creator : lobby.player_two;
}

const K_FACTOR = 32;
export function calculateRatingChange(
  playerRating: number,
  opponentRating: number,
  result: ConciseResult,
  kFactor = K_FACTOR,
): number {
  const resultScore = result === "w" ? 1 : result === "l" ? 0 : 0.5;
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(kFactor * (resultScore - expectedScore));
}

export function expandResult(result: ConciseResult): ExpandedResult {
  if (result === "w") return "win";
  if (result === "l") return "loss";
  return "tie";
}

import type { Prando } from "@effectstream/crypto";
import type { MatchEnvironment, MatchMove, MatchState } from "./types.ts";
import type {
  ConciseResult,
  MatchResult,
  Timer,
  UserLobby,
} from "@chess/utils";
import type { Color } from "chess.js";
import { Chess } from "chess.js";
import type { WalletAddress } from "@effectstream/utils";

export function gameOverFromChess(chess: Chess): boolean {
  return chess.isGameOver();
}

export function gameOver(fenBoard: string): boolean {
  const chess = new Chess();
  chess.load(fenBoard);
  return gameOverFromChess(chess);
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
  if (isProperWin || isTimeoutWin) {
    return true;
  }

  return false;
}

export function isPlayersTurn(player: WalletAddress, lobby: UserLobby) {
  const chess = new Chess();
  chess.load(lobby.latest_match_state);

  const isCreator = lobby.lobby_creator === player;
  const playerColor = isCreator === lobby.player_one_iswhite ? "w" : "b";
  return chess.turn() === playerColor;
}

export function matchResults(
  matchState: MatchState,
  matchEnvironment: MatchEnvironment,
  blocksLeft: Timer,
): MatchResult {
  const user1Color = matchEnvironment.user1.color;
  const user2Color = matchEnvironment.user2.color;

  const user1won = didPlayerWin(
    user1Color,
    matchState.fenBoard,
    blocksLeft.player_two_blocks_left,
  );
  if (user1won) {
    console.log(`${matchEnvironment.user1.wallet} won match.`);
    return ["w", "l"] as unknown as MatchResult;
  }

  const user2won = didPlayerWin(
    user2Color,
    matchState.fenBoard,
    blocksLeft.player_one_blocks_left,
  );
  if (user2won) {
    console.log(`${matchEnvironment.user2.wallet} won match.`);
    return ["l", "w"] as unknown as MatchResult;
  }

  console.log(`Match ended in a draw.`);
  return ["t", "t"] as unknown as MatchResult;
}

// Updates the fenBoard string by applying a new move
export function updateBoard(fenBoard: string, move: string): string {
  const chess = new Chess();
  chess.load(fenBoard);
  chess.move(move);
  return chess.fen();
}

// Verifies if a provided move is valid on the current fenBoard
export function isValidMove(fenBoard: string, move: string): boolean {
  const chess = new Chess();
  chess.load(fenBoard);
  try {
    chess.move(move);
    return true;
  } catch (_) {
    return false;
  }
}

export function generateRandomMove(
  positions: string,
  randomnessGenerator: Prando,
): MatchMove {
  const chess = new Chess();
  chess.load(positions);
  const possibleMoves = chess.moves();
  return possibleMoves[randomnessGenerator.next(0, possibleMoves.length)];
}

// K-factor determines the sensitivity of rating changes
const K_FACTOR = 32;
export const calculateRatingChange = (
  playerRating: number,
  opponentRating: number,
  result: ConciseResult,
  kFactor = K_FACTOR,
): number => {
  // Result options: 1 for win, 0 for loss, 0.5 for draw
  const resultScore = result === "w" ? 1 : result === "l" ? 0 : 0.5;
  const expectedScore = calculateExpectedScore(playerRating, opponentRating);
  const ratingChange = kFactor * (resultScore - expectedScore);
  return Math.round(ratingChange);
};

const calculateExpectedScore = (
  playerRating: number,
  opponentRating: number,
): number => {
  const exponent = (opponentRating - playerRating) / 400;
  const expectedScore = 1 / (1 + Math.pow(10, exponent));
  return expectedScore;
};

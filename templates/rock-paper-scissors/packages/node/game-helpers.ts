// Pure Rock-Paper-Scissors game helpers. Extracted from the old
// `@rock-paper-scissors/game-logic` package during migration; the
// round/match/tick *executor abstraction* (tick.ts / processTick) was removed
// (see migration.md Step 3). Only the pure RPS engine + its types remain here,
// and the round resolution is applied inline inside the STM transitions in
// state-machine.ts.

import type { Prando } from "@effectstream/crypto";

// ---------------------------------------------------------------------------
// Types (formerly in @rock-paper-scissors/game-logic/types.ts)
// ---------------------------------------------------------------------------

export enum RPSActions {
  ROCK = "R",
  PAPER = "P",
  SCISSORS = "S",
}

export enum RPSExtendedStates {
  DID_NOT_PLAY = "-",
  PENDING = "*",
}

export type RPSActionsStates = RPSActions | RPSExtendedStates;

// The compact game representation, e.g. "RP-S**".
export type RPSSummary = string;

export enum GameResult {
  WIN = "win",
  TIE = "tie",
  LOSS = "loss",
}

// [player1Result, player2Result]
export type MatchResult = [GameResult, GameResult];

// Lobby states (mirrors the lobby_status enum in the database).
export type LobbyState = "open" | "active" | "finished" | "closed";

// ---------------------------------------------------------------------------
// RPS engine
// ---------------------------------------------------------------------------

/*
 *  RockPaperScissors is a game that is played in rounds.
 *  Each round a user submits a ROCK PAPER or SCISSORS.
 *  The winner of a round is decided in a standard rock-paper-scissors game.
 *
 *  The winner of the game is whoever won more rounds; there can be ties.
 *
 *  The game allows a special "DID_NOT_PLAY" action — if a player does not play
 *  they always lose. If both players "DID_NOT_PLAY" the round is a tie.
 *
 *  Format: String of {R,S,P,'-','*'} in pairs representing the game.
 *          R ROCK
 *          P PAPER
 *          S SCISSORS
 *          - DID_NOT_PLAY
 *          * PENDING
 *
 *   Round   1   2   3   4
 *   Player  1 2 1 2 1 2 1 2
 *   Index   0 1 2 3 4 5 6 7
 *   ------------------------
 *   Example R S - S - - x S
 *   Winner   P1  P2   T   *
 */
export class RockPaperScissors {
  /*
    Init RockPaperScissors with a game state.
    Use buildInitialState(...) for a new game.
    @param state: A valid initial state is required, e.g., SP-R****
    */
  constructor(public state: RPSSummary) {
    if (!this.state) {
      throw new Error(
        'Initial state is required. Please build with "buildInitialState"',
      );
    }
    this.updateInternalState();
  }

  private rounds = 0;
  private player1Wins = 0;
  private player2Wins = 0;
  private ties = 0;
  private isGameOver = false;

  private static readonly Tie: MatchResult = [GameResult.TIE, GameResult.TIE];
  private static readonly FirstWin: MatchResult = [
    GameResult.WIN,
    GameResult.LOSS,
  ];
  private static readonly SecondWin: MatchResult = [
    GameResult.LOSS,
    GameResult.WIN,
  ];

  /* Internal function: update game state after inputs are updated */
  private updateInternalState() {
    this.player1Wins = 0;
    this.player2Wins = 0;
    this.ties = 0;

    const state = this.getState();

    if (state.length % 2 !== 0) {
      throw new Error("State must be an even number");
    }

    // State has two chars per round.
    this.rounds = state.length / 2;

    for (let round = 1; round <= this.rounds; round += 1) {
      const firstPlayerIndex = this.playerIndex(true, round);
      const secondPlayerIndex = this.playerIndex(false, round);

      // When the first pending is found, no more rounds have been played.
      if (state[firstPlayerIndex] === RPSExtendedStates.PENDING) break;
      if (state[secondPlayerIndex] === RPSExtendedStates.PENDING) break;

      const matchResult = this.match(
        state[firstPlayerIndex],
        state[secondPlayerIndex],
      );

      if (matchResult[0] === GameResult.WIN) {
        this.player1Wins += 1;
      } else if (matchResult[1] === GameResult.WIN) {
        this.player2Wins += 1;
      } else {
        this.ties += 1;
      }
    }

    // Game ends early if a player wins floor(half of non-tie rounds) + 1.
    // E.g., 10 Rounds, 4 Ties. If player has 4 wins it ends.
    //        7 Rounds, 2 Ties. If player has 3 wins it ends.
    const gameRounds = this.rounds - this.ties;

    const noMoreRounds = gameRounds - (this.player1Wins + this.player2Wins) === 0;
    const p1Wins = this.player1Wins > Math.floor(gameRounds / 2);
    const p2Wins = this.player2Wins > Math.floor(gameRounds / 2);

    this.isGameOver = noMoreRounds || p1Wins || p2Wins;
  }

  /* General RockPaperScissors rules + DID_NOT_PLAY */
  private match(
    firstAction: RPSActionsStates,
    secondAction: RPSActionsStates,
  ): MatchResult {
    if (firstAction === secondAction) return RockPaperScissors.Tie;

    if (firstAction === RPSExtendedStates.DID_NOT_PLAY) {
      return RockPaperScissors.SecondWin;
    }
    if (secondAction === RPSExtendedStates.DID_NOT_PLAY) {
      return RockPaperScissors.FirstWin;
    }

    if (firstAction === RPSActions.ROCK && secondAction === RPSActions.SCISSORS) {
      return RockPaperScissors.FirstWin;
    }
    if (firstAction === RPSActions.ROCK && secondAction === RPSActions.PAPER) {
      return RockPaperScissors.SecondWin;
    }
    if (firstAction === RPSActions.PAPER && secondAction === RPSActions.SCISSORS) {
      return RockPaperScissors.SecondWin;
    }
    if (firstAction === RPSActions.PAPER && secondAction === RPSActions.ROCK) {
      return RockPaperScissors.FirstWin;
    }
    if (firstAction === RPSActions.SCISSORS && secondAction === RPSActions.ROCK) {
      return RockPaperScissors.SecondWin;
    }
    if (firstAction === RPSActions.SCISSORS && secondAction === RPSActions.PAPER) {
      return RockPaperScissors.FirstWin;
    }

    throw new Error("Unknown RPS state");
  }

  /* Get current state as an array of game actions */
  private getState(): RPSActionsStates[] {
    return (this.state as any).split("");
  }

  /* Update game state with a move */
  private updateState(userMove: RPSActionsStates, index: number) {
    const state = this.getState();
    state[index] = userMove;
    this.state = state.join("");

    this.updateInternalState();
  }

  /* Get target index for a player and round, usable with this.state[index] */
  private playerIndex(isFirstPlayer: boolean, round: number) {
    if (round < 1) throw new Error("Rounds start from one");
    return (round - 1) * 2 + (isFirstPlayer ? 0 : 1);
  }

  /* Return an empty game for N rounds */
  public static buildInitialState(rounds: number): RPSSummary {
    return new Array(2 * rounds).fill(RPSExtendedStates.PENDING).join("");
  }

  /* If players' actions are still PENDING, change to DID_NOT_PLAY */
  public endRound(round: number) {
    const player1Index = this.playerIndex(true, round);
    const player2Index = this.playerIndex(false, round);
    const state = this.getState();

    if (state[player1Index] === RPSExtendedStates.PENDING) {
      this.updateState(RPSExtendedStates.DID_NOT_PLAY, player1Index);
    }

    if (state[player2Index] === RPSExtendedStates.PENDING) {
      this.updateState(RPSExtendedStates.DID_NOT_PLAY, player2Index);
    }
  }

  /* Check if round is over */
  public didRoundEnd(round: number): boolean {
    const player1Index = this.playerIndex(true, round);
    const player2Index = this.playerIndex(false, round);
    const state = this.getState();

    if (
      state[player1Index] === RPSExtendedStates.PENDING ||
      state[player2Index] === RPSExtendedStates.PENDING
    ) {
      return false;
    }

    return true;
  }

  /* Return round winner */
  public roundWinner(round: number): MatchResult {
    if (!this.didRoundEnd(round)) {
      throw new Error("Round is not ready");
    }

    const player1Index = this.playerIndex(true, round);
    const player2Index = this.playerIndex(false, round);
    const state = this.getState();
    return this.match(state[player1Index], state[player2Index]);
  }

  /* True if game finished. No more changes are allowed */
  public didGameEnd() {
    return this.isGameOver;
  }

  /* Check if next input is valid for current game */
  public isValidMove(
    isFirstPlayer: boolean,
    userMove: RPSActions,
    round: number,
  ): boolean {
    const state = this.getState();

    if (
      userMove !== RPSActions.PAPER &&
      userMove !== RPSActions.ROCK &&
      userMove !== RPSActions.SCISSORS &&
      (userMove as any) !== RPSExtendedStates.DID_NOT_PLAY
    ) {
      return false;
    }

    if (this.didGameEnd()) return false;

    if (round < 1) return false;

    if (round > state.length / 2) return false;

    // We can only play in the latest round; validate no pending moves before.
    const pendingStates = state
      .slice(0, (round - 1) * 2)
      .filter((s) => s === RPSExtendedStates.PENDING);
    if (pendingStates.length) return false;

    const index = this.playerIndex(isFirstPlayer, round);
    if (state[index] !== RPSExtendedStates.PENDING) return false;

    return true;
  }

  /* Set next move */
  public inputMove(isFirstPlayer: boolean, userMove: RPSActions, round: number) {
    this.updateState(userMove, this.playerIndex(isFirstPlayer, round));
  }

  /* Get final game winner and loser */
  public endGameResults(): MatchResult {
    if (!this.isGameOver) {
      throw new Error("Game has not ended");
    }

    if (this.player1Wins === this.player2Wins) return RockPaperScissors.Tie;
    return this.player1Wins > this.player2Wins
      ? RockPaperScissors.FirstWin
      : RockPaperScissors.SecondWin;
  }

  /* Generate a random move (used by the practice bot / zombie filler) */
  public generateRandomMove(random: Prando): RPSActions {
    switch (random.nextInt(0, 2)) {
      case 0:
        return RPSActions.ROCK;
      case 1:
        return RPSActions.PAPER;
      default: // case 2:
        return RPSActions.SCISSORS;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers shared by the STM transitions
// ---------------------------------------------------------------------------

// Convert a single GameResult into the concise database stat code.
export function toConciseResult(result: GameResult): "w" | "t" | "l" {
  if (result === GameResult.WIN) return "w";
  if (result === GameResult.TIE) return "t";
  return "l";
}

// Convert a single GameResult into the match_result enum value.
export function toMatchResult(result: GameResult): "win" | "tie" | "loss" {
  if (result === GameResult.WIN) return "win";
  if (result === GameResult.TIE) return "tie";
  return "loss";
}

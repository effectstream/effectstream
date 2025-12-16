import type { MatchResult, RPSActionsStates, RPSSummary } from './types';
import { GameResult, RPSActions, RPSExtendedStates } from './types';
import type Prando from '@paima/sdk/prando';

/*
 *  RockPaperScissors is a game that is played in rounds.
 *  Each round a user submits a ROCK PAPER or SCISSORS.
 *  The winner of a round is decided in a standard rock-paper-scissors game
 *
 *  The winner the game is who won more rounds, there can be ties.
 *
 *  The game allows a special "DID_NOT_PLAY" action so if a player does not play - always looses.
 *  If both players "DID_NOT_PLAY" then the round is a tie.
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
 *
 */
export class RockPaperScissors {
  /* 
    Init RockPaperScissor with a game state.
    Use buildInitialState(...) for a new game. 
    @param state: A valid initial state is required, e.g., SP-R**** 
    */
  constructor(public state: RPSSummary) {
    if (!this.state) {
      throw new Error('Initial state is required. Please build with "buildInitialState¨');
    }
    this.updateInternalState();
  }

  private rounds = 0;
  private player1Wins = 0;
  private player2Wins = 0;
  private ties = 0;
  private isGameOver = false;

  private static readonly Tie: MatchResult = [GameResult.TIE, GameResult.TIE];
  private static readonly FirstWin: MatchResult = [GameResult.WIN, GameResult.LOSS];
  private static readonly SecondWin: MatchResult = [GameResult.LOSS, GameResult.WIN];

  /* Internal function: update game state after inputs are updated */
  private updateInternalState() {
    this.player1Wins = 0;
    this.player2Wins = 0;
    this.ties = 0;

    const state = this.getState();

    if (state.length % 2 !== 0) {
      throw new Error('State must be a even number');
    }

    // State has two chars per round.
    this.rounds = state.length / 2;

    for (let round = 1; round <= this.rounds; round += 1) {
      const firstPlayerIndex = this.playerIndex(true, round);
      const secondPlayerIndex = this.playerIndex(false, round);

      // When the first pending is found, no more rounds have been played.
      // e.g.,  RP-S**
      // Round 1 Rock,    Paper
      // Round 2 Pending, Scissor
      // Round 3 Pending, Penidng
      if (state[firstPlayerIndex] === RPSExtendedStates.PENDING) break;
      if (state[secondPlayerIndex] === RPSExtendedStates.PENDING) break;

      const matchResult = this.match(state[firstPlayerIndex], state[secondPlayerIndex]);

      if (matchResult[0] === GameResult.WIN) {
        this.player1Wins += 1;
      } else if (matchResult[1] === GameResult.WIN) {
        this.player2Wins += 1;
      } else {
        this.ties += 1;
      }
    }

    // Game ends early if player wins floor(half of non-tie rounds) + 1
    // E.g., 10 Rounds, 4 Ties. If player has 4 wins ends.
    //        7 Rounds, 2 Ties. If player has 3 wins ends.
    const gameRounds = this.rounds - this.ties;

    const noMoreRounds = gameRounds - (this.player1Wins + this.player2Wins) === 0;
    const p1Wins = this.player1Wins > Math.floor(gameRounds / 2);
    const p2Wins = this.player2Wins > Math.floor(gameRounds / 2);

    this.isGameOver = noMoreRounds || p1Wins || p2Wins;

    this.logger(
      `State: ${this.state} isGameOver:${this.isGameOver} Player1Wins:${this.player1Wins} Player2Wins:${this.player2Wins} Ties:${this.ties}`
    );
  }

  /* General RockPaperScissors rules + DID_NOT_PLAY */
  private match(firstAction: RPSActionsStates, secondAction: RPSActionsStates): MatchResult {
    if (firstAction === secondAction) return RockPaperScissors.Tie;

    if (firstAction === RPSExtendedStates.DID_NOT_PLAY) return RockPaperScissors.SecondWin;
    if (secondAction === RPSExtendedStates.DID_NOT_PLAY) return RockPaperScissors.FirstWin;

    if (firstAction === RPSActions.ROCK && secondAction === RPSActions.SCISSORS)
      return RockPaperScissors.FirstWin;
    if (firstAction === RPSActions.ROCK && secondAction === RPSActions.PAPER)
      return RockPaperScissors.SecondWin;
    if (firstAction === RPSActions.PAPER && secondAction === RPSActions.SCISSORS)
      return RockPaperScissors.SecondWin;
    if (firstAction === RPSActions.PAPER && secondAction === RPSActions.ROCK)
      return RockPaperScissors.FirstWin;
    if (firstAction === RPSActions.SCISSORS && secondAction === RPSActions.ROCK)
      return RockPaperScissors.SecondWin;
    if (firstAction === RPSActions.SCISSORS && secondAction === RPSActions.PAPER)
      return RockPaperScissors.FirstWin;

    throw new Error('Unknown RPS state');
  }

  /* Simple standard output logger */
  private logger(message: string) {
    console.log('[RPS-engine] ', message);
  }

  /* Get current state as an array of game actions */
  private getState(): RPSActionsStates[] {
    return (this.state as any).split('');
  }

  /* Update game state with a move */
  private updateState(userMove: RPSActionsStates, index: number) {
    const state = this.getState();
    state[index] = userMove;
    this.state = state.join('');

    this.updateInternalState();
  }

  /* Get target index for a player and round, usable with this.state[index] */
  private playerIndex(isFirstPlayer: boolean, round: number) {
    if (round < 1) throw new Error('Rounds start from zero');
    return (round - 1) * 2 + (isFirstPlayer ? 0 : 1);
  }

  /* Return an empty game for N rounds */
  public static buildInitialState(rounds: number): RPSSummary {
    return new Array(2 * rounds).fill(RPSExtendedStates.PENDING).join('');
  }

  /* If players actions are still PENDING, change to DID_NOT_PLAY */
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
      throw new Error('Round is not ready');
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
  public isValidMove(isFirstPlayer: boolean, userMove: RPSActions, round: number): boolean {
    const state = this.getState();

    if (
      userMove !== RPSActions.PAPER &&
      userMove !== RPSActions.ROCK &&
      userMove !== RPSActions.SCISSORS &&
      userMove !== RPSExtendedStates.DID_NOT_PLAY
    ) {
      this.logger('INVALID-MOVE: Invalid actions');
      return false;
    }

    if (this.didGameEnd()) {
      this.logger('INVALID-MOVE: Game ended');
      return false;
    }

    // state e.g., "RPS-P"
    if (round < 1) {
      this.logger('INVALID-MOVE: Round must be non-zero positive');
      return false;
    }

    if (round > state.length / 2) {
      this.logger('INVALID-MOVE: Round must less than ' + state.length / 2);
      return false;
    }

    // We can only play in the latest round.
    // Validate no pending moves before.
    const pendingStates = state
      .slice(0, (round - 1) * 2)
      .filter(s => s === RPSExtendedStates.PENDING);
    if (pendingStates.length) {
      this.logger('INVALID-MOVE: Cannot play future rounds.');
      return false;
    }

    const index = this.playerIndex(isFirstPlayer, round);
    if (state[index] !== RPSExtendedStates.PENDING) {
      this.logger('INVALID-MOVE: Player has played this round before');
      return false;
    }

    return true;
  }

  /* Set next move  */
  public inputMove(isFirstPlayer: boolean, userMove: RPSActions, round: number) {
    this.updateState(userMove, this.playerIndex(isFirstPlayer, round));
  }

  /* Get final game winner and loser */
  public endGameResults(): MatchResult {
    if (!this.isGameOver) {
      throw new Error('Game has not ended');
    }

    if (this.player1Wins === this.player2Wins) return RockPaperScissors.Tie;
    return this.player1Wins > this.player2Wins
      ? RockPaperScissors.FirstWin
      : RockPaperScissors.SecondWin;
  }

  public genrateRandomMove(random: Prando) {
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

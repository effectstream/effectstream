import type { IGetLobbyPlayersResult, IGetLobbyByIdResult } from '@dice/db';
import {
  type MatchState,
  type LobbyPlayer,
  type ConciseResult,
  type MatchResult,
} from '@dice/data-types/types';
import type { Prando } from '@paimaexample/crypto';

// Helper type for lobby with state properties
type LobbyStateProps = 'current_match' | 'current_round' | 'current_turn' | 'current_proper_round';
export type LobbyWithStateProps = Omit<IGetLobbyByIdResult, LobbyStateProps> &
  Required<Pick<IGetLobbyByIdResult, LobbyStateProps>>;

/**
 * Roll a single die (1-6)
 */
export function genDieRoll(randomnessGenerator: Prando): number {
  return randomnessGenerator.nextInt(1, 6);
}

/**
 * Roll two dice for a single move
 * Returns the two dice values
 */
export function genTwoDiceRoll(randomnessGenerator: Prando): [number, number] {
  return [
    genDieRoll(randomnessGenerator),
    genDieRoll(randomnessGenerator)
  ];
}

/**
 * Calculate final score for a player
 * Score = abs(21 - sum of all rolls)
 * Lower score is better
 */
export function calculateFinalScore(totalRolled: number): number {
  return Math.abs(21 - totalRolled);
}

/**
 * Check if a move is valid
 * Players can always roll if they haven't passed
 * Players can always pass
 */
export function isValidMove(
  matchState: MatchState,
  rollAgain: boolean
): boolean {
  // Pass is always valid
  if (!rollAgain) return true;

  // Rolling is always valid (player chooses when to stop)
  return true;
}

/**
 * Determine match results based on accumulated points
 * Player with LOWEST total points wins
 * Ties result in 't' for all tied players
 */
export function matchResults(matchState: MatchState): MatchResult {
  const minPoints = matchState.players.reduce((acc, next) => Math.min(acc, next.points), Infinity);
  const minPlayers = matchState.players.filter(player => player.points === minPoints);

  const results: ConciseResult[] = matchState.players.map(player => {
    if (player.points > minPoints) return 'l';
    if (minPlayers.length > 1) return 't';
    return 'w';
  });

  return results;
}

/**
 * Calculate points for the round based on final scores
 * Player with lower score gets 1 point
 * If tied, both get 0 points
 */
export function calculateRoundPoints(players: LobbyPlayer[]): number[] {
  // Calculate final score for each player: abs(21 - totalRolled)
  const scores = players.map(player => calculateFinalScore(player.score));
  const minScore = Math.min(...scores);

  // Count how many players have the minimum score
  const winnersCount = scores.filter(score => score === minScore).length;

  // If tied, everyone gets 0 points
  if (winnersCount > 1) {
    return scores.map(() => 0);
  }

  // Otherwise, player with lowest score gets 1 point
  return scores.map(score => score === minScore ? 1 : 0);
}

export function buildCurrentMatchState(
  lobby: LobbyWithStateProps,
  rawPlayers: IGetLobbyPlayersResult[]
): MatchState {
  const players: LobbyPlayer[] = rawPlayers.map(player => {
    if (player.turn == null) throw new Error(`buildCurrentMatchState: player's turn is null`);

    return {
      nftId: player.nft_id,
      turn: player.turn,
      points: player.points,
      score: player.score,
    };
  });

  return {
    players,
    properRound: lobby.current_proper_round,
    turn: lobby.current_turn,
    result: undefined,
  };
}

export function cloneMatchState(template: MatchState): MatchState {
  return {
    ...template,
    players: template.players.map(template => ({
      ...template,
    })),
  };
}

export function getPlayerScore(matchState: MatchState): number {
  const turnPlayer = getTurnPlayer(matchState);
  return turnPlayer.score;
}

export function getTurnPlayer(matchState: MatchState): LobbyPlayer {
  const turnPlayer = matchState.players.find(player => player.turn === matchState.turn);
  if (turnPlayer == null) throw new Error(`getTurnPlayer: missing player for turn`);
  return turnPlayer;
}

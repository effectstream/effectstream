import type { IGetLobbyPlayersResult, IGetLobbyByIdResult } from '@dice/db';
import {
  RoundKind,
  type MatchState,
  type DiceRolls,
  type LobbyPlayer,
  type ConciseResult,
  type MatchResult,
} from '@dice/data-types/types';
import type { Prando } from '@paimaexample/crypto';

// Helper type for lobby with state properties
type LobbyStateProps = 'current_match' | 'current_round' | 'current_turn' | 'current_proper_round';
export type LobbyWithStateProps = Omit<IGetLobbyByIdResult, LobbyStateProps> &
  Required<Pick<IGetLobbyByIdResult, LobbyStateProps>>;

export function genDieRoll(randomnessGenerator: Prando): number {
  return randomnessGenerator.nextInt(1, 6);
}

export function genInitialDiceRolls(randomnessGenerator: Prando): {
  dice: [number, number][];
  finalScore: number;
} {
  const result: {
    dice: [number, number][];
    finalScore: number;
  } = {
    dice: [],
    finalScore: 0,
  };
  while (result.finalScore < 16) {
    const dice: [number, number] = [
      genDieRoll(randomnessGenerator),
      genDieRoll(randomnessGenerator),
    ];
    const sum = dice.reduce((acc, next) => acc + next, 0);
    result.dice.push(dice);
    result.finalScore += sum;
  }

  return result;
}

export function genDiceRolls(startingScore: number, randomnessGenerator: Prando): DiceRolls {
  if (startingScore < 16)
    return {
      roundKind: RoundKind.initial,
      ...genInitialDiceRolls(randomnessGenerator),
    };

  const extraDie = genDieRoll(randomnessGenerator);
  return {
    roundKind: RoundKind.extra,
    dice: [[extraDie]],
    finalScore: startingScore + extraDie,
  };
}

export function canRollAgain(dice: [number, number]): boolean {
  return dice[0] + dice[1] >= 7; // TODO: update to blackjack dice logic
}

export function isValidMove(
  randomnessGenerator: Prando,
  matchState: MatchState,
  rollAgain: boolean
): boolean {
  if (!rollAgain) return true;

  const score = getPlayerScore(matchState);
  if (score < 16) return genInitialDiceRolls(randomnessGenerator).finalScore <= 21;

  return score + genDieRoll(randomnessGenerator) <= 21;
}

export function matchResults(matchState: MatchState): MatchResult {
  // We compute the winner
  const maxPoints = matchState.players.reduce((acc, next) => Math.max(acc, next.points), 0);
  const maxPlayers = matchState.players.filter(player => player.points === maxPoints);
  const results: ConciseResult[] = matchState.players.map(player => {
    if (player.points < maxPoints) return 'l';
    if (maxPlayers.length > 1) return 't';
    return 'w';
  });

  return results;
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

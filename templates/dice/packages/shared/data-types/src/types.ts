import type { WalletAddress } from "@paimaexample/utils";

// Lobby states
export type LobbyState = "open" | "active" | "finished" | "closed";

// Match results (concise)
export type ConciseResult = "w" | "t" | "l";

// Match results (expanded)
export type ExpandedResult = "win" | "tie" | "loss";

// Match result array
export type MatchResult = ConciseResult[];

// Round kind for dice game
export enum RoundKind {
  initial,
  extra,
}

// Tick event kinds
export enum TickEventKind {
  roll,
  applyPoints,
  turnEnd,
  roundEnd,
  matchEnd,
}

// Dice roll data
export type DiceRolls = {
  finalScore: number;
} & (
  | {
      roundKind: RoundKind.initial;
      dice: [number, number][];
    }
  | {
      roundKind: RoundKind.extra;
      dice: [[number]];
    }
);

// Tick events
export type RollTickEvent = {
  kind: TickEventKind.roll;
  diceRolls: [number] | [number, number];
  rollAgain: boolean;
};

export type ApplyPointsTickEvent = {
  kind: TickEventKind.applyPoints;
  points: number[];
};

export type TurnEndTickEvent = {
  kind: TickEventKind.turnEnd;
};

export type RoundEndTickEvent = {
  kind: TickEventKind.roundEnd;
};

export type MatchEndTickEvent = {
  kind: TickEventKind.matchEnd;
  result: MatchResult;
};

export type TickEvent =
  | RollTickEvent
  | ApplyPointsTickEvent
  | TurnEndTickEvent
  | RoundEndTickEvent
  | MatchEndTickEvent;

// Match environment (immutable data about the match)
export interface MatchEnvironment {
  practice: boolean;
  numberOfRounds: number;
}

// Lobby player data
export type LobbyPlayer = {
  nftId: number;
  turn: undefined | number;
  points: number;
  score: number;
};

// Match state (mutable data updated by round executor)
export interface MatchState {
  players: LobbyPlayer[];
  properRound: number; // User-facing round number
  turn: number; // Whose turn is it
  result: undefined | MatchResult;
}

// Match winner response
export interface MatchWinnerResponse {
  match_status?: LobbyState;
  winner_nft_id?: undefined | number;
}

import type { Color } from "chess.js";
import type { Prando } from "@effectstream/crypto";

export type RoundExecutor<MatchState = any, TickEvent = any> = {
  currentTick: number;
  currentState: MatchState;
  tick: () => TickEvent[] | null;
  processAllTicks: () => TickEvent[];
  endState: () => MatchState;
};

export type MatchExecutor<MatchState = any, TickEvent = any> = {
  currentRound: number;
  currentState: MatchState;
  roundExecutor: null | {
    currentTick: number;
    currentState: MatchState;
    tick: () => TickEvent[] | null;
    processAllTicks: () => TickEvent[];
    endState: () => MatchState;
  };
  __nextRound: () => void;
  tick: () => TickEvent[] | NewRoundEvent[] | null;
};

export type ProcessTickFn<MatchEnvironment, MatchState, MoveType, TickEvent> = (
  matchEnvironment: MatchEnvironment,
  matchState: MatchState,
  submittedMoves: MoveType[],
  currentTick: number,
  randomnessGenerator: Prando,
) => TickEvent[] | null;

export interface RoundNumbered {
  round: number;
}

export interface Seed {
  seed: string;
  block_height: number;
  round: number;
}

export interface NewRoundEvent {
  eventType: "newRound";
  roundNumber: number;
}

export interface TickEvent {
  user: string;
  pgn_move: string;
}

export interface MatchEnvironment {
  user1: PlayerInfo;
  user2: PlayerInfo;
}

export interface PlayerInfo {
  wallet: string;
  color: Color;
}

export interface MatchState {
  fenBoard: string;
}

export type MatchMove = string;

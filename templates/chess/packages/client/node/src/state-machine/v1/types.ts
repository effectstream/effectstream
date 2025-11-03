import type { ConciseResult } from "@chess/utils";
import type { WalletAddress } from "@paimaexample/utils";

export type ParsedSubmittedInput =
  | CreatedLobbyInput
  | JoinedLobbyInput
  | ClosedLobbyInput
  | SubmittedMovesInput
  | ScheduledDataInput
  | InvalidInput;

export interface InvalidInput {
  input: "invalidString";
}

export interface CreatedLobbyInput {
  input: "createdLobby";
  numOfRounds: number;
  roundLength: number;
  playTimePerPlayer: number;
  isHidden: boolean;
  isPractice: boolean;
  botDifficulty: number;
  playerOneIsWhite: boolean;
}

export interface JoinedLobbyInput {
  input: "joinedLobby";
  lobbyID: string;
}

export interface ClosedLobbyInput {
  input: "closedLobby";
  lobbyID: string;
}

export interface SubmittedMovesInput {
  input: "submittedMoves";
  lobbyID: string;
  roundNumber: number;
  pgnMove: string;
}

export interface ScheduledDataInput {
  input: "scheduledData";
}

export interface ZombieRound extends ScheduledDataInput {
  effect: "zombie";
  lobbyID: string;
}

export interface UserStats extends ScheduledDataInput {
  effect: "stats";
  user: WalletAddress;
  result: ConciseResult;
  ratingChange: number;
}

export interface BotMove extends ScheduledDataInput {
  effect: "move";
  lobbyID: string;
  roundNumber: number;
}

export function isZombieRound(input: ScheduledDataInput): input is ZombieRound {
  return (input as ZombieRound).effect === "zombie";
}

export function isUserStats(input: ScheduledDataInput): input is UserStats {
  return (input as UserStats).effect === "stats";
}

export function isBotMove(input: ScheduledDataInput): input is BotMove {
  return (input as BotMove).effect === "move";
}

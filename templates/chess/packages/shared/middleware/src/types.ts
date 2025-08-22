// import type { Hash } from '@paimaexample/sdk/utils';

import type {
  BaseRoundStatus,
  LobbyState,
  LobbyStateQuery,
  NewLobby,
  UserLobby,
  UserStats,
} from "@chess/utils";
import type { LobbyStatus } from "@chess/db";

export interface RoundEnd {
  blocks: number;
  seconds: number;
}

export interface CreateLobbySuccessfulResponse {
  success: true;
  lobbyID: string; // Hash;
  lobbyStatus: LobbyStatus;
}

export interface NewLobbies {
  success: true;
  lobbies: NewLobby[];
}

export interface PackedLobbyState {
  success: true;
  lobby: LobbyState;
}

export interface RoundExecutionState extends BaseRoundStatus {
  roundEndsInBlocks: number;
  roundEndsInSeconds: number;
}

export interface PackedRoundExecutionState {
  success: true;
  round: RoundExecutionState;
}

export interface LobbyStates {
  success: true;
  lobbies: LobbyStateQuery[];
}

export interface PackedUserLobbies {
  success: true;
  lobbies: UserLobby[];
}

export interface PackedUserStats {
  success: true;
  stats: UserStats;
  rank: number;
}

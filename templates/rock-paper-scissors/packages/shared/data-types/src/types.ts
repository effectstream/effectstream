import type { WalletAddress } from "@paimaexample/utils";

// Lobby states
export type LobbyState = "open" | "active" | "finished" | "closed";

// Match results
export type MatchResult = "win" | "tie" | "loss";

// RPS moves
export type RPSMove = "R" | "P" | "S";

// Lobby data structure
export interface Lobby {
  lobby_id: string;
  num_of_rounds: number;
  round_length: number;
  current_round: number;
  round_winner: string; // Track wins per round (e.g., "1T2" = P1 wins, tie, P2 wins)
  created_at: Date;
  creation_block_height: number;
  hidden: boolean;
  practice: boolean;
  lobby_creator: WalletAddress;
  player_two: WalletAddress | null;
  lobby_state: LobbyState;
  latest_match_state: string; // Compact move representation (e.g., "RP-S**")
}

// Round data
export interface Round {
  id: number;
  lobby_id: string;
  round_within_match: number;
  starting_block_height: number;
  execution_block_height: number | null;
}

// Move data
export interface Move {
  id: number;
  lobby_id: string;
  wallet: WalletAddress;
  round: number;
  move_rps: RPSMove;
}

// User statistics
export interface UserStats {
  wallet: WalletAddress;
  wins: number;
  losses: number;
  ties: number;
}

// Final match state (archived results)
export interface FinalMatchState {
  lobby_id: string;
  player_one_wallet: WalletAddress;
  player_one_result: MatchResult;
  player_two_wallet: WalletAddress;
  player_two_result: MatchResult;
  total_time: number;
  game_moves: string;
}

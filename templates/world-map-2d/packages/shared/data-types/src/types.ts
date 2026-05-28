import type { WalletAddress } from "@effectstream/utils";

export interface RoundExecutorData {
  match_state: string;
  block_data: any; // Will be properly typed when database is migrated
}

interface ExecutorDataSeed {
  seed: string;
  block_height: number;
  round: number;
}

export interface MatchExecutorData {
  seeds: ExecutorDataSeed[];
}

export interface BaseRoundStatus {
  executed: boolean;
  usersWhoSubmittedMoves: WalletAddress[];
}

export interface RoundStatusData extends BaseRoundStatus {
  roundStarted: number; // blockheight
  roundLength: number;
}

// Export user and world stats types
// These will be properly imported from database package after migration
export type UserStats = any; // Placeholder
export type WorldStats = any; // Placeholder

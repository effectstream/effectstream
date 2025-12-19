export enum RPSActions {
  ROCK = 'R',
  PAPER = 'P',
  SCISSORS = 'S',
}

export enum RPSExtendedStates {
  DID_NOT_PLAY = '-',
  PENDING = '*',
}

export type RPSActionsStates = RPSActions | RPSExtendedStates;

export type RPSSummary = string; // RP--RS-S?S

export enum GameResult {
  WIN = 'win',
  TIE = 'tie',
  LOSS = 'loss',
}
export enum ShortNotationGameResult {
  WIN = 'w',
  TIE = 't',
  LOSS = 'l',
}

export type MatchResult = [GameResult, GameResult];
export interface TickEvent {
  user1: string;
  move1: RPSActionsStates;
  user2: string;
  move2: RPSActionsStates;
  winner: 'tie' | 'user1' | 'user2';
}

export interface MatchEnvironment {
  user1: PlayerInfo;
  user2: PlayerInfo;
  current_round: number;
  num_of_rounds: number;
}
export interface PlayerInfo {
  wallet: string;
}

export interface MatchState {
  moves_rps: RPSSummary;
}

export type MatchMove = RPSActions;

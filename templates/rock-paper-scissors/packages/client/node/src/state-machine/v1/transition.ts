import type { Prando } from "@paimaexample/crypto";
import type { WalletAddress } from "@paimaexample/utils";
import type {
  IGetLobbyByIdResult,
  IGetRoundDataResult,
  IGetCachedMovesResult,
} from "@rock-paper-scissors/db";
import {
  RockPaperScissors,
  GameResult,
  type RPSActions,
  type MatchResult,
  type RPSSummary,
} from "@rock-paper-scissors/game-logic";

// Import pgtyped queries directly
import {
  createLobby,
  createRound,
  createMove,
  createUserStats,
  createFinalMatchState,
  updateLobbyPlayerTwo,
  updateMatchState,
  updateRoundExecution,
  updateUserStats as updateUserStatsQuery,
  closeLobby,
  finishLobby,
} from "@rock-paper-scissors/db";

export type SQLUpdate = [any, any];

export interface CreatedLobbyInput {
  input: "createdLobby";
  numOfRounds: number;
  roundLength: number;
  isHidden: boolean;
  isPractice: boolean;
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
  move_rps: string;
}

export interface ZombieScheduledDataInput {
  input: "zombieScheduledData";
  lobbyID: string;
}

export interface UserScheduledDataInput {
  input: "userScheduledData";
  user: WalletAddress;
  result: 'w' | 't' | 'l';
}

// State transition when a create lobby input is processed
export async function createdLobby(
  player: WalletAddress,
  blockHeight: number,
  input: CreatedLobbyInput,
  randomnessGenerator: Prando
): Promise<SQLUpdate> {
  // Generate 12-character lobby ID
  const lobby_id = randomnessGenerator.nextString(12);

  // Build initial match state (all pending)
  const initialMatchState = RockPaperScissors.buildInitialState(input.numOfRounds);

  // Return SQLUpdate for createLobby query with named parameters
  return [createLobby, {
    lobby_id,
    num_of_rounds: input.numOfRounds,
    round_length: input.roundLength,
    round_winner: "",
    created_at: new Date(),
    creation_block_height: blockHeight,
    hidden: input.isHidden,
    practice: input.isPractice,
    lobby_creator: player,
    lobby_state: "open",
    latest_match_state: initialMatchState,
  }];
}

// State transition when a player joins an existing lobby
export async function joinedLobby(
  player: WalletAddress,
  blockHeight: number,
  input: JoinedLobbyInput,
  lobby: IGetLobbyByIdResult | null
): Promise<SQLUpdate[]> {
  // Validate lobby exists
  if (!lobby) return [];

  // Validate lobby can be joined
  if (
    lobby.player_two ||
    lobby.lobby_state !== "open" ||
    lobby.lobby_creator === player
  ) {
    return [];
  }

  const updates: SQLUpdate[] = [];

  // Update lobby with player two
  updates.push([
    updateLobbyPlayerTwo,
    { player_two: player, lobby_id: input.lobbyID },
  ]);

  // Create round 1
  updates.push([
    createRound,
    {
      lobby_id: input.lobbyID,
      round_within_match: 1,
      starting_block_height: blockHeight,
    },
  ]);

  // Create user stats for both players
  updates.push([createUserStats, { wallet: lobby.lobby_creator }]);
  updates.push([createUserStats, { wallet: player }]);

  return updates;
}

// State transition when creator closes lobby before anyone joins
export async function closedLobby(
  player: WalletAddress,
  input: ClosedLobbyInput,
  lobby: IGetLobbyByIdResult | null
): Promise<SQLUpdate[]> {
  // Validate lobby exists
  if (!lobby) return [];

  // Validate only creator can close and lobby is still open
  if (
    lobby.player_two ||
    lobby.lobby_state !== "open" ||
    lobby.lobby_creator !== player
  ) {
    return [];
  }

  // Return SQLUpdate for closeLobby query
  return [[closeLobby, { lobby_id: input.lobbyID }]];
}

// State transition when a player submits a move for a round
export async function submittedMoves(
  player: WalletAddress,
  blockHeight: number,
  input: SubmittedMovesInput,
  lobby: IGetLobbyByIdResult | null,
  round: IGetRoundDataResult | null,
  cachedMoves: IGetCachedMovesResult[],
  randomnessGenerator: Prando
): Promise<SQLUpdate[]> {
  // Validate lobby and round exist
  if (!lobby || !round) return [];

  // Validate the move
  if (!validateSubmittedMoves(lobby, round, input, player)) {
    return [];
  }

  // Create move record
  const moveUpdate: SQLUpdate = [
    createMove,
    {
      lobby_id: input.lobbyID,
      wallet: player,
      round: input.roundNumber,
      move_rps: input.move_rps,
    },
  ];

  // Check if both players have now submitted moves (including this one)
  const allMoves = [...cachedMoves, { wallet: player, move_rps: input.move_rps }];
  if (allMoves.length === 2) {
    // Execute the round
    const roundExecutionUpdates = executeRound(
      blockHeight,
      lobby,
      allMoves,
      round,
      randomnessGenerator
    );
    return [moveUpdate, ...roundExecutionUpdates];
  }

  // Only one move so far, just persist it
  return [moveUpdate];
}

// Helper function to validate submitted moves
function validateSubmittedMoves(
  lobby: IGetLobbyByIdResult,
  round: IGetRoundDataResult,
  input: SubmittedMovesInput,
  player: WalletAddress
): boolean {
  // Lobby must be active
  if (lobby.lobby_state !== "active") return false;

  // Player must be part of the lobby
  const lobbyPlayers = [lobby.lobby_creator, lobby.player_two];
  if (!lobbyPlayers.includes(player)) return false;

  // Round must match current round
  if (input.roundNumber !== round.round_within_match) return false;

  // Validate move using game engine
  const isPlayerOne = lobby.lobby_creator === player;
  const rps = new RockPaperScissors(lobby.latest_match_state as RPSSummary);
  return rps.isValidMove(isPlayerOne, input.move_rps as RPSActions, round.round_within_match);
}

// Processes both moves and determines winner
export function executeRound(
  blockHeight: number,
  lobby: IGetLobbyByIdResult,
  moves: Array<{ wallet: string; move_rps: string }>,
  round: IGetRoundDataResult,
  randomnessGenerator: Prando
): SQLUpdate[] {
  const updates: SQLUpdate[] = [];

  // Process moves through game engine
  const rps = new RockPaperScissors(lobby.latest_match_state as RPSSummary);

  // Input both moves
  moves.forEach((move) => {
    const isPlayerOne = move.wallet === lobby.lobby_creator;
    rps.inputMove(isPlayerOne, move.move_rps as RPSActions, round.round_within_match);
  });

  // End the round (converts pending to DID_NOT_PLAY if needed)
  rps.endRound(round.round_within_match);

  // Get round winner
  const roundResult = rps.roundWinner(round.round_within_match);
  const roundInfo =
    roundResult[0] === GameResult.TIE
      ? "T"
      : roundResult[0] === GameResult.WIN
      ? "1"
      : "2";
  const roundState = lobby.round_winner + roundInfo;

  // Update match state
  updates.push([
    updateMatchState,
    {
      latest_match_state: rps.state,
      round_winner: roundState,
      lobby_id: lobby.lobby_id,
    },
  ]);

  // Update round execution
  updates.push([
    updateRoundExecution,
    {
      execution_block_height: blockHeight,
      lobby_id: lobby.lobby_id,
      round_within_match: round.round_within_match,
    },
  ]);

  // Check if game is over
  if (rps.didGameEnd()) {
    // Finish the lobby
    updates.push([finishLobby, { lobby_id: lobby.lobby_id }]);

    // Create final match state if not practice
    if (!lobby.practice) {
      const gameResults = rps.endGameResults();
      updates.push([
        createFinalMatchState,
        {
          lobby_id: lobby.lobby_id,
          player_one_wallet: lobby.lobby_creator,
          player_one_result: gameResults[0],
          player_two_wallet: lobby.player_two!,
          player_two_result: gameResults[1],
          total_time: 0,
          game_moves: rps.state,
        },
      ]);
    }
  } else {
    // Create next round
    updates.push([
      createRound,
      {
        lobby_id: lobby.lobby_id,
        round_within_match: round.round_within_match + 1,
        starting_block_height: blockHeight,
      },
    ]);
  }

  return updates;
}

// Zombie round - handles timeouts when players don't submit moves
export async function zombieRound(
  blockHeight: number,
  input: ZombieScheduledDataInput,
  lobby: IGetLobbyByIdResult | null,
  round: IGetRoundDataResult | null,
  moves: IGetCachedMovesResult[],
  randomnessGenerator: Prando
): Promise<SQLUpdate[]> {
  if (!lobby) {
    console.log(`Error: Lobby ${input.lobbyID} not found for zombie round`);
    return [];
  }

  if (lobby.lobby_state !== 'active') {
    console.log(`Lobby ${input.lobbyID} is not active, skipping zombie round`);
    return [];
  }

  if (!round) {
    console.log(`Error: Round ${lobby.current_round} not found for zombie`);
    return [];
  }

  // If both players submitted, nothing to do (round already executed)
  if (moves.length >= 2) {
    return [];
  }

  // Mark missing moves as "did not play" and execute the round
  // This gives the win to the player who submitted (or tie if neither submitted)
  return executeRound(blockHeight, lobby, moves, round, randomnessGenerator);
}

// Update user stats - scheduled after a game ends
export async function updateUserStats(
  input: UserScheduledDataInput
): Promise<SQLUpdate> {
  const { user, result } = input;

  // Convert result to stat increments
  const wins = result === 'w' ? 1 : 0;
  const losses = result === 'l' ? 1 : 0;
  const ties = result === 't' ? 1 : 0;

  return [
    updateUserStatsQuery,
    {
      wins_increment: wins,
      losses_increment: losses,
      ties_increment: ties,
      wallet: user,
    },
  ];
}

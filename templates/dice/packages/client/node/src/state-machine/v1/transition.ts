import type { Prando } from "@effectstream/crypto";
import type { WalletAddress } from "@effectstream/utils";
import type {
  IGetLobbyByIdResult,
  IGetLobbyPlayersResult,
  IGetRoundResult,
  IGetMatchResult,
  IGetRoundMovesResult,
  IGetUserStatsResult,
} from "@dice/db";
import {
  createLobby,
  joinPlayerToLobby,
  newMatch,
  newRound,
  newMove,
  newStats,
  updateStats as updateStatsQuery,
  updateLobbyState,
  updateLobbyCurrentMatch,
  updateLobbyCurrentRound,
  updateLobbyMatchState,
  updateLobbyPlayer,
  executedRound,
  addWin,
  addLoss,
  addTie,
  insertNftOwnership,
} from "@dice/db";
import type {
  MatchEnvironment,
  MatchState,
  LobbyPlayer,
  ConciseResult,
} from "@dice/data-types/types";
import {
  buildCurrentMatchState,
  isValidMove,
  matchResults,
  type LobbyWithStateProps,
} from "@dice/game-logic";
import { processTick } from "@dice/game-logic";

export type SQLUpdate = [any, any];

// Input types for state transitions
export interface NftMintInput {
  input: "nftMint";
  to: WalletAddress;    // Address the NFT is transferred to (recipient)
  from: WalletAddress;  // Address the NFT is transferred from (0x0 for mint)
  tokenId: string;      // NFT token ID
  isBurn: boolean;      // Whether this is a burn operation
}

export interface CreatedLobbyInput {
  input: "createdLobby";
  creatorNftId: number;
  numOfRounds: number;
  roundLength: number;
  playTimePerPlayer: number;
  isHidden: boolean;
  isPractice: boolean;
}

export interface JoinedLobbyInput {
  input: "joinedLobby";
  nftId: number;
  lobbyID: string;
}

export interface ClosedLobbyInput {
  input: "closedLobby";
  lobbyID: string;
}

export interface SubmittedMovesInput {
  input: "submittedMoves";
  nftId: number;
  lobbyID: string;
  matchWithinLobby: number;
  roundWithinMatch: number;
  rollAgain: boolean;
}

export interface PracticeMovesInput {
  input: "practiceMoves";
  lobbyID: string;
  matchWithinLobby: number;
  roundWithinMatch: number;
}

export interface ZombieScheduledDataInput {
  input: "zombieScheduledData";
  lobbyID: string;
}

export interface UserScheduledDataInput {
  input: "userScheduledData";
  nftId: number;
  result: ConciseResult;
}

// Constants
const PRACTICE_BOT_NFT_ID = 0; // Practice bot NFT ID
const NFT_NAME = "DiceNFT"; // TODO: Get from config

// Helper to check if lobby has state properties
function isLobbyWithStateProps(lobby: IGetLobbyByIdResult | null): lobby is LobbyWithStateProps {
  if (!lobby) return false;
  return (
    lobby.current_match != null &&
    lobby.current_round != null &&
    lobby.current_turn != null &&
    lobby.current_proper_round != null
  );
}

// NFT Mint - create initial player stats and NFT ownership
export async function mintNft(input: NftMintInput): Promise<SQLUpdate[]> {
  const tokenId = parseInt(input.tokenId);
  const ownerAddress = input.to; // 'to' is the recipient of the NFT

  // Only process mints (from = 0x0) and transfers, skip burns
  if (input.isBurn) {
    return [];
  }

  const updates: SQLUpdate[] = [];

  // If this is a mint (from = 0x0), create initial stats
  const isMint = input.from.toLowerCase() === '0x0000000000000000000000000000000000000000';

  if (isMint) {
    updates.push([newStats, {
      stats: {
        nft_id: tokenId,
        wins: 0,
        losses: 0,
        ties: 0,
      },
    }]);
  }

  // Always update ownership on transfer (including mints)
  updates.push([insertNftOwnership, {
    nft_id: tokenId,
    wallet_address: ownerAddress.toLowerCase(),
  }]);

  return updates;
}

// Create Lobby
export async function createdLobby(
  player: WalletAddress,
  blockHeight: number,
  input: CreatedLobbyInput,
  randomGenerator: Prando
): Promise<SQLUpdate[]> {
  const lobby_id = randomGenerator.nextString(12);

  console.log("Creating lobby:", lobby_id, "with creator NFT:", input.creatorNftId);

  const updates: SQLUpdate[] = [
    [createLobby, {
      lobby_id,
      max_players: 2, // TODO: Make configurable
      num_of_rounds: input.numOfRounds,
      round_length: input.roundLength,
      play_time_per_player: input.playTimePerPlayer,
      creation_block_height: blockHeight,
      created_at: new Date(),
      hidden: input.isHidden,
      practice: input.isPractice,
      lobby_creator: input.creatorNftId,
      lobby_state: "open",
    }],
    [joinPlayerToLobby, {
      lobby_id,
      nft_id: input.creatorNftId,
    }],
  ];

  return updates;
}

// Join Lobby
export async function joinedLobby(
  player: WalletAddress,
  blockHeight: number,
  input: JoinedLobbyInput,
  lobbyData: IGetLobbyByIdResult | null,
  players: IGetLobbyPlayersResult[],
  randomGenerator: Prando
): Promise<SQLUpdate[]> {
  if (!lobbyData) {
    return [];
  }

  if (lobbyData.lobby_state !== "open" || players.length >= lobbyData.max_players) {
    return [];
  }

  // Prevent the same NFT from joining twice
  if (players.some(p => p.nft_id === input.nftId)) {
    console.log(`NFT ${input.nftId} is already in lobby ${input.lobbyID}`);
    return [];
  }

  const updates: SQLUpdate[] = [];

  // Add player to lobby
  updates.push([joinPlayerToLobby, {
    lobby_id: input.lobbyID,
    nft_id: input.nftId,
  }]);

  const isFull = players.length + 1 >= lobbyData.max_players;

  if (isFull) {
    // Close the lobby
    updates.push([updateLobbyState, {
      lobby_id: input.lobbyID,
      lobby_state: "closed",
    }]);

    // Start the match
    const matchEnvironment: MatchEnvironment = {
      practice: lobbyData.practice,
      numberOfRounds: lobbyData.num_of_rounds,
    };

    const allPlayers: LobbyPlayer[] = [
      ...players.map(p => ({
        nftId: p.nft_id,
        turn: undefined,
        points: 0,
        score: 0,
      })),
      {
        nftId: input.nftId,
        turn: undefined,
        points: 0,
        score: 0,
      },
    ];

    // Assign turns randomly
    // Prando doesn't have a shuffle method, so we randomly assign turns
    const firstPlayerIndex = randomGenerator.next() < 0.5 ? 0 : 1;
    allPlayers[firstPlayerIndex].turn = 0;
    allPlayers[1 - firstPlayerIndex].turn = 1;

    // Create match
    updates.push([newMatch, {
      lobby_id: input.lobbyID,
      match_within_lobby: 0,
      starting_block_height: blockHeight,
    }]);

    // Update lobby state to active
    updates.push([updateLobbyState, {
      lobby_id: input.lobbyID,
      lobby_state: "active",
    }]);

    updates.push([updateLobbyCurrentMatch, {
      lobby_id: input.lobbyID,
      current_match: 0,
    }]);

    updates.push([updateLobbyCurrentRound, {
      lobby_id: input.lobbyID,
      current_round: 0,
    }]);

    // Set initial match state
    updates.push([updateLobbyMatchState, {
      lobby_id: input.lobbyID,
      current_turn: 0,
      current_proper_round: 0,
    }]);

    // Update player turns, points, scores
    for (const player of allPlayers) {
      updates.push([updateLobbyPlayer, {
        lobby_id: input.lobbyID,
        nft_id: player.nftId,
        turn: player.turn,
        points: player.points,
        score: player.score,
      }]);
    }

    // Create first round
    updates.push([newRound, {
      lobby_id: input.lobbyID,
      match_within_lobby: 0,
      round_within_match: 0,
      starting_block_height: blockHeight,
      execution_block_height: null,
    }]);
  }

  return updates;
}

// Close Lobby
export async function closedLobby(
  player: WalletAddress,
  input: ClosedLobbyInput,
  lobbyData: IGetLobbyByIdResult | null
): Promise<SQLUpdate[]> {
  if (!lobbyData) {
    return [];
  }

  // TODO: Add check that player is the lobby creator

  return [
    [updateLobbyState, {
      lobby_id: input.lobbyID,
      lobby_state: "closed",
    }],
  ];
}

// Submit Moves
export async function submittedMoves(
  player: WalletAddress,
  blockHeight: number,
  input: SubmittedMovesInput,
  lobbyData: IGetLobbyByIdResult | null,
  players: IGetLobbyPlayersResult[],
  roundData: IGetRoundResult | null,
  matchData: IGetMatchResult | null,
  moves: IGetRoundMovesResult[],
  randomGenerator: Prando
): Promise<SQLUpdate[]> {
  if (!lobbyData || !isLobbyWithStateProps(lobbyData)) {
    return [];
  }

  if (lobbyData.lobby_state !== "active") {
    return [];
  }

  if (players.length !== 2) {
    return [];
  }

  if (!roundData) {
    return [];
  }

  // Check if it's the right player's turn
  const turnPlayer = players.find(p => p.turn === lobbyData.current_turn);
  if (!turnPlayer || input.nftId !== turnPlayer.nft_id) {
    return [];
  }

  // Validate the match and round numbers
  if (input.matchWithinLobby !== lobbyData.current_match) {
    return [];
  }

  if (input.roundWithinMatch !== lobbyData.current_round) {
    return [];
  }

  // Validate the move using game logic
  const matchState = buildCurrentMatchState(lobbyData, players);
  if (!isValidMove(matchState, input.rollAgain)) {
    return [];
  }

  const updates: SQLUpdate[] = [];

  // Record the move
  updates.push([newMove, {
    lobby_id: input.lobbyID,
    match_within_lobby: input.matchWithinLobby,
    round_within_match: input.roundWithinMatch,
    move_within_round: moves.length,
    nft_id: input.nftId,
    roll_again: input.rollAgain,
  }]);

  // Execute the round using processTick
  const matchEnvironment: MatchEnvironment = {
    practice: lobbyData.practice,
    numberOfRounds: lobbyData.num_of_rounds,
  };

  // Process the tick with the new move
  const newMoves = [
    ...moves,
    {
      id: null as any,
      lobby_id: input.lobbyID,
      match_within_lobby: input.matchWithinLobby,
      round_within_match: input.roundWithinMatch,
      move_within_round: moves.length,
      nft_id: input.nftId,
      roll_again: input.rollAgain,
    },
  ];

  // Execute game logic tick by tick
  let currentTick = 1;
  const clonedState = { ...matchState, players: matchState.players.map(p => ({ ...p })) };

  while (true) {
    const events = processTick(
      matchEnvironment,
      clonedState,
      newMoves,
      currentTick,
      randomGenerator
    );

    if (events === null) break;
    currentTick++;
  }

  // Update lobby match state
  updates.push([updateLobbyMatchState, {
    lobby_id: input.lobbyID,
    current_turn: clonedState.turn,
    current_proper_round: clonedState.properRound,
  }]);

  // Update all player states
  for (const player of clonedState.players) {
    updates.push([updateLobbyPlayer, {
      lobby_id: input.lobbyID,
      nft_id: player.nftId,
      turn: player.turn,
      points: player.points,
      score: player.score,
    }]);
  }

  // Mark round as executed
  updates.push([executedRound, {
    lobby_id: input.lobbyID,
    match_within_lobby: input.matchWithinLobby,
    round_within_match: input.roundWithinMatch,
    execution_block_height: blockHeight,
  }]);

  // Create next round if game continues
  const matchEnded = clonedState.result !== undefined;
  if (!matchEnded) {
    updates.push([newRound, {
      lobby_id: input.lobbyID,
      match_within_lobby: lobbyData.current_match,
      round_within_match: lobbyData.current_round + 1,
      starting_block_height: blockHeight,
      execution_block_height: null,
    }]);

    updates.push([updateLobbyCurrentRound, {
      lobby_id: input.lobbyID,
      current_round: lobbyData.current_round + 1,
    }]);
  } else {
    // Match ended - update lobby state to finished
    updates.push([updateLobbyState, {
      lobby_id: input.lobbyID,
      lobby_state: "finished",
    }]);

    // Schedule stats updates for both players
    // TODO: Implement scheduling mechanism
  }

  return updates;
}

// Practice Moves (AI/Bot)
export async function practiceMoves(
  player: WalletAddress,
  blockHeight: number,
  input: PracticeMovesInput,
  lobbyData: IGetLobbyByIdResult | null,
  players: IGetLobbyPlayersResult[],
  matchData: IGetMatchResult | null,
  randomGenerator: Prando
): Promise<SQLUpdate[]> {
  if (!lobbyData || !isLobbyWithStateProps(lobbyData)) {
    return [];
  }

  // Simple AI: randomly decide whether to roll again
  // TODO: Implement proper Practice AI
  const practiceMove = randomGenerator.next() > 0.5;

  const regularInput: SubmittedMovesInput = {
    input: "submittedMoves",
    nftId: PRACTICE_BOT_NFT_ID,
    lobbyID: input.lobbyID,
    matchWithinLobby: input.matchWithinLobby,
    roundWithinMatch: input.roundWithinMatch,
    rollAgain: practiceMove,
  };

  // Reuse submittedMoves logic
  // Note: We need to pass empty moves array since we're calling from state-machine
  return submittedMoves(
    player,
    blockHeight,
    regularInput,
    lobbyData,
    players,
    null, // Will be queried in state-machine
    matchData,
    [],
    randomGenerator
  );
}

// Zombie Round (timeout)
export async function zombieRound(
  blockHeight: number,
  input: ZombieScheduledDataInput,
  lobbyData: IGetLobbyByIdResult | null,
  players: IGetLobbyPlayersResult[],
  roundData: IGetRoundResult | null,
  moves: IGetRoundMovesResult[],
  randomGenerator: Prando
): Promise<SQLUpdate[]> {
  if (!lobbyData || !isLobbyWithStateProps(lobbyData)) {
    return [];
  }


  // TODO: Implement proper zombie round logic
  // For now, just skip the turn
  const updates: SQLUpdate[] = [];

  // Move to next turn
  const numPlayers = players.length;
  const nextTurn = (lobbyData.current_turn + 1) % numPlayers;

  updates.push([updateLobbyMatchState, {
    lobby_id: input.lobbyID,
    current_turn: nextTurn,
    current_proper_round: lobbyData.current_proper_round,
  }]);

  return updates;
}

// Update User Stats
export async function updateUserStats(
  input: UserScheduledDataInput,
  statsData: IGetUserStatsResult | null
): Promise<SQLUpdate> {
  if (!statsData) {
    return [newStats, {
      stats: [{
        nft_id: input.nftId,
        wins: input.result === 'w' ? 1 : 0,
        losses: input.result === 'l' ? 1 : 0,
        ties: input.result === 't' ? 1 : 0,
      }],
    }];
  }

  // Update stats based on result
  if (input.result === 'w') {
    return [addWin, { nft_id: input.nftId }];
  } else if (input.result === 'l') {
    return [addLoss, { nft_id: input.nftId }];
  } else {
    return [addTie, { nft_id: input.nftId }];
  }
}

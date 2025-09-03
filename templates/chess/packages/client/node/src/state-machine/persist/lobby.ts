import type { CreatedLobbyInput, JoinedLobbyInput } from "../v1/types.ts";
import type {
  ICloseLobbyParams,
  IGetLobbyByIdResult,
  IStartMatchParams,
} from "@chess/db";
import {
  closeLobby,
  createLobby,
  type ICreateLobbyParams,
  startMatch,
} from "@chess/db";
import type { Prando } from "@paimaexample/crypto";
import type { WalletAddress } from "@paimaexample/utils";
import type { Timer } from "@chess/utils";
import { PRACTICE_BOT_ADDRESS } from "@chess/utils";
import { Chess } from "chess.js";
import { blankStats } from "./stats.ts";
import { persistNewRound } from "./match.ts";
import { initialState } from "@chess/game-logic";
import { schedulePracticeMove } from "./practice.ts";

type SQLUpdate = [any, any];

// Persist creation of a lobby
export function persistLobbyCreation(
  player: WalletAddress,
  blockHeight: number,
  inputData: CreatedLobbyInput,
  randomnessGenerator: Prando,
): SQLUpdate[] {
  const lobby_id = randomnessGenerator.nextString(12);
  const params: ICreateLobbyParams = {
    lobby_id: lobby_id,
    num_of_rounds: Math.min(Math.floor(inputData.numOfRounds), 10),
    round_length: Math.min(Math.floor(inputData.roundLength), 100),
    play_time_per_player: Math.min(Math.floor(inputData.playTimePerPlayer), 100),
    current_round: 0,
    created_at: new Date(),
    creation_block_height: blockHeight,
    hidden: inputData.isHidden,
    practice: inputData.isPractice,
    bot_difficulty: inputData.botDifficulty,
    lobby_creator: player,
    player_one_iswhite: inputData.playerOneIsWhite,
    player_two: null,
    lobby_state: "open",
    latest_match_state: new Chess().fen(),
  };

  console.log(`Created lobby ${lobby_id}`);
  // create the lobby according to the input data.
  const createLobbyTuple: SQLUpdate = [createLobby, params];
  // create user metadata if non existent
  const blankStatsTuple = blankStats(player);
  // In case of a practice lobby join with a predetermined opponent right away & schedule bot move
  if (inputData.isPractice) {

    const joinLobbyUpdates = persistLobbyJoin(
      blockHeight,
      PRACTICE_BOT_ADDRESS,
      { input: "joinedLobby", lobbyID: lobby_id },
      params,
    );
    const botStarts = !inputData.playerOneIsWhite;
    const practiceMove = botStarts
      ? [schedulePracticeMove(lobby_id, 1, blockHeight + 1)]
      : [];
    return [
      createLobbyTuple,
      blankStatsTuple,
      ...joinLobbyUpdates,
      ...practiceMove,
    ];
  }
  return [createLobbyTuple, blankStatsTuple];
}

// Persist joining a lobby
export function persistLobbyJoin(
  blockHeight: number,
  joiningPlayer: WalletAddress,
  inputData: JoinedLobbyInput,
  lobby: ICreateLobbyParams,
): SQLUpdate[] {
  // First we validate if the lobby is actually open for users to join, before applying.
  // If not, just output an empty list of updates (meaning no state transition is applied)
  if (
    !lobby.player_two && lobby.lobby_state === "open" &&
    lobby.lobby_creator !== joiningPlayer
  ) {
    // Save user metadata, like in the lobby creation flow,
    // then convert lobby into active and create empty round and user states
    const updateLobbyTuple = persistActivateLobby(
      joiningPlayer,
      lobby,
      blockHeight,
      inputData,
    );
    const blankStatsTuple: SQLUpdate = blankStats(joiningPlayer);
    return [...updateLobbyTuple, blankStatsTuple];
  } else return [];
}

// Convert lobby state from `open` to `close`, meaning no one will be able to join the lobby.
export function persistCloseLobby(
  requestingPlayer: WalletAddress,
  lobby: IGetLobbyByIdResult,
): SQLUpdate | null {
  if (
    lobby.player_two || lobby.lobby_state !== "open" ||
    lobby.lobby_creator !== requestingPlayer
  ) {
    return null;
  }

  const params: ICloseLobbyParams = {
    lobby_id: lobby.lobby_id,
  };
  return [closeLobby, params];
}

// Convert lobby from `open` to `active`, meaning the match has now started.
function persistActivateLobby(
  joiningPlayer: WalletAddress,
  lobby: ICreateLobbyParams,
  blockHeight: number,
  _: JoinedLobbyInput,
): SQLUpdate[] {
  // First update lobby row, marking its state as now 'active', and saving the joining player's wallet address
  const smParams: IStartMatchParams = {
    lobby_id: lobby.lobby_id,
    player_two: joiningPlayer,
  };
  const newMatchTuple: SQLUpdate = [startMatch, smParams];
  // We insert the round and first two empty user states in their tables at this stage, so the round executor has empty states to iterate from.
  const roundAndStates = persistInitialMatchState(lobby, blockHeight);
  return [newMatchTuple, ...roundAndStates];
}

// Create initial match state, used when a player joins a lobby to init the match.
function persistInitialMatchState(
  lobby: ICreateLobbyParams,
  blockHeight: number,
): SQLUpdate[] {
  const initialTimeLeft: Timer = {
    player_one_blocks_left: lobby.play_time_per_player,
    player_two_blocks_left: lobby.play_time_per_player,
  };
  const newRoundTuples = persistNewRound(
    lobby.lobby_id,
    0,
    initialState(),
    initialTimeLeft,
    lobby.round_length,
    blockHeight,
  );
  return newRoundTuples;
}

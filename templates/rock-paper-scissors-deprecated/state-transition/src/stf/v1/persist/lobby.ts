import type {
  ICloseLobbyParams,
  IGetLobbyByIdResult,
  IStartMatchParams,
  LobbyStatus,
} from '@game/db';
import { startMatch } from '@game/db';
import { createLobby } from '@game/db';
import { closeLobby } from '@game/db';
import { RockPaperScissors } from '@game/game-logic';
import { PRACTICE_BOT_ADDRESS } from '@game/utils';
import type { SQLUpdate } from '@paima/node-sdk/db';
import type Prando from '@paima/sdk/prando';
import type { WalletAddress } from '@paima/sdk/utils';
import type { CreatedLobbyInput, JoinedLobbyInput } from '../types';
import { persistNewRound } from './match';
import { blankStats } from './stats';

// Persist creation of a lobby
export function persistLobbyCreation(
  player: WalletAddress,
  blockHeight: number,
  inputData: CreatedLobbyInput,
  randomnessGenerator: Prando
): SQLUpdate[] {
  const lobby_id = randomnessGenerator.nextString(12);
  const params: IGetLobbyByIdResult = {
    lobby_id: lobby_id,
    num_of_rounds: inputData.numOfRounds,
    round_length: inputData.roundLength,
    current_round: 0,
    created_at: new Date(),
    creation_block_height: blockHeight,
    hidden: inputData.isHidden,
    practice: inputData.isPractice,
    lobby_creator: player,
    player_two: null,
    lobby_state: 'open' satisfies LobbyStatus,
    round_winner: '',
    latest_match_state: RockPaperScissors.buildInitialState(inputData.numOfRounds),
  };

  console.log(`Created lobby ${lobby_id}`, params);
  // create the lobby according to the input data.
  const createLobbyTuple: SQLUpdate = [createLobby, params];
  // create user metadata if non existent
  const blankStatsTuple: SQLUpdate = blankStats(player);
  // In case of a practice lobby join with a predetermined opponent right away
  const practiceLobbyUpdates = inputData.isPractice
    ? persistLobbyJoin(
        blockHeight,
        PRACTICE_BOT_ADDRESS,
        { input: 'joinedLobby', lobbyID: lobby_id },
        params
      )
    : [];
  return [createLobbyTuple, blankStatsTuple, ...practiceLobbyUpdates];
}

// Persist joining a lobby
export function persistLobbyJoin(
  blockHeight: number,
  joiningPlayer: WalletAddress,
  inputData: JoinedLobbyInput,
  lobby: IGetLobbyByIdResult
): SQLUpdate[] {
  // First we validate if the lobby is actually open for users to join, before applying.
  // If not, just output an empty list of updates (meaning no state transition is applied)
  if (!lobby.player_two && lobby.lobby_state === 'open' && lobby.lobby_creator !== joiningPlayer) {
    // Save user metadata, like in the lobby creation flow,
    // then convert lobby into active and create empty round and user states
    const updateLobbyTuple = persistActivateLobby(joiningPlayer, lobby, blockHeight, inputData);
    const blankStatsTuple: SQLUpdate = blankStats(joiningPlayer);
    return [...updateLobbyTuple, blankStatsTuple];
  } else {
    return [];
  }
}

// Convert lobby state from `open` to `close`, meaning no one will be able to join the lobby.
export function persistCloseLobby(
  requestingPlayer: WalletAddress,
  lobby: IGetLobbyByIdResult
): SQLUpdate | null {
  if (lobby.player_two || lobby.lobby_state !== 'open' || lobby.lobby_creator !== requestingPlayer)
    return null;

  const params: ICloseLobbyParams = {
    lobby_id: lobby.lobby_id,
  };
  return [closeLobby, params];
}

// Create initial match state, used when a player joins a lobby to init the match.
function persistInitialMatchState(lobby: IGetLobbyByIdResult, blockHeight: number): SQLUpdate[] {
  return persistNewRound(lobby.lobby_id, 0, lobby.round_length, blockHeight);
}

// Convert lobby from `open` to `active`, meaning the match has now started.
function persistActivateLobby(
  joiningPlayer: WalletAddress,
  lobby: IGetLobbyByIdResult,
  blockHeight: number,
  _: JoinedLobbyInput
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

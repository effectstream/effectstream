import {
  lobbyWasClosed,
  userJoinedLobby,
} from "../helpers/utility-functions.ts";
import type { MatchMove } from "@chess/game-logic";
import type { Result } from "@paimaexample/utils";
import type { LobbyState } from "@chess/utils";
import {
  type PaimaEngineConfig,
  sendTransaction,
  type Wallet,
} from "@paimaexample/wallets";
import { apiGetLobbyStateWithUser, apiGetRawNewLobbies } from "./queries.ts";
import type { NewLobby } from "@chess/utils";

export async function apiCreateLobby(
  wallet: Wallet,
  paimaEngineConfig: PaimaEngineConfig,
  userAddress: string,
  numberOfRounds: number,
  roundLength: number,
  playTimePerPlayer: number,
  botDifficulty: number,
  isHidden = false,
  isPractice = false,
  playerOneIsWhite = true
): Promise<Result<NewLobby & { lobbyStatus: "open" }>> {
  try {
    const conciseData = [
      "createdLobby",
      numberOfRounds,
      roundLength,
      playTimePerPlayer,
      isHidden,
      isPractice,
      botDifficulty,
      playerOneIsWhite,
    ];
    const response = await sendTransaction(
      wallet,
      conciseData,
      paimaEngineConfig,
      // TODO: rename to wait-effectstream-processed
      "wait-effectstream-processed"
    );
    if (!response.success) throw new Error("Failed to create lobby");
    const newLobbies = await apiGetRawNewLobbies(
      userAddress,
      (response as any).rollup
    );
    if (!newLobbies.success) throw new Error("Failed to get new lobbies");
    if (newLobbies.result.length === 0) throw new Error("Received an empty list of new lobbies");

    // This type does not match as expected.
    return {
      success: true,
      result: {
        lobby_id: newLobbies.result[0].lobby_id,
        lobbyStatus: "open",
      }
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: "Cannot create lobby: " + String(err),
    };
  }
}

export async function apiJoinLobby(
  wallet: Wallet,
  paimaEngineConfig: PaimaEngineConfig,
  lobbyID: string
): Promise<Result<string>> {
  try {
    const conciseData = ["joinLobby", lobbyID];
    const response = await sendTransaction(
      wallet,
      conciseData,
      paimaEngineConfig,
      // TODO: rename to wait-effectstream-processed
      "wait-effectstream-processed"
    );
    if (!response.success) throw new Error("Failed to join lobby");
    const lobbyState = await apiGetLobbyStateWithUser(
      lobbyID,
      wallet.provider.getAddress().address
    );
    if (!lobbyState.success) throw new Error("Failed to get lobby state");
    if (
      !userJoinedLobby(wallet.provider.getAddress().address, lobbyState.result)
    ) {
      throw new Error("User is not in the lobby");
    }
    return {
      success: true,
      result: "",
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: "Cannot join lobby: " + String(err),
    };
  }
}

export async function apiCloseLobby(
  wallet: Wallet,
  paimaEngineConfig: PaimaEngineConfig,
  lobbyID: string
): Promise<Result<string>> {
  try {
    const conciseData = ["closeLobby", lobbyID];

    const response = await sendTransaction(
      wallet,
      conciseData,
      paimaEngineConfig,
      // TODO: rename to wait-effectstream-processed
      "wait-effectstream-processed"
    );
    if (!response.success) throw new Error("Failed to close lobby");
    const lobbyState = await apiGetLobbyStateWithUser(
      lobbyID,
      wallet.provider.getAddress().address
    );
    if (!lobbyState.success) throw new Error("Failed to get lobby state");
    if (!lobbyWasClosed(lobbyState.result)) throw new Error("Lobby was not closed");

    return {
      success: true,
      result: "",
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: "Cannot close lobby: " + String(err),
    };
  }
}

export async function apiSubmitMoves(
  wallet: Wallet,
  paimaEngineConfig: PaimaEngineConfig,
  lobbyID: string,
  roundNumber: number,
  move: MatchMove
): Promise<Result<LobbyState>> {
  try {
    const conciseData = ["submitMoves", lobbyID, roundNumber, move];
    const response = await sendTransaction(
      wallet,
      conciseData,
      paimaEngineConfig,
      // TODO: rename to wait-effectstream-processed
      "wait-effectstream-processed"
    );
    if (!response.success) throw new Error("Failed to submit moves");

    const lobbyState = await apiGetLobbyStateWithUser(
      lobbyID,
      wallet.provider.getAddress().address
    );
    if (!lobbyState.success) throw new Error("Failed to get lobby state");
    return lobbyState;
  } catch (err) {
    return {
      success: false,
      errorMessage: "Cannot submit moves: " + String(err),
    };
  }
}


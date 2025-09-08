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
  playerOneIsWhite = true,
): Promise<Result<NewLobby>> {
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
    "wait-paima-processed",
  );

  const newLobbies = await apiGetRawNewLobbies(
    userAddress,
    (response as any).rollup,
  );
  if (!newLobbies.success) {
    return {
      success: false,
      errorMessage: "Failed to get new lobbies",
    };
  }
  if (newLobbies.lobbies.length === 0) {
    return {
      success: false,
      errorMessage: "Received an empty list of new lobbies",
    };
  }
  return {
    success: true,
    lobbyID: newLobbies.lobbies[0].lobby_id,
    lobbyStatus: "open",
  };
}

export async function apiJoinLobby(
  wallet: Wallet,
  paimaEngineConfig: PaimaEngineConfig,
  lobbyID: string,
): Promise<Result> {
  const conciseData = ["joinLobby", lobbyID];
  const response = await sendTransaction(
    wallet,
    conciseData,
    paimaEngineConfig,
    "wait-paima-processed",
  );
  if (!response.success) {
    return {
      success: false,
      errorMessage: "Failed to join lobby",
    };
  }
  const lobbyState = await apiGetLobbyStateWithUser(
    lobbyID,
    wallet.provider.getAddress().address,
  );

  if (userJoinedLobby(wallet.provider.getAddress().address, lobbyState)) {
    return { success: true, message: "" };
  } else {
    return {
      success: false,
      errorMessage: "Cannot join lobby",
    };
  }
}

export async function apiCloseLobby(
  wallet: Wallet,
  paimaEngineConfig: PaimaEngineConfig,
  lobbyID: string,
): Promise<Result> {
  const conciseData = ["closeLobby", lobbyID];

  const response = await sendTransaction(
    wallet,
    conciseData,
    paimaEngineConfig,
    "wait-paima-processed",
  );
  if (!response.success) {
    return {
      success: false,
      errorMessage: "Failed to close lobby",
    };
  }
  const lobbyState = await apiGetLobbyStateWithUser(
    lobbyID,
    wallet.provider.getAddress().address,
  );
  if (lobbyWasClosed(lobbyState)) {
    return {
      success: true,
      message: "",
    };
  } else {
    return {
      success: false,
      errorMessage: "Cannot close lobby",
    };
  }
}

export async function apiSubmitMoves(
  wallet: Wallet,
  paimaEngineConfig: PaimaEngineConfig,
  lobbyID: string,
  roundNumber: number,
  move: MatchMove,
): Promise<Result<LobbyState>> {
  const conciseData = ["submitMoves", lobbyID, roundNumber, move];
  const response = await sendTransaction(
    wallet,
    conciseData,
    paimaEngineConfig,
    "wait-paima-processed",
  );
  if (!response.success) {
    return {
      success: false,
      errorMessage: "Failed to submit moves",
    };
  }
  const lobbyState = await apiGetLobbyStateWithUser(
    lobbyID,
    wallet.provider.getAddress().address,
  );

  if (lobbyState.success) {
    return lobbyState;
  }
  return {
    success: false,
    errorMessage: "Cannot submit moves",
  };
}

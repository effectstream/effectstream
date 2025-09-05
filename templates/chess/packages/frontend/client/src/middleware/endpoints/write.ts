import {
  getLobbyStateWithUser,
  getNonemptyNewLobbies,
  getRawNewLobbies,
} from "../helpers/auxiliary-queries.ts";
import {
  lobbyWasClosed,
  userCreatedLobby,
  userJoinedLobby,
} from "../helpers/utility-functions.ts";
import type { MatchMove } from "@chess/game-logic";
import type {
  CreateLobbySuccessfulResponse,
  PackedLobbyState,
} from "../types.ts";
import { FailedResult, OldResult } from "../helpers/utility-functions.ts";

import { hardhat } from "viem/chains";
import {
  PaimaEngineConfig,
  sendTransaction,
  type Wallet,
} from "@paimaexample/wallets";

const paimaEngineConfig = new PaimaEngineConfig(
  "",
  "mainEvmRPC",
  "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  hardhat,
  undefined,
  "http://localhost:3334",
  true,
);

async function createLobby(
  wallet: Wallet,
  userAddress: string,
  numberOfRounds: number,
  roundLength: number,
  playTimePerPlayer: number,
  botDifficulty: number,
  isHidden = false,
  isPractice = false,
  playerOneIsWhite = true,
): Promise<CreateLobbySuccessfulResponse | FailedResult> {
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
  const startTime = Date.now();
  console.log(">>> START CREATE LOBBY", { time: 0, now: Date.now() });
  const response = await sendTransaction(
    wallet,
    conciseData,
    paimaEngineConfig,
    "wait-paima-processed",
  );
  console.log(">>> END CREATE LOBBY", { time: Date.now() - startTime });
  console.log(">>> RESPONSE", response);
  const newLobbies = await getRawNewLobbies(
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

async function joinLobby(wallet: Wallet, lobbyID: string): Promise<OldResult> {
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
  const lobbyState = await getLobbyStateWithUser(
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

async function closeLobby(wallet: Wallet, lobbyID: string): Promise<OldResult> {
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
  const lobbyState = await getLobbyStateWithUser(
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

async function submitMoves(
  wallet: Wallet,
  lobbyID: string,
  roundNumber: number,
  move: MatchMove,
): Promise<FailedResult | PackedLobbyState> {
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
  const lobbyState = await getLobbyStateWithUser(
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

export const writeEndpoints = {
  createLobby,
  joinLobby,
  closeLobby,
  submitMoves,
};

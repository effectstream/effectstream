import { sendTransaction, type Wallet } from "@effectstream/wallets";
import { paimaEngineConfig } from "../PaimaEngineConfig.ts";

export async function createLobby(
  wallet: Wallet,
  opts: {
    numOfRounds: number;
    roundLength: number;
    playTimePerPlayer: number;
    playerOneIsWhite: boolean;
    isHidden: boolean;
    isPractice: boolean;
    botDifficulty: number;
  },
) {
  const conciseData = [
    "createdLobby",
    opts.numOfRounds,
    opts.roundLength,
    opts.playTimePerPlayer,
    opts.isHidden,
    opts.isPractice,
    opts.botDifficulty,
    opts.playerOneIsWhite,
  ];
  return sendTransaction(wallet, conciseData, paimaEngineConfig, "wait-effectstream-processed");
}

export async function joinLobby(wallet: Wallet, lobbyID: string) {
  return sendTransaction(wallet, ["joinLobby", lobbyID], paimaEngineConfig, "wait-effectstream-processed");
}

export async function submitMove(wallet: Wallet, lobbyID: string, roundNumber: number, pgnMove: string) {
  return sendTransaction(wallet, ["submitMoves", lobbyID, roundNumber, pgnMove], paimaEngineConfig, "wait-effectstream-processed");
}

export async function closeLobby(wallet: Wallet, lobbyID: string) {
  return sendTransaction(wallet, ["closeLobby", lobbyID], paimaEngineConfig, "wait-effectstream-processed");
}

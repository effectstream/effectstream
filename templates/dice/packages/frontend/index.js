import {
  EffectstreamConfig,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@effectstream/wallets";
import { hardhat } from "viem/chains";

// Hardhat-deterministic address of the first deployed EffectstreamL2 (Ignition).
// Replace with the deployed EffectstreamL2 address on real networks.
export const effectstreamConfig = new EffectstreamConfig(
  "dice",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  undefined,
  false,
);

const API_BASE = "http://localhost:9999";
const HARDHAT_RPC = "http://localhost:8545";
// Hardhat well-known account #0 — local-dev only; never use on real chains.
const LOCAL_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

let wallet = null;
let walletAddress = null;

async function connectBrowserWallet() {
  const result = await walletLogin({
    mode: WalletMode.EvmInjected,
    chain: effectstreamConfig.effectstreamL2Chain,
  });
  if (!result.success) throw new Error("Browser wallet login failed");
  wallet = result.result;
  walletAddress = wallet.provider.getAddress?.()?.address ?? null;
  return wallet;
}

async function connectLocalWallet() {
  const result = await walletLogin({
    mode: WalletMode.EvmViem,
    privateKey: LOCAL_PRIVATE_KEY,
    rpcUrl: HARDHAT_RPC,
    chain: hardhat,
    preferBatchedMode: false,
  });
  if (!result.success) throw new Error("Local-js wallet login failed");
  wallet = result.result;
  walletAddress = wallet.provider.getAddress?.()?.address ?? null;
  return wallet;
}

// --- Dice game write actions ---------------------------------------------
// We use "wait-receipt": confirm the chain has the tx; the indexer + DB update
// arrive a beat later. The page's render loop re-fetches and shows new state.

async function createLobby(creatorNftId, numOfRounds, roundLength, playTime) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    [
      "createdLobby",
      creatorNftId,
      numOfRounds,
      roundLength,
      playTime,
      false,
      false,
    ],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function joinLobby(nftId, lobbyID) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["joinedLobby", nftId, lobbyID],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function submitMove(
  nftId,
  lobbyID,
  matchWithinLobby,
  roundWithinMatch,
  rollAgain,
) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    [
      "submittedMoves",
      nftId,
      lobbyID,
      matchWithinLobby,
      roundWithinMatch,
      rollAgain,
    ],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function closeLobby(lobbyID) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["closedLobby", lobbyID],
    effectstreamConfig,
    "wait-receipt",
  );
}

// --- Read endpoints -------------------------------------------------------

async function fetchLobby(lobbyId) {
  const res = await fetch(`${API_BASE}/lobby/${lobbyId}`);
  if (!res.ok) return null;
  return await res.json();
}

async function fetchOpenLobbies(page = 0, count = 10) {
  const res = await fetch(`${API_BASE}/lobbies/open?page=${page}&count=${count}`);
  if (!res.ok) return [];
  return await res.json();
}

async function fetchStats(nftId) {
  const res = await fetch(`${API_BASE}/stats/${nftId}`);
  if (!res.ok) return null;
  return await res.json();
}

async function fetchMyNfts() {
  if (!walletAddress) return [];
  const res = await fetch(
    `${API_BASE}/nfts?wallet=${walletAddress.toLowerCase()}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.nfts ?? [];
}

window.dice = {
  connectBrowserWallet,
  connectLocalWallet,
  createLobby,
  joinLobby,
  submitMove,
  closeLobby,
  fetchLobby,
  fetchOpenLobbies,
  fetchStats,
  fetchMyNfts,
  getWallet: () => wallet,
  getAddress: () => walletAddress,
  walletModes: WalletMode,
};

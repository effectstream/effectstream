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
  "hex-battle",
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

// A default radius-3 hex map (37 tiles) used by the demo "Create Lobby" button.
// Same q#r,... mini-language the STM parses. The board needs to be big enough
// for the engine to place each player's starting units/buildings with some
// spacing (a 7-tile board is too small).
export const DEFAULT_MAP =
  "0#0,-1#1,0#1,1#0,1#-1,0#-1,-1#0,-2#2,-1#2,0#2,1#1,2#0,2#-1,2#-2,1#-2,0#-2,-1#-1,-2#0,-2#1,-3#3,-2#3,-1#3,0#3,1#2,2#1,3#0,3#-1,3#-2,3#-3,2#-3,1#-3,0#-3,-1#-2,-2#-1,-3#0,-3#1,-3#2";

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

// --- Hex Battle write actions --------------------------------------------
// "wait-receipt": confirm the chain has the tx; the indexer + DB update arrive
// a beat later, and the page re-fetches to show the new board.

async function createLobby(
  numOfPlayers = 2,
  units = "AB",
  buildings = "bF",
  gold = 100,
  initTiles = 4,
  map = DEFAULT_MAP,
  timeLimit = 120,
  roundLimit = 100,
) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    [
      "createLobby",
      numOfPlayers,
      units,
      buildings,
      gold,
      initTiles,
      map,
      timeLimit,
      roundLimit,
    ],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function joinLobby(lobbyID) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["joinLobby", lobbyID],
    effectstreamConfig,
    "wait-receipt",
  );
}

// `move` is the comma-joined action mini-language, e.g. "A0#0" (build unit A at
// q=0,r=0) or "0#0#1#-1" (move from 1,-1 to 0,0) or "surrender".
async function submitMove(lobbyID, roundNumber, move) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["submitMoves", lobbyID, roundNumber, move],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function surrender(lobbyID) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["surrender", lobbyID],
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

async function fetchOpenLobbies() {
  const res = await fetch(`${API_BASE}/lobbies/open`);
  if (!res.ok) return [];
  return await res.json();
}

async function fetchPlayer(walletAddr) {
  const res = await fetch(`${API_BASE}/player/${walletAddr}`);
  if (!res.ok) return null;
  return await res.json();
}

window.hexBattle = {
  connectBrowserWallet,
  connectLocalWallet,
  createLobby,
  joinLobby,
  submitMove,
  surrender,
  fetchLobby,
  fetchOpenLobbies,
  fetchPlayer,
  getWallet: () => wallet,
  getAddress: () => walletAddress,
  walletModes: WalletMode,
  DEFAULT_MAP,
};

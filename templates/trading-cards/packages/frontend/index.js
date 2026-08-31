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
  "trading-cards",
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

// --- Trading-cards write actions -----------------------------------------
// All actions are L2 actions submitted via the EffectstreamL2 contract. We use
// "wait-receipt": confirm the chain has the tx; the indexer + DB update arrive
// a beat later and the page's render loop re-fetches.

// Register an account NFT into the game state. In a real deployment you would
// first mint the ERC721 on-chain (so the ownership primitive sees it) and then
// submit this L2 action with the resulting token id.
async function accountMint(tokenId) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["accountMint", tokenId],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function tradeNftMint(tokenId) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["tradeNftMint", tokenId],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function buyCardPack() {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["buyCardPack"],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function createLobby(
  creatorNftId,
  commitments = "",
  numOfRounds = 3,
  turnLength = 100,
) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    [
      "createdLobby",
      creatorNftId,
      commitments,
      numOfRounds,
      turnLength,
      false,
      false,
    ],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function joinLobby(nftId, lobbyID, commitments = "") {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["joinedLobby", nftId, lobbyID, commitments],
    effectstreamConfig,
    "wait-receipt",
  );
}

// Play a card. `move` is a serialized move string:
//   "end"                              — end your turn
//   "play+<handPosition>+<registryId>" — play a card from hand onto the board
async function submitMove(nftId, lobbyID, matchWithinLobby, roundWithinMatch, move) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["submittedMoves", nftId, lobbyID, matchWithinLobby, roundWithinMatch, move],
    effectstreamConfig,
    "wait-receipt",
  );
}

async function setTradeNftCards(tradeNftId, cards) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["setTradeNftCards", tradeNftId, cards],
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

async function fetchCards(nftId) {
  const res = await fetch(`${API_BASE}/cards/${nftId}`);
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

window.tradingCards = {
  connectBrowserWallet,
  connectLocalWallet,
  accountMint,
  tradeNftMint,
  buyCardPack,
  createLobby,
  joinLobby,
  submitMove,
  setTradeNftCards,
  closeLobby,
  fetchLobby,
  fetchOpenLobbies,
  fetchStats,
  fetchCards,
  fetchMyNfts,
  getWallet: () => wallet,
  getAddress: () => walletAddress,
  walletModes: WalletMode,
};

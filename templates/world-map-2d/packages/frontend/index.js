import {
  EffectstreamConfig,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@effectstream/wallets";
import { hardhat } from "viem/chains";

// Hardhat-deterministic address of the first deployed contract (Ignition).
// Replace with the deployed EffectstreamL2 address on real networks.
export const effectstreamConfig = new EffectstreamConfig(
  "world-map-2d",
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

async function joinWorld() {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["joinWorld"],
    effectstreamConfig,
    "wait-effectstream-processed",
  );
}

async function submitMove(x, y) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["submitMove", x, y],
    effectstreamConfig,
    "wait-effectstream-processed",
  );
}

async function submitIncrement(x, y) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["submitIncrement", x, y],
    effectstreamConfig,
    "wait-effectstream-processed",
  );
}

async function fetchUserStats() {
  if (!walletAddress) return null;
  const res = await fetch(
    `${API_BASE}/user_stats?wallet=${walletAddress.toLowerCase()}`,
  );
  if (!res.ok) return null;
  return await res.json();
}

async function fetchWorldStats() {
  const res = await fetch(`${API_BASE}/world_stats`);
  if (!res.ok) return [];
  return await res.json();
}

window.worldMap2D = {
  connectBrowserWallet,
  connectLocalWallet,
  joinWorld,
  submitMove,
  submitIncrement,
  fetchUserStats,
  fetchWorldStats,
  getWallet: () => wallet,
  getAddress: () => walletAddress,
  walletModes: WalletMode,
};

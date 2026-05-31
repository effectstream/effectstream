import {
  EffectstreamConfig,
  sendBatcherTransaction,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@effectstream/wallets";
import { hardhat } from "viem/chains";

// Hardhat-deterministic address of the first deployed EffectstreamL2 contract
// (Ignition). Replace with the deployed address on a real network.
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const BATCHER_URL = "http://localhost:3334";

// ⚠️ The first arg (securityNamespace) MUST equal the batcher's `namespace`
// ("web-2.5"), or batched submissions are rejected with 401 Invalid signature.
export const effectstreamConfig = new EffectstreamConfig(
  "web-2.5",
  "mainEvmRPC",
  CONTRACT_ADDRESS,
  hardhat,
  undefined,
  BATCHER_URL,
  // preferBatchedMode=false: the per-action calls below pick the path
  // explicitly, so the user can demo BOTH a direct submission and a batched one.
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

// changeName — DIRECT submission: the connected wallet signs and self-sequences
// the input straight to the EffectstreamL2 contract (the user pays gas).
async function changeName(name) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["changedName", name],
    effectstreamConfig,
    "wait-receipt",
  );
}

// gainExperience — BATCHED submission (the web2.5 gasless path): the input is
// signed and POSTed to the batcher's /send-input. The batcher pays gas and
// rolls it on-chain. XP is credited to the SIGNING wallet's record.
async function gainExperience(xp) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendBatcherTransaction(
    wallet,
    ["gainedExperience", Number(xp)],
    effectstreamConfig,
    "wait-effectstream-processed",
  );
}

async function fetchUser() {
  if (!walletAddress) return null;
  const res = await fetch(
    `${API_BASE}/api/user?wallet=${walletAddress.toLowerCase()}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.user ?? null;
}

async function fetchUsers() {
  const res = await fetch(`${API_BASE}/api/users`);
  if (!res.ok) return [];
  return await res.json();
}

window.web25 = {
  connectBrowserWallet,
  connectLocalWallet,
  changeName,
  gainExperience,
  fetchUser,
  fetchUsers,
  getWallet: () => wallet,
  getAddress: () => walletAddress,
  walletModes: WalletMode,
};

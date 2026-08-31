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
  "gamemaker",
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
  // Prefer EvmViem over EvmEthers: it takes a private key + RPC URL directly
  // and builds the viem WalletClient in-process — no browser extension, which
  // is what makes the headless Playwright e2e possible.
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

// gainedExperience: the single action ported from the v1 `gamemaker` game.
// `experience` is an integer 1..5 (v1 NumberParser(1, 5)); the signer's wallet
// is taken from the connected wallet on the node side.
async function gainExperience(experience) {
  if (!wallet) throw new Error("Connect a wallet first");
  const xp = Math.max(1, Math.min(5, Number(experience) || 1));
  return await sendTransaction(
    wallet,
    ["gainedExperience", xp],
    effectstreamConfig,
    // wait-receipt: confirm the chain has the tx; the indexer + DB update
    // arrive a beat later. The render() poll re-fetches and shows new XP.
    "wait-receipt",
  );
}

async function fetchUserState() {
  if (!walletAddress) return null;
  const res = await fetch(
    `${API_BASE}/user_state?wallet=${walletAddress.toLowerCase()}`,
  );
  if (!res.ok) return null;
  return await res.json();
}

window.gamemaker = {
  connectBrowserWallet,
  connectLocalWallet,
  gainExperience,
  fetchUserState,
  getWallet: () => wallet,
  getAddress: () => walletAddress,
  walletModes: WalletMode,
};

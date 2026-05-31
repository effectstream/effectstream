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
  "nft-lvlup",
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

// --- Write actions --------------------------------------------------------
// We use "wait-receipt": confirm the chain has the tx; the indexer + DB update
// arrive a beat later. The page re-fetches and shows the new state.

// Mint a character into the game state: nftMint|<tokenId>|<type>.
// In a real deployment the token id comes from buying the NFT through the sale
// contract (TypedNativeCharacterSale.buyCharacter); here the frontend submits
// the matching L2 action carrying the elemental type.
async function mintCharacter(tokenId, type) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["nftMint", tokenId, type],
    effectstreamConfig,
    "wait-receipt",
  );
}

// Level up a character you own: lvlUp|<tokenId>.
async function lvlUp(tokenId) {
  if (!wallet) throw new Error("Connect a wallet first");
  return await sendTransaction(
    wallet,
    ["lvlUp", tokenId],
    effectstreamConfig,
    "wait-receipt",
  );
}

// --- Read endpoints -------------------------------------------------------

async function fetchMyCharacters() {
  if (!walletAddress) return [];
  const res = await fetch(
    `${API_BASE}/characters?wallet=${walletAddress.toLowerCase()}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.characters ?? [];
}

async function fetchCharacter(tokenId) {
  const res = await fetch(`${API_BASE}/character/${tokenId}`);
  if (!res.ok) return null;
  return await res.json();
}

window.nftLvlUp = {
  connectBrowserWallet,
  connectLocalWallet,
  mintCharacter,
  lvlUp,
  fetchMyCharacters,
  fetchCharacter,
  getWallet: () => wallet,
  getAddress: () => walletAddress,
  walletModes: WalletMode,
};

import { EffectstreamConfig } from "@effectstream/wallets";
import { arbitrum, hardhat } from "viem/chains";

const BATCHER_URL = import.meta.env.VITE_BATCHER_URL ?? "http://localhost:3334";
const L2_ADDRESS = import.meta.env.VITE_L2_ADDRESS ?? "0x0000000000000000000000000000000000000000";
// Empty namespace — must match the batcher and the sync-side L2 primitive,
// which currently hardcodes namespace = null when reconstructing the signed
// message for verification.
const NAMESPACE = import.meta.env.VITE_NAMESPACE ?? "";
const CHAIN = import.meta.env.MODE === "mainnet" ? arbitrum : hardhat;

export const SOCIAL_WALLET_URL =
  import.meta.env.VITE_SOCIAL_WALLET_URL ?? "https://wallet.zkdojo.com/embed/";

export const paimaConfig = new EffectstreamConfig(
  NAMESPACE,
  "mainEvmRPC",
  L2_ADDRESS as `0x${string}`,
  CHAIN,
  undefined,
  BATCHER_URL,
  true,
);

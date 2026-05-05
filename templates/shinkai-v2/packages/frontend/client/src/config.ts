import { EffectstreamConfig } from "@effectstream/wallets";
import { hardhat } from "viem/chains";

const BATCHER_URL = import.meta.env.VITE_BATCHER_URL ?? "http://localhost:3334";
const L2_ADDRESS = import.meta.env.VITE_L2_ADDRESS ?? "0x0000000000000000000000000000000000000000";

export const paimaConfig = new EffectstreamConfig(
  "shinkai-v2",
  "mainEvmRPC",
  L2_ADDRESS as `0x${string}`,
  hardhat,
  undefined,
  BATCHER_URL,
  true,
);

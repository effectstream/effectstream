import { hardhat } from "viem/chains";
import { EffectstreamConfig } from "@effectstream/wallets";
import { BATCHER_URL } from "./config.ts";

export const paimaEngineConfig = new EffectstreamConfig(
  "",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  BATCHER_URL,
  true,
);

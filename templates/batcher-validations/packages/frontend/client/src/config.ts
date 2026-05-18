import { EffectstreamConfig } from "@effectstream/wallets";
import { hardhat } from "viem/chains";

export const paimaConfig = new EffectstreamConfig(
  "",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  "http://localhost:3334",
  true,
);

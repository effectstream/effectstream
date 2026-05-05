import { hardhat } from "viem/chains";
import { EffectstreamConfig } from "@effectstream/wallets";
export const paimaEngineConfig = new EffectstreamConfig(
  "",
  "mainEvmRPC",
  "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  hardhat,
  undefined,
  "http://localhost:3000/api",
  true,
);

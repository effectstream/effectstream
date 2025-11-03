import { hardhat } from "viem/chains";
import { PaimaEngineConfig } from "@paimaexample/wallets";
export const paimaEngineConfig = new PaimaEngineConfig(
  "",
  "mainEvmRPC",
  "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  hardhat,
  undefined,
  import.meta.env.VITE_BATCHER_URL,
  true,
);

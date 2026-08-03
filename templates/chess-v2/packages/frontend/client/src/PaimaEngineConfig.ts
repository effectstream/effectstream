import { hardhat } from "viem/chains";
import { EffectstreamConfig } from "@effectstream/wallets";
import { BATCHER_URL } from "./config.ts";

export const paimaEngineConfig = new EffectstreamConfig(
  // Must match BOTH the batcher's `namespace` and the node's
  // setSecurityNamespace(...). The sync-side L2 primitive re-verifies batched
  // signatures with getReadNamespaces(securityNamespace), which returns ONLY
  // the configured namespace — an empty value here makes every batched input
  // fail verification and get silently dropped.
  "chess-v2",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  BATCHER_URL,
  true,
);

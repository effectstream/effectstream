import { EffectstreamConfig } from "@effectstream/wallets";
import { hardhat } from "viem/chains";

export const paimaConfig = new EffectstreamConfig(
  // Must match BOTH the batcher's `namespace` and the node's
  // setSecurityNamespace(...). The sync-side L2 primitive re-verifies batched
  // signatures with getReadNamespaces(securityNamespace), which returns ONLY
  // the configured namespace — an empty value here makes every batched input
  // fail verification and get silently dropped.
  "batcher-validations",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  "http://localhost:3334",
  true,
);

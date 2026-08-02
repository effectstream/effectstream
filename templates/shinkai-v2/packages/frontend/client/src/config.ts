import { EffectstreamConfig } from "@effectstream/wallets";
import { arbitrum, hardhat } from "viem/chains";

const BATCHER_URL = import.meta.env.VITE_BATCHER_URL ?? "http://localhost:3334";
const L2_ADDRESS = import.meta.env.VITE_L2_ADDRESS ?? "0x0000000000000000000000000000000000000000";
// Must match BOTH the batcher's `namespace` and the node's
// `setSecurityNamespace(...)`. The sync-side L2 primitive re-verifies batched
// signatures with getReadNamespaces(securityNamespace), which returns ONLY the
// configured namespace — an empty value here makes every batched input fail
// verification and get silently dropped.
const NAMESPACE = import.meta.env.VITE_NAMESPACE ?? "shinkai-v2";
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

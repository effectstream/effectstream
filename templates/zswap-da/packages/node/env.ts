import { getEnv } from "@effectstream/utils/runtime";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";

export const CELESTIA_RPC_URL = getEnv("CELESTIA_RPC_URL") ?? "http://127.0.0.1:26658";
export const CELESTIA_NAMESPACE = getEnv("CELESTIA_NAMESPACE") ?? "000000000000deadbeef";
export const CELESTIA_FEE = parseInt(getEnv("CELESTIA_FEE") ?? "2000");
export const CELESTIA_GAS_LIMIT = parseInt(getEnv("CELESTIA_GAS_LIMIT") ?? "100000");
export const CELESTIA_AUTH_TOKEN = getEnv("CELESTIA_AUTH_TOKEN") ?? "";
export const CELESTIA_NETWORK = getEnv("CELESTIA_NETWORK") ?? "devnet";
export const CELESTIA_START_HEIGHT = getEnv("CELESTIA_START_HEIGHT");

// Local batcher endpoint for forwarding zswap blob submissions.
export const BATCHER_SUBMIT_URL = getEnv("BATCHER_SUBMIT_URL") ??
  `http://127.0.0.1:${getEnv("BATCHER_PORT") ?? "3334"}`;

// Sync poll cadence. Mainnet public gRPC endpoints rate-limit aggressively;
// 30s (≈2.5 blocks) is safe and cuts call volume ~5x vs the 6s devnet default.
export const CELESTIA_POLLING_INTERVAL_MS = parseInt(
  getEnv("CELESTIA_POLLING_INTERVAL_MS") ??
    (CELESTIA_NETWORK === "mainnet" ? "30000" : "6000"),
);

// celestia-node v0.30+ TxConfig. Each explicit field removes one consensus-gRPC
// call from the submit path. Leave unset to let the node auto-estimate.
const _gasPrice = getEnv("CELESTIA_GAS_PRICE");
const _gas = getEnv("CELESTIA_GAS");
const _maxGasPrice = getEnv("CELESTIA_MAX_GAS_PRICE");
const _txPriority = getEnv("CELESTIA_TX_PRIORITY");
export const CELESTIA_GAS_PRICE = _gasPrice ? parseFloat(_gasPrice) : undefined;
export const CELESTIA_GAS = _gas ? parseInt(_gas) : undefined;
export const CELESTIA_MAX_GAS_PRICE = _maxGasPrice ? parseFloat(_maxGasPrice) : undefined;
export const CELESTIA_TX_PRIORITY = _txPriority ? parseInt(_txPriority) : undefined;

// Offer lifetime before the TTL-cleanup scheduled input archives it.
//
// Shielded offers carry a Merkle-tree root in each `Input`/`Transient` and
// the Midnight node only retains recent roots (reference implementation:
// 1 hour). Once the referenced root ages out, the input fails with
// `UnknownMerkleRoot` at apply time — silently, with no event the indexer
// can observe. So we cap the default TTL to 1 hour to keep the active set
// in line with on-chain fillability.
//
// Caveats:
//   - The exact root-history window depends on the deployed ledger; tune
//     this for your network if the node configures something other than
//     the reference 3600s.
//   - Unshielded-only offers don't have this constraint and could live
//     longer; if you need that, split the TTL by offer kind.
//   - Makers should publish offers immediately after proving — the fill
//     window starts at the referenced root, not at publication.
export const OFFER_TTL_SECONDS = parseInt(
  getEnv("OFFER_TTL_SECONDS") ?? String(60 * 60),
);

export const midnightContract = (() => {
  try {
    return readMidnightContract("contract-offer-files", {
      baseDir: new URL("../contracts-midnight/", import.meta.url).pathname,
      networkId: midnightNetworkConfig.id,
    });
  } catch (error) {
    console.error("[Midnight contract read error]", error);
    return null;
  }
})();

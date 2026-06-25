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
// Concurrent fetcher knobs — see packages/sync celestia/fetcher.ts.
// stepSize controls how many blocks are batched per fetch window;
// concurrency controls how many heights are fetched in parallel within each window.
// Both default to values safe for Mocha-4 (~21 blocks/min with ~10% stalls).
export const CELESTIA_STEP_SIZE = parseInt(getEnv("CELESTIA_STEP_SIZE") ?? "200");
export const CELESTIA_FETCH_CONCURRENCY = parseInt(getEnv("CELESTIA_FETCH_CONCURRENCY") ?? "12");

// NTP / sync timing — override via env to adjust for a different network epoch.
export const BLOCK_TIME_MS     = parseInt(getEnv("BLOCK_TIME_MS")     ?? "600000");
export const NTP_STEP_SIZE     = parseInt(getEnv("NTP_STEP_SIZE")     ?? "1000");
export const NTP_START_TIME    = parseInt(getEnv("NTP_START_TIME")    ?? "1774400742000");
export const MIDNIGHT_DELAY_MS = parseInt(getEnv("MIDNIGHT_DELAY_MS") ?? "30000");

// Local batcher endpoint for forwarding zswap blob submissions.
export const BATCHER_SUBMIT_URL = getEnv("BATCHER_SUBMIT_URL") ??
  `http://127.0.0.1:${getEnv("BATCHER_PORT") ?? "3334"}`;

// Sync poll cadence. Mainnet public gRPC endpoints rate-limit aggressively;
// 30s (≈2.5 blocks) is safe and cuts call volume ~5x vs the 6s devnet default.
export const CELESTIA_POLLING_INTERVAL_MS = parseInt(
  getEnv("CELESTIA_POLLING_INTERVAL_MS") ??
    (CELESTIA_NETWORK === "mainnet"
      ? "30000"
      : CELESTIA_NETWORK === "mocha"
        ? "3000"
        : "6000"),
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
// A shielded offer is fillable only while the Merkle root its `Input`/`Transient`
// proves against is still in the node's retained root history; once that root
// ages out the input fails with `UnknownMerkleRoot` at apply time — silently,
// with no event the indexer can observe. So the TTL should track that
// root-history window to keep the active set in line with on-chain fillability.
//
// That window is **version-dependent**:
//   - current ledger release: ~1 hour (`Duration::from_secs(3600)`,
//     `zswap/src/ledger.rs:235-247`)
//   - next release: ~14 days (per Midnight release notes; not yet visible in
//     the reference checkout — re-verify when it lands)
// We default to **30 days** for headroom across releases (a too-short TTL
// archives still-fillable offers). Tune `OFFER_TTL_SECONDS` to your network:
// e.g. set ~3600 on a current 1h-window network so the indexer doesn't keep
// serving offers that can no longer settle.
//
// Caveats:
//   - The window bounds *proof freshness*, not coin age: a maker proves an
//     old coin against a recent root, so old coins are unaffected.
//   - Unshielded-only offers have no root window (a UTXO is valid until spent);
//     if you need them to live longer, split the TTL by offer kind.
//   - Makers should publish promptly after proving — the fill window starts at
//     the referenced root, not at publication.
export const OFFER_TTL_SECONDS = parseInt(
  getEnv("OFFER_TTL_SECONDS") ?? String(60 * 60 * 24 * 30),
);

// Midnight network id the offers are created against. Used as the `wellFormed`
// reference-state network (offer validation) — must match the network whose
// proofs the offers carry.
export const MIDNIGHT_NETWORK_ID = midnightNetworkConfig.id;

// Upper bound on a decoded offer transaction, in bytes. A DoS guard for the
// validator (the Celestia adapter separately caps the on-wire blob at 1.5 MB);
// set generously so legitimate proof-bearing offers are never rejected.
export const OFFER_MAX_BYTES = parseInt(
  getEnv("OFFER_MAX_BYTES") ?? String(1024 * 1024),
);

// TTL for unmatched nullifier/unshielded-spend rows (offer_matched=false).
// These accumulate when Midnight events arrive before the matching Celestia
// offer (early-arrival race), and also from Midnight-wide activity that will
// never be matched here (other tokens, other namespaces). Default 30 days
// matches the offer TTL; tune via env var.
export const SEEN_NULLIFIER_TTL_SECONDS = parseInt(
  getEnv("SEEN_NULLIFIER_TTL_SECONDS") ?? String(60 * 60 * 24 * 30),
);

// Retention window for the known-roots set used by the root-known liveness
// check: roots last seen older than this are pruned (mirroring the ledger's
// `past_roots`). Keep it ≥ the chain's on-chain root window or legitimate
// offers proving against an in-window-but-older root get falsely rejected.
// Default 14 days = the next-release window; on a current ~1h-window network
// set ~3600.
export const ROOT_WINDOW_SECONDS = parseInt(
  getEnv("ROOT_WINDOW_SECONDS") ?? String(60 * 60 * 24 * 14),
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

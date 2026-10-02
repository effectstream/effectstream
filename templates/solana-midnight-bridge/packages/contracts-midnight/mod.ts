// @solana-midnight-bridge/contracts-midnight — the Midnight side of the bridge.
//
// TODO(PR-2 T2.1) bridge.compact (compactc 0.35.0, --feature-zkir-v3) with
//   scripts/fetch-compactc.sh (SHA-256 pins) and scripts/pin-contract-runtime.mjs,
//   which rewrites the compiled module's import to the
//   `@midnight-ntwrk/compact-runtime-0.20` alias declared in package.json;
//   `src/managed/` stays gitignored; the 7 launchMidnight scripts.
// TODO(PR-2 T2.2) deploy.ts (local devnet + stagenet) writing the `midnight`
//   section of deployments/<mode>.json.
// TODO(PR-2 T2.3) signing.ts (mintDigest via the contract's pure circuit).
//
// Until then this package only carries the runtime alias, so link.sh and
// scripts/check-runtime-alias.ts can prove the alias survives the single-copy
// WASM step (sub-plan T0.2).
export {};

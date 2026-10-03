// @solana-midnight-bridge/contracts-midnight — the Midnight side of the bridge.
//
// - contract-bridge/src/bridge.compact: compactc 0.35.0, --feature-zkir-v3,
//   witness-free; `mintFromSolana` is authorized in-circuit by the operator's
//   Solana Ed25519 signature, `lockForSolana` burns a bridge-colour coin.
// - scripts/compile.sh: fetch-compactc.sh (SHA-256 pins) + compile with keys +
//   pin-contract-runtime.mjs (the `@midnight-ntwrk/compact-runtime-0.20` alias).
// - contract.ts: the compiled module, its ContractState (0.20 alias) and its
//   contract-info.json (read raw by the relayer's MidnightAdapter).
// - signing.ts: the mint message (via the contract's pure `mintDigest`) and the
//   Ed25519 signature argument.
// - network.ts / wallets.ts: endpoints, two provers, seeds (dev seeds local only).
// - deploy.ts: local devnet + stagenet deploy, writing the `midnight` section
//   of deployments/<mode>.json.
//
// The seven `launchMidnight` scripts live in package.json; the contract prover
// (9.0.0-rc.8) has its own `midnight-contract-prover:*` pair.
export * from "./contract.ts";
export * from "./signing.ts";
export * from "./network.ts";
export * from "./wallets.ts";

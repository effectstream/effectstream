export const API_BASE = import.meta.env.VITE_API_URL ?? "";
export const EVM_RPC = import.meta.env.VITE_EVM_RPC || "http://localhost:8545";
export const CHAIN_ID = 31337;

// 1 ETH ≈ 8500 ADA
export const ETH_TO_ADA_RATE = 8500;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MOCK_USDC_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

// Hardhat account #1 (not #0 which is the deployer/owner)
export const LOCAL_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

// Hardhat account #0 — deployer/owner of the launchpad + EffectstreamL2 contracts.
// Used by the admin page to sign EffectstreamL2 admin commands (create/end campaign, set product).
export const ADMIN_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

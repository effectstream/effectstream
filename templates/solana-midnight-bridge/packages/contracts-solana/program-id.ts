// Constants shared by the instruction builders, the scripts, the state machine
// and the tests. Byte values must match programs/bridge/src/lib.rs.
import { Buffer } from "node:buffer";

/**
 * Pubkey of `keypair/bridge-program.json`: the LOCAL-ONLY dev program keypair
 * the local validator preloads (`bpfPrograms`), so the address is stable across
 * local runs. Its secret is committed, so it must never own anything on a real
 * cluster: `scripts/deploy-devnet.ts` deploys the same `.so` under a fresh
 * program id and writes that id to `deployments/devnet.json`.
 */
export const LOCAL_BRIDGE_PROGRAM_ID =
  "2bqN4ePY9kHSyHkSxhc8WTdRDfpk9BGThCAqGoh6cagf" as const;

/** Instruction discriminants (first data byte). */
export const IX_INITIALIZE = 0;
export const IX_LOCK = 1;
export const IX_RELEASE = 2;
/** `LockToContract`: a lock whose Midnight recipient is a contract (plan 00058 Interfaces I-2). */
export const IX_LOCK_TO_CONTRACT = 3;

/** Instruction data lengths, tag byte included. */
export const IX_INITIALIZE_LEN = 33;
export const IX_LOCK_LEN = 73;
export const IX_RELEASE_LEN = 17;
export const IX_LOCK_TO_CONTRACT_LEN = 41;

/** PDA seeds. */
export const CONFIG_SEED = Buffer.from("config");
export const AUTHORITY_SEED = Buffer.from("authority");
export const VAULT_SEED = Buffer.from("vault");
export const RELEASE_SEED = Buffer.from("release");

/** Account sizes. */
export const CONFIG_LEN = 76;
export const RECEIPT_LEN = 49;

/** The Midnight recipient carried by Lock: coin public key ‖ encryption public key. */
export const MIDNIGHT_RECIPIENT_LEN = 64;

/** The Midnight contract address carried by LockToContract (its 32 raw bytes). */
export const MIDNIGHT_CONTRACT_LEN = 32;

/** Every bridge `msg!` line starts with this (after `Program log: `). */
export const BRIDGE_LOG_PREFIX = "EFFECTSTREAM_BRIDGE";

/** Decimals of the test mint `init-local.ts` / `deploy-devnet.ts` create. */
export const TEST_MINT_DECIMALS = 6;

/** Custom error codes (`custom program error: 0x<n>` / `{ Custom: n }`). */
export const BridgeError = {
  InvalidInstruction: 1,
  AlreadyInitialized: 2,
  NotInitialized: 3,
  InvalidAccount: 4,
  Unauthorized: 5,
  AlreadyReleased: 6,
  ZeroAmount: 7,
  MintMismatch: 8,
  NonceOverflow: 9,
  /** LockToContract with an all-zero contract address. */
  InvalidRecipient: 10,
} as const;

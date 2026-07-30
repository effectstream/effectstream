// Pubkey of keypair/counter-program.json, loaded by the validator via
// `--bpf-program` so the address is stable across local-dev runs. For mainnet,
// replace this (and the keypair) with the `solana program deploy` address.
import { Buffer } from "buffer";

export const COUNTER_PROGRAM_ID =
  "8veT8XVnBxG6kmq27CrCgznCtVHLJsBAqGHZrodKaRJ6" as const;

/** Discriminant bytes — must match the Rust program. */
export const DISCRIMINANT_INCREMENT = 0;
export const DISCRIMINANT_RESET = 1;

/** PDA seed used for the counter account. */
export const COUNTER_SEED = Buffer.from("counter");

/**
 * Fixed program id for the e2e test program. Derived from
 * `Keypair.fromSeed(new Uint8Array(32).fill(11))` so it is reproducible, and
 * declared in `programs/test_event/src/lib.rs` via `declare_id!`. The validator
 * loads the .so at this address with `--bpf-program`, so no program keypair
 * needs to exist (let alone be committed).
 */
export const TEST_EVENT_PROGRAM_ID =
  "7v54NWdBtkjuAFJrLGsS2SXnuk8nKam81mZJeeYxVFi9";

/** The only instruction: emit an event carrying a u64 value. */
export const DISCRIMINANT_EMIT = 0;

/** Log prefix the program emits. Keep in sync with lib.rs. */
export const EVENT_PREFIX = "E2E_SOLANA_EVENT";

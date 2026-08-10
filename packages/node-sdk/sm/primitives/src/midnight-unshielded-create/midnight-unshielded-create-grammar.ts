import { Type } from "@sinclair/typebox";

/**
 * BREAKING (by owner decision, 2026-08-09): this payload is a NOTIFICATION, not a data copy.
 *
 * The primitive fires when a transaction at a block height carries (or may carry) unshielded UTXO
 * creations. The rows themselves — owner, intentHash, outputIndex, value, tokenType — are NOT
 * duplicated into the state machine's inputs: they live in the source of record (an UmbraDB chain
 * archive), and a state-transition function that needs them queries it on demand via
 * `UmbraRead.getUnshieldedCreates(txHash)` (same-machine Postgres).
 *
 * Why notify-only: copying the decoded rows into every STM input duplicates the archive into
 * effectstream's own database and freezes the payload shape against the source's evolution. A
 * trigger plus an on-demand read keeps ONE copy of the data, and preserves the only invariant the
 * migration is built around — the state machine is triggered exactly when data exists at a height.
 */
export const midnightUnshieldedCreateGrammar = [
  [
    "payload",
    Type.Object({
      /** Hash of the transaction that has (or may have) created unshielded UTXOs. */
      txHash: Type.String(),
    }),
  ],
] as const;

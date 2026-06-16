import type { LedgerState, UnprovenTransaction } from "@midnight-ntwrk/ledger-v8";

// Why an offer is rejected. Ordered roughly cheap → expensive in the pipeline.
export type OfferRejectCode =
  | "BAD_ENCODING"
  | "TOO_LARGE"
  | "BAD_DESERIALIZE"
  | "WRONG_TX_VARIANT"
  | "NO_SPENDABLE_INPUT"
  | "NOT_A_SWAP"
  | "UNKNOWN_TOKEN"
  | "PROOF_INVALID"
  | "SIGNATURE_INVALID"
  // Liveness — supplied by the caller's async checks against the node's
  // ingested sets / the indexer; see ValidateOpts. ROOT_UNKNOWN means the
  // input's merkle root is not a real recent chain root (fabricated or aged
  // out); ROOT_UNREADABLE means the root could not be extracted (fail-closed).
  | "NULLIFIER_SPENT"
  | "UTXO_SPENT"
  | "UTXO_UNKNOWN"
  | "ROOT_UNKNOWN"
  | "ROOT_UNREADABLE"
  | "DUPLICATE";

// An unshielded UTXO an offer spends, identified the same way the
// `midnight-unshielded-spend` consumption event identifies it: the maker's
// address (derived from the input's SignatureVerifyingKey), the intent hash,
// and the output index. All hex fields are lowercase, no `0x` prefix.
export interface UnshieldedSpendRef {
  owner: string;
  intentHash: string;
  outputNo: number;
}

// A give/want leg derived from the transaction's per-segment imbalances.
// `token` is the lowercase token color (RawTokenType hex); `amount` is a
// non-negative decimal string (the absolute imbalance for that direction).
export interface OfferLeg {
  token: string;
  amount: string;
}

export interface OfferValidation {
  ok: boolean;
  code?: OfferRejectCode;
  reason?: string;

  // Populated whenever deserialization (step 3) succeeds, so a caller can
  // perform its own async liveness using the derived nullifiers/triples even
  // when the verdict is ok.
  tx?: UnprovenTransaction;
  nullifiers?: string[];
  unshieldedSpends?: UnshieldedSpendRef[];
  gives?: OfferLeg[];
  wants?: OfferLeg[];
  identifiers?: string[];
  // Canonical hex (== indexer zswapMerkleTreeRoot form) of each shielded
  // input's merkle root. Populated once crypto passes; a caller checks these
  // against its known-roots set for the root-known liveness check.
  inputRoots?: string[];
}

export interface ValidateOpts {
  // Reference ledger state for `Transaction.wellFormed`. Use
  // `getBlankRefState(networkId)` unless you have a real state to pass.
  refState: LedgerState;
  // Deterministic block timestamp for `wellFormed` time checks. In the STM use
  // `new Date(data.blockTimestamp)`; in request/response paths `new Date()`.
  tblock: Date;
  // Max decoded transaction size in bytes.
  maxBytes: number;

  // Optional SYNCHRONOUS liveness checks. Provide these only when a sync check
  // is available (unit tests with in-memory sets; callers that pre-fetched).
  // Async callers (the STM via World.resolve, submit via pg, the batcher via
  // the indexer) should instead leave these unset and run liveness themselves
  // on the returned `nullifiers` / `unshieldedSpends`, reusing the
  // NULLIFIER_SPENT / UTXO_SPENT codes.
  isNullifierSpent?: (nullifierHex: string) => boolean;
  isUnshieldedSpent?: (ref: UnshieldedSpendRef) => boolean;
  // Existence checks (same sync-vs-async note as above): UTXO ever created;
  // input's merkle root is a known recent chain root. Reuse UTXO_UNKNOWN /
  // ROOT_UNKNOWN in the async caller path.
  isUnshieldedCreated?: (ref: UnshieldedSpendRef) => boolean;
  isKnownRoot?: (rootHex: string) => boolean;
  // Optional dedup hook (e.g. already-indexed nullifiers/identifiers).
  seen?: (nullifiers: string[], identifiers: string[]) => boolean;
}

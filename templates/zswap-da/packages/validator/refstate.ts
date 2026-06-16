import { LedgerState, WellFormedStrictness } from "@midnight-ntwrk/ledger-v8";

// Reference state for `Transaction.wellFormed`. The security-critical
// `stateless_check` (ZK proof + signature verification) is STATE-INDEPENDENT —
// it uses bundled verifier keys and never reads state content — so a blank
// state verifies proofs exactly like a real one. With `enforceBalancing=false`
// and `enforceLimits=false` (below), the only parts of `ref_state` consulted
// are the network id (we pass the matching one) and a couple of network
// parameters (the weak TTL check's `global_ttl`, and a tolerated fee
// computation), all of which a blank state carries at the network defaults.
//
// RISK / fallback: if a real offer is rejected by `wellFormed` against a blank
// state (e.g. its TTL/params disagree with the blank defaults), construct a
// state from real `LedgerParameters` instead — the indexer exposes
// `block.ledgerParameters`. Verify empirically with a real proven-offer
// fixture (see packages/validator/fixtures/README.md) before relying on this.
const blankCache = new Map<string, LedgerState>();

export function getBlankRefState(networkId: string): LedgerState {
  let state = blankCache.get(networkId);
  if (!state) {
    state = LedgerState.blank(networkId);
    blankCache.set(networkId, state);
  }
  return state;
}

// Strictness for an OPEN (intentionally unbalanced) ZSwap offer. Every flag is
// set explicitly — do NOT rely on constructor defaults.
//
//   enforceBalancing = false  ← CRITICAL: open offers are unbalanced by design;
//                               true rejects every legitimate offer.
//   verifyNativeProofs = true ← verify the zswap input/output/transient ZK
//                               proofs (this is what rejects forged coins).
//   verifyContractProofs = true
//   verifySignatures = true
//   enforceLimits = false     ← the ledger byte-limit check reads a blank-state
//                               parameter; we cap size ourselves via maxBytes,
//                               so leave it off to avoid that dependency.
export function buildStrictness(): WellFormedStrictness {
  const s = new WellFormedStrictness();
  s.enforceBalancing = false;
  s.verifyNativeProofs = true;
  s.verifyContractProofs = true;
  s.verifySignatures = true;
  s.enforceLimits = false;
  return s;
}

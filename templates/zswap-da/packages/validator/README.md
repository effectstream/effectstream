# @zswap-da/validator

Shared, pure ZSwap offer validation. One deterministic routine,
`validateZswapOffer`, used by both trust points:

- **Ingestion** — the `celestia-zswap` state-machine handler, so the indexer
  never serves an invalid offer.
- **Pre-submission** — `/api/zswap/submit` and the batcher's Celestia adapter
  `validateInput` hook, so we never pay a Celestia fee for an offer that can't
  settle.

The module has no I/O of its own: callers supply the reference state, block
timestamp, and (optionally) liveness checks.

## Pipeline (`validate.ts`)

1. `BAD_ENCODING` — bech32m `zswapoffer1…` + `decodeOffer`
2. `TOO_LARGE` — decoded size ≤ `maxBytes`
3. `BAD_DESERIALIZE` — `Transaction.deserialize("signature","proof","binding")`
4. structural — `NO_SPENDABLE_INPUT` / `NOT_A_SWAP` / `UNKNOWN_TOKEN`
5. **crypto** — `Transaction.wellFormed` (`enforceBalancing=false`; verifies the
   ZK proofs + signatures). Rejects forged/made-up coins. State-independent, so
   a blank `LedgerState` suffices (see `refstate.ts`).
6. liveness (optional) — `NULLIFIER_SPENT` / `UTXO_SPENT`
7. dedup (optional) — `DUPLICATE`

On success it returns the derived `nullifiers / unshieldedSpends / gives /
wants / identifiers` so callers don't re-parse.

## Liveness

Implemented: cryptographic validation (`wellFormed`) plus nullifier- and
unshielded-spent checks against the node's permanent spent-sets, so an offer
spending an already-consumed coin is rejected. Not yet implemented: **root-known**
(rejecting offers proven against a fabricated or aged-out Merkle root) — until
then it is bounded by `OFFER_TTL_SECONDS` (set to track the on-chain root
window) plus the fact that such an offer can never settle.

`scripts/check-preview-indexer.ts` confirms (against the public preview indexer)
that the on-chain fields these checks rely on exist and are populated:

```bash
bun packages/validator/scripts/check-preview-indexer.ts        # preview
```

## Tests

`bun test packages/validator`. Encoding/size/structural + config + derive logic
run with synthetic data. The cryptographic tests need a **real proven offer** —
drop one into `fixtures/valid-offer.bech32` to activate them (see
[fixtures/README.md](./fixtures/README.md)).

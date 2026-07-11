# Validator test fixtures

The structural + encoding tests run with synthetic data. The **cryptographic**
tests (`wellFormed` proof verification, the blank-refState behavior,
tampered-proof, liveness) need a **real proven offer** — ZK proofs cannot be
synthesized — and are `skip`ped when no fixture exists here.

## Regenerating `valid-offer.bech32` (headless)

With the local dev environment running (`bun run dev` — midnight node +
indexer + proof server):

```bash
bun packages/tests/make-offer-fixture.ts
```

The script builds the devnet genesis wallet via the same facade the batcher
uses, creates an intentionally-unbalanced swap with `initSwap` (the headless
equivalent of Lace's `makeIntent`), proves + binds it through the proof server,
validates the blob with `@zswap-da/validator` (blank reference state), and
writes it here. No browser or Lace needed.

Alternatively, a Lace-made offer from the frontend (`SwapInterface` →
`makeIntent`) can be saved here directly.

If the offer's Midnight network is not `undeployed`, set
`ZSWAP_TEST_NETWORK_ID=<network>` when running `bun test packages/validator`
so the reference state matches.

`valid-offer.bech32` is committed — it is a public, intentionally-unbalanced
open offer for a throwaway devnet coin and contains no secrets.

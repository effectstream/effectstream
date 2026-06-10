# Validator test fixtures

The structural + encoding tests run with synthetic data. The **cryptographic**
tests (`wellFormed` proof verification, the blank-refState risk, tampered-proof,
liveness) need a **real proven offer** — ZK proofs cannot be synthesized — so
they are `skip`ped until a fixture exists here.

## To activate the crypto tests

1. Make a real offer with Lace via the frontend (the normal flow:
   `SwapInterface` → `makeIntent` produces a `<signature, proof, binding>`
   transaction, encoded as a `zswapoffer1…` bech32m string).
2. Save that string (no trailing newline matters; it's trimmed) to:

   ```
   packages/validator/fixtures/valid-offer.bech32
   ```

3. If the offer's Midnight network is not `undeployed`, set the env var when
   running tests so the reference state matches:

   ```
   ZSWAP_TEST_NETWORK_ID=testnet bun test packages/validator
   ```

`valid-offer.bech32` should be committed once captured — it is a public,
intentionally-unbalanced open offer and contains no secrets.

## Capturing during e2e

The orchestrator e2e brings up the Midnight proof server + node + indexer. A
real offer produced during that run can be copied here to lock in a regression
fixture for the crypto path.

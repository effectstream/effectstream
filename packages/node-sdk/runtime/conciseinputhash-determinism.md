# Bug Report: non-deterministic `effectstream_tx_hash` (`conciseInputHash`)

**Package:** `@effectstream/node-sdk` — runtime
**Location:** `runtime/src/process-blocks.ts` (scheduled-input loop, STEP 5)
**Severity:** Medium — silent cross-node state divergence in a derived column; not (currently) consensus-relevant
**Status:** Open

---

## Summary

When the runtime records the result of a **scheduled** STF input, it fabricates the
`effectstream_tx_hash` with `Math.random()`. The value is therefore different on every run
and on every node, so two nodes that replay the exact same source blocks produce **different
`rollup_input_result.effectstream_tx_hash` values** for the same input. For a framework whose
core promise is "the database is a pure function of the source blocks," this is a determinism
hole.

## The code

`runtime/src/process-blocks.ts`, inside the loop over `scheduledData` (STEP 5):

```ts
const conciseInputHash = `0x${
  Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")
}`;
yield* until(
  insertGameInputResult.run({
    id: data.id,
    success,
    effectstream_tx_hash: Buffer.from(conciseInputHash),
    index_in_block,
    block_height: value.blockNumber,
  }, dbConn),
);
```

This runs only for **scheduled** inputs (engine-queued timers / derived inputs that have no
real on-chain transaction), so the engine has to synthesize a hash. It does so randomly.

## Why it matters / why it's currently masked

- **Block hash is unaffected.** `generateEffectstreamBlockHash` (`@effectstream/crypto`) hashes
  `blockInfo[].blockHash` (source-chain hashes) + the previous block hash — never
  `effectstream_tx_hash`. So the block-hash chain stays deterministic; the divergence is
  confined to the `rollup_input_result.effectstream_tx_hash` column and anything that reads it.
- **Masked in tests.** The reproduction tests use a no-op STF (`stateMachinePayload: null`),
  which schedules no STF inputs, so this branch never executes. That is exactly why
  `consistency-snapshot.ts` lists `effectstream_tx_hash` in `VOLATILE_COLUMNS` and excludes it
  — the snapshot would otherwise diff on every run once real STFs are involved.

## Two existing quirks to fix alongside

1. **Encoding bug.** `Buffer.from(conciseInputHash)` is given the *string* `"0x" + 64 hex`
   with no encoding, so it stores 66 **UTF-8** bytes, not the 32 decoded bytes. Whatever
   derivation replaces `Math.random()`, encode it deliberately (`Buffer.from(hex, "hex")`, or
   commit to the `0x`-string form consistently).

2. **Ordering prerequisite (the real root).** The hash inputs that give uniqueness
   (`index_in_block`, and the STF execution order itself) are only deterministic if the
   `scheduledData` order is deterministic. Today it is not fully:
   ```ts
   // TODO What should be the order of the scheduled data - per id?
   const scheduledData = [...scheduledData1, ...scheduledData2];
   ```
   - `scheduledData1` (block-scheduled) is `ORDER BY id ASC` → deterministic given a
     deterministic scheduling history.
   - `scheduledData2` (timestamp-scheduled) is `ORDER BY future_ms_timestamp ASC` **only** —
     **same-timestamp rows have no tiebreak**, so their order is arbitrary.

   This is bigger than the hash: the same order drives **STF execution** and the
   **`randomGenerator` (Prando) draw sequence**. If it isn't pinned, game state itself can
   diverge; the random tx-hash is just the most visible symptom.

## Suggested fixes (in order)

### 1. Pin the scheduled-input order (prerequisite, do first)
Give the queries a total deterministic sort and a deterministic merge:
- timestamp list → `ORDER BY future_ms_timestamp ASC, id ASC` (break ties by `id`);
- keep block-scheduled before timestamp-scheduled (or merge both by a single deterministic
  key). This is required for deterministic STFs regardless of the hash, and it makes
  `index_in_block` deterministic.

### 2. Derive the hash deterministically (recommended)
Replace `Math.random()` with a content-addressed hash over the input's identity + position,
reusing the `sha512` already used for the block hash:

```
effectstream_tx_hash =
  sha512(block_height ‖ index_in_block ‖ input_data ‖ from_address ‖ from_address_type)
```

- `block_height` + `index_in_block` give **uniqueness** (one result per position; needs fix #1).
- `input_data` + `from_address` + `from_address_type` make it **content-addressed**
  (tx-hash-like, collision-resistant). All are non-null columns already on the scheduled row.

### Alternatives considered
- **Reuse the seeded `Prando` (`new Prando(blockHash)`):** smallest change and deterministic,
  but the shared `randomGenerator` is also consumed by the STFs — drawing hash bytes from it
  would shift the RNG stream every later STF sees. Would require a *separate*
  `new Prando(blockHash + ":txhash")`. Produces opaque (non-content) hashes.
- **`H(data.id, block_height)`:** `id` is a global SERIAL counter — a weaker determinism
  guarantee than the block-scoped `index_in_block`, and `block_height` adds nothing once `id`
  is unique. Prefer `index_in_block`.
- **Provenance: `H(origin_tx_hash, …)`:** ties to the originating real tx, but
  `origin_tx_hash` is `null` for timestamp-scheduled inputs, so it needs a fallback.

## Verification
- Add a determinism test with a **real** STF (one that schedules a derived input) and assert
  two from-scratch syncs produce identical `rollup_input_result.effectstream_tx_hash` —
  i.e. drop `effectstream_tx_hash` from `VOLATILE_COLUMNS` once fixed and confirm
  `consistency.test.ts` Test A still passes.
- Cover the timestamp-tie case explicitly: schedule ≥2 inputs at the same `future_ms_timestamp`
  and assert identical ordering / hashes across runs.

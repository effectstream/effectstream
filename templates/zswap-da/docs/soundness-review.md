# ZSwap-DA Offer Indexer — Soundness Review

A review of the `zswap-da` template's offer-file indexer: the component that
tracks published ZSwap offers and decides whether each is still **open** or has
been **consumed/expired**, by watching on-chain nullifiers.

References point into two trees:

- **Template (under review):** `pe-bun-4/templates/zswap-da/**` and the shared
  SDK at `pe-bun-4/packages/node-sdk/**`.
- **Midnight reference (ground truth for ledger semantics):**
  `midnight-ref-ai/midnight-ledger/**` (notably `zswap/src/` and
  `coin-structure/src/coin.rs`) and `midnight-ref-ai/midnight-ledger/spec/zswap.md`.

---

## Pipeline under review

1. An offer (an unbalanced partial transaction) is published to Celestia as a
   bech32m `zswapoffer1…` blob.
2. `celestia-zswap` state transition decodes it, stores the offer plus the
   **nullifiers of its shielded inputs**, and schedules a TTL cleanup
   (`packages/node/state-machine.ts:146`).
3. The Midnight sync decodes every `ZswapInput` (nullifier-spend) ledger event
   (`packages/node-sdk/sync/src/sync-protocols/midnight/fetcher.ts:181`,
   `.../midnight/zswap-decoder.ts:96`).
4. `midnight-nullifier` matches the consumed nullifier to a stored offer and
   archives it as `CONSUMED` (`packages/node/state-machine.ts:74`,
   `packages/database/sql/queries.sql:87`).

## Verdict

The core mechanism is **sound for an open-vs-closed order book**, and the
nullifier encoding matches end-to-end (both sides produce lowercase hex, no
`0x`). But there is one hard bug and several correctness gaps that make the
"canceled or not" guarantee unreliable.

| # | Severity | Title |
|---|----------|-------|
| 1 | **HIGH** | A nullifier can back multiple offers, but the schema forbids it |
| 2 | **HIGH** | "Consumed" conflates *filled* and *canceled* |
| 3 | MEDIUM | Only guaranteed-segment inputs are indexed (fallible + transients missed) |
| 4 | MEDIUM | Offer TTL (7 days) ≫ ledger Merkle-root window (~1 h) |
| 5 | MEDIUM | Early-nullifier race across the Celestia/Midnight streams |
| 6 | MEDIUM | Archiving is destructive with no reorg/un-archive path |
| 7 | LOW–MEDIUM | Hand-rolled `event[v9]` decoder; native path is a stub |

## What is *correct* today (so it isn't lost in fixes)

- **Encoding matches.** Offer side normalizes with `bytesOrStringToHex` →
  lowercase hex, no `0x` (`state-machine.ts:253`); consumption side produces the
  same via `bytesToHex` (`zswap-decoder.ts:118`) wired into `payload.nullifier`
  (`fetcher.ts:203`). The strings compare equal.
- **Active query excludes archived.** Archived offers are `DELETE`d from
  `offer_file` and moved to history; `GetOfferFiles` reads only `offer_file`
  (`queries.sql:45`, `:167`).
- **Per-coin semantics are right in principle.** Archiving on *any* input
  nullifier is correct: a single consumed input kills the whole offer, because
  the ledger rejects the merged transaction on the first repeated nullifier
  (`midnight-ref-ai/midnight-ledger/zswap/src/ledger.rs:81-84`).

---

## 1 — A nullifier can back multiple offers, but the schema forbids it

**Severity: HIGH (correctness bug, not just a gap)**
**Components:** `packages/database/migrations/000-init.sql`, `packages/database/sql/queries.sql`, `packages/node/state-machine.ts`

### Summary

A single shielded coin (UTXO) can legitimately appear as an input in **more than
one** offer — e.g. a maker posts `A→NIGHT` and, separately, `A→USDC` both
spending the same coin, intending whichever fills first to win. In Midnight these
two offers carry the **same nullifier** for that shared coin and are mutually
exclusive. The indexer's data model cannot represent this: it assumes a nullifier
maps to exactly one offer. The result is that consuming a shared coin archives
only **one** of the offers; the rest stay "active" forever (until TTL), although
they are provably dead.

### Why the same coin yields the same nullifier (Midnight reference)

The nullifier is a deterministic hash of the coin's `Info` (nonce, type, value)
and the spender's secret evidence — nothing about the swap, output, or
counterparty enters it:

- `midnight-ledger/coin-structure/src/coin.rs:637` — `nullifier(&self, se)` = `persistent_hash("midnight:zswap-cn[v1]" ‖ Info ‖ sender_evidence)`.
- `midnight-ledger/coin-structure/src/coin.rs:581` — `Info { nonce, type_, value }`.
- `midnight-ledger/spec/zswap.md:51` — `CoinNullifier = Hash<(CoinInfo, ZswapCoinSecretKey)>`.

So two offers spending the same coin produce byte-identical nullifiers. The
ledger relies on exactly this to prevent double-spends — the first transaction to
land inserts the nullifier, the second is rejected:

- `midnight-ledger/zswap/src/ledger.rs:81-84` — `NullifierAlreadyPresent` on repeat.
- `midnight-ledger/zswap/src/ledger.rs:90` — insert on first spend.

Both offers are valid to publish; only one can ever execute. A correct indexer
must therefore archive **all** offers that reference a consumed nullifier.

### What the template does today

The store enforces a **global** uniqueness on the nullifier and silently drops
duplicates:

- `packages/database/migrations/000-init.sql:52` — `nullifier TEXT NOT NULL UNIQUE`.
- `packages/database/sql/queries.sql:59-66` — `InsertOfferFileNullifier … ON CONFLICT (nullifier) DO NOTHING`.

So the second offer's nullifier row is never written — its only link to the coin
is lost. Archival then matches a single row anyway:

- `packages/database/sql/queries.sql:87-92` — `matched AS (SELECT offer_file_id … WHERE nullifier = :nullifier! LIMIT 1)`.

The state-machine handler is written as though multiple offers are possible
(`archived[]`, "offer(s)", `archived[0]`), which makes the schema limitation a
latent inconsistency rather than an intentional design:

- `packages/node/state-machine.ts:74-91` — `midnight-nullifier` handler.

The **unshielded** path has the same shape via `UNIQUE (owner, intent_hash,
output_no)` + `ON CONFLICT DO NOTHING` + `LIMIT 1`
(`000-init.sql:61`, `queries.sql:82`, `queries.sql:171-178`).

### Impact

Concrete failure (the exact scenario from design review): wallet holds A-token
UTXOs `{10, 8, 2}`. Offer #1 `+20 A` spends all three; offer #2 `+2 A` spends the
`2` coin. They share nullifier `N(2)`.

- Only one of `{#1, #2}` wins the `offer_file_nullifiers` row for `N(2)`.
- When `N(2)` is consumed on chain, only that one offer is archived.
- The other remains in `offer_file` and is served by `GetOfferFiles`
  (`queries.sql:45`) as an **active** offer that can never be filled.

This is stale-order-book data surfaced through `GET /api/zswaps`.

### Recommended fix

1. Replace the global unique with a per-offer unique so the same nullifier can
   link to many offers:

   ```sql
   -- 000-init.sql
   CREATE TABLE offer_file_nullifiers (
       id SERIAL PRIMARY KEY,
       offer_file_id INTEGER NOT NULL REFERENCES offer_file(id) ON DELETE CASCADE,
       nullifier TEXT NOT NULL,
       UNIQUE (offer_file_id, nullifier)
   );
   CREATE INDEX idx_offer_file_nullifiers_nullifier ON offer_file_nullifiers (nullifier);
   ```

   ```sql
   -- queries.sql InsertOfferFileNullifier
   ... ON CONFLICT (offer_file_id, nullifier) DO NOTHING;
   ```

2. Drop `LIMIT 1` in `ArchiveOfferByNullifier` so **every** matched offer is
   moved to history, and return all archived ids.
3. In `state-machine.ts:74-91`, emit one `offer_consumed` event per archived id
   (iterate `archived`, not just `archived[0]`).
4. Apply the same change to the unshielded triple and `ArchiveOfferByUnshieldedSpend`.

---

## 2 — "Consumed" conflates *filled* and *canceled*

**Severity: HIGH (semantic — the indexer can't answer the question it's named for)**
**Components:** `packages/node-sdk/sync/.../midnight/zswap-decoder.ts`, `packages/node/state-machine.ts`, `packages/database/sql/queries.sql`

### Summary

The stated goal is to know whether an offer "has been canceled or not." The
indexer only observes **input nullifiers**. A nullifier is consumed in *both* of
these cases, and the indexer cannot tell them apart:

- **Filled** — a taker/batcher completed the swap; the maker's coin was spent
  *into the intended trade*.
- **Canceled** — the maker spent the coin in some unrelated transaction, so the
  offer can no longer be filled.

Both archive identically with `archive_reason = 'CONSUMED'`. So the indexer
answers "is this offer still open?" correctly, but **cannot** answer "was it
filled or canceled?".

### Why nullifiers alone can't distinguish the two (Midnight reference)

An offer's effect is split into a spend side (inputs → **nullifiers**) and a
receive side (outputs → **commitments**):

- `midnight-ledger/zswap/src/structure.rs:481-493` — `Offer { inputs, outputs, transient, deltas }`.
- `midnight-ledger/zswap/src/ledger.rs:90` — input application inserts a nullifier.
- `midnight-ledger/zswap/src/ledger.rs:104` — output application inserts a **commitment** (a different set).
- `midnight-ledger/spec/zswap.md:50-51` — commitment vs nullifier are distinct projections of the same coin.

The same input nullifier appears whether the maker's coin flowed into the
intended swap outputs or into entirely different outputs. The **only** on-chain
signal that disambiguates is whether the offer's intended **output commitments**
also landed in the same transaction — i.e. you must also watch commitments, not
just nullifiers.

### What the template does today

The decoder deliberately handles only `ZswapInput` (variant 0) and returns
`null` for `ZswapOutput` / commitments:

- `packages/node-sdk/sync/.../midnight/zswap-decoder.ts:96-119` — `decodeZswapInputEvent`.
- `:112-113` — `if (variant !== 0) return null;` (outputs ignored).

Archival hardcodes a single reason regardless of cause:

- `packages/database/sql/queries.sql:121` — `'CONSUMED'` (nullifier path).
- `packages/database/sql/queries.sql:207` — `'CONSUMED'` (unshielded path).
- `packages/database/sql/queries.sql:291` — `'TTL'` (timeout path).
- `packages/node/state-machine.ts:87` — emits `offer_consumed` with no fill/cancel flag.

There is **no explicit cancel operation** in the design; a "cancel" is simply the
maker spending the coin, which is indistinguishable from a fill at the nullifier
level.

### Impact

- If the product only needs an order book ("can I still take this offer?"), the
  current behavior is acceptable — treat `CONSUMED` as "no longer open."
- If the product needs to report fill-vs-cancel (settlement history, maker
  dashboards, fee accounting), the current data is insufficient and any such
  label derived from it would be wrong.

### Recommended fix (only if fill-vs-cancel is required)

1. Extend the decoder to also decode `ZswapOutput` commitments (variant 1) — the
   binary layout is already documented in the same file (`zswap-decoder.ts:71-78`).
2. At offer-index time, store the offer's expected output **commitments**
   alongside its nullifiers (derivable from `offerTx.guaranteedOffer.outputs`).
3. On consumption, classify: if the offer's expected commitment(s) appear in the
   same Midnight tx as the consumed nullifier → `FILLED`; otherwise → `CANCELED`.
4. Add a `FILLED` / `CANCELED` value to `archive_reason` and the
   `offer_consumed` event payload.

If only open/closed is required, **document** that `CONSUMED` means "no longer
fillable (filled or canceled — not distinguished)" so downstream consumers don't
over-read it.

---

## 3 — Only guaranteed-segment inputs are indexed (fallible + transients missed)

**Severity: MEDIUM**
**Components:** `packages/node/state-machine.ts`

### Summary

At offer-index time, the indexer extracts nullifiers from
`offerTx.guaranteedOffer.inputs` only. It does **not** read inputs in the
**fallible** offer (non-guaranteed segments), nor **transients** (coins created
and spent in the same transaction, which also carry a nullifier). Meanwhile the
Midnight fetcher emits a nullifier event for *every* `ZswapInput` in *any*
segment. So a shielded spend that lives outside `guaranteedOffer.inputs` will be
consumed on chain but was never stored — and the owning offer is never archived.

### What the template does today

```ts
// packages/node/state-machine.ts:249-251
const nullifiers: string[] = offerTx.guaranteedOffer
  ? offerTx.guaranteedOffer.inputs.map((input: any) => input.nullifier)
  : [];
```

This is inconsistent with the *imbalance* logic only a few lines above, which
deliberately unions guaranteed **and** fallible segments because offers can span
both:

- `packages/node/state-machine.ts:186-194` — builds `segmentIds` from `intents`, `fallibleOffer`, plus segment 0.
- `packages/node/state-machine.ts:189-190` — explicitly reads `offerTx.fallibleOffer`.

The consumption side is segment-agnostic — it records the nullifier from any
`ZswapInput` event:

- `packages/node-sdk/sync/.../midnight/fetcher.ts:187-189` — iterates all `tx.zswapLedgerEvents` and decodes each.
- `packages/node-sdk/sync/.../midnight/zswap-decoder.ts:118` — returns the nullifier regardless of `logicalSegment`.

The asymmetry (store: guaranteed inputs only; detect: all inputs everywhere) is
the bug.

### Why transients matter (Midnight reference)

A transient is a matched input+output in one transaction and carries its own
nullifier that is inserted into the nullifier set on application:

- `midnight-ledger/zswap/src/structure.rs:382` — `Transient { … pub nullifier: Nullifier … }`.
- `midnight-ledger/zswap/src/structure.rs:488` — `Offer.transient` is a first-class part of an offer.
- `midnight-ledger/zswap/src/ledger.rs:133-139` — `apply_transient` checks and inserts the transient nullifier.
- `midnight-ledger/spec/zswap.md:235-296` — transients section.

An offer constructed with a transient (or with shielded inputs placed in a
fallible segment) therefore has consumable nullifiers the indexer never saw.

### Impact

- Offers whose shielded inputs are not all in `guaranteedOffer.inputs` will not
  be archived when consumed → stale "active" entries until TTL.
- Severity is MEDIUM rather than HIGH because simple wallet-made swaps (Lace
  `makeIntent`) commonly place the spent coins in the guaranteed offer, so the
  common path works; the gap bites on multi-segment / transient-bearing offers.

### Recommended fix

Collect nullifiers from all input sources the ledger can consume:

```ts
const offersToScan = [offerTx.guaranteedOffer, offerTx.fallibleOffer]
  .filter(Boolean);
const nullifiers = offersToScan.flatMap((o: any) => [
  ...(o.inputs ?? []).map((i: any) => i.nullifier),
  ...(o.transient ?? []).map((t: any) => t.nullifier),
]);
```

(Verify the exact `ledger-v8` accessor names for `fallibleOffer` and
`transient`; the field shapes mirror the reference `Offer` struct.)

---

## 4 — Offer TTL (7 days) ≫ ledger Merkle-root window (~1 h)

**Severity: MEDIUM**
**Components:** `packages/node/env.ts`, `packages/database/migrations/000-init.sql`, `packages/node/state-machine.ts`

### Summary

An offer can become **unfillable without any nullifier ever being consumed**: a
`ZswapInput` is proved against a specific Merkle-tree root, and the node only
keeps recent roots. Once that root ages out of the node's history, the offer is
rejected with `UnknownMerkleRoot` — silently, with no event the indexer can
observe. The indexer's only backstop is its TTL, which defaults to **7 days**,
so an offer that died after roughly an hour is still advertised as active for a
week.

### What the template does today

- `packages/node/env.ts:37-39` — `OFFER_TTL_SECONDS` defaults to `7 * 24 * 60 * 60` (7 days).
- `packages/database/migrations/000-init.sql:26` — `ttl_seconds BIGINT NOT NULL DEFAULT 604800`.
- `packages/database/sql/queries.sql:29` — `COALESCE(:ttl_seconds, 604800)`.
- `packages/node/state-machine.ts:310-316` — schedules cleanup at `blockTimestamp + OFFER_TTL_SECONDS * 1000`.
- `packages/node/state-machine.ts:337-366` — `zswap-ttl-cleanup` archives with reason `TTL`.

So the active-vs-archived decision is driven by either a consumed nullifier or
this 7-day timer — nothing models the much shorter on-chain fillability window.

### Why an unspent offer can still be dead (Midnight reference)

A shielded input pins the root it was proven against, and application requires
that root to still be in the node's history:

- `midnight-ledger/zswap/src/structure.rs:215` — `Input.merkle_tree_root` is fixed in the input.
- `midnight-ledger/zswap/src/ledger.rs:73-78` — `apply_input` rejects with `UnknownMerkleRoot` if the root is not in `past_roots`.
- `midnight-ledger/zswap/src/ledger.rs:246-247` — `post_block_update` filters roots older than `Duration::from_secs(3600)` (≈ 1 hour) in the reference implementation.
- `midnight-ledger/spec/zswap.md:222-233` — root history is maintained with a TTL and pruned per block.

So the window to fill a published offer is bounded by the node's root-history
TTL, independent of whether the coin is still unspent.

> Note: the template runs against `@midnight-ntwrk/ledger-v8`, not this exact
> reference crate. The reference value is `3600s`; confirm the deployed node's
> configured root-history TTL and use that number.

### Impact

- `GET /api/zswaps` over-reports active offers: anything between
  (root-expiry ≈ 1 h) and (TTL = 7 days) is listed but cannot be filled.
- Takers waste proving/submission effort on offers that will fail
  `UnknownMerkleRoot` at the node.

### Recommended fix

1. Set `OFFER_TTL_SECONDS` to match the node's actual root-history window (with a
   small safety margin), rather than 7 days, for the shielded path.
2. Better: derive an effective expiry from the offer's input Merkle root — when
   indexing, record the root and treat the offer as expired once that root is no
   longer in the node's `past_roots` (poll the indexer/node for current roots).
3. Document that makers should publish offers immediately after proving, since
   the fill window starts from the referenced root, not from publication.

---

## 5 — Early-nullifier race across the Celestia/Midnight streams

**Severity: MEDIUM (verify against runtime ordering guarantees)**
**Components:** `packages/node/state-machine.ts`, `packages/node-sdk/sync/.../midnight/fetcher.ts`

### Summary

Offers arrive on one chain (Celestia) and consumption events on another
(Midnight), fed by two independent sync protocols. The `midnight-nullifier`
handler is **fire-and-forget**: if it runs before the offer has been inserted, it
finds nothing to archive, logs, and drops the event. When the offer is later
inserted it is stored as **active** and will never be archived — there is no
buffer of "seen but unmatched" nullifiers to reconcile against.

### What the template does today

```ts
// packages/node/state-machine.ts:79-85
const archived = yield* World.resolve(archiveOfferByNullifier, { nullifier });
if (archived.length === 0) {
  console.log("[MIDNIGHT] Nullifier not found in offer_file_nullifiers", nullifier);
  return;  // <-- dropped; no record kept
}
```

The two streams are produced separately:

- Offers: `celestia-zswap` (`packages/node/state-machine.ts:146`).
- Nullifiers: `midnight-nullifier` fed by `fetchNullifiers`
  (`packages/node-sdk/sync/.../midnight/fetcher.ts:181-212`).

Whether a nullifier can be processed before its offer depends entirely on how the
multi-chain runtime interleaves inputs from the two protocols (by block
timestamp, by a designated primary chain, etc.). That ordering policy lives in
the sync/runtime layer and was **not** confirmed in this review.

### When it can happen

- **Happy path is safe:** an offer must exist on Celestia before a batcher can
  read and fill it on Midnight, so wall-clock order is publish → fill.
- **Risk cases:**
  - Re-sync / replay where each chain is fetched in independent height ranges
    (`fetcher.ts:97-124` fetches a height range per call) and merged — if the
    merge is not strictly timestamp-ordered across chains, the Midnight fill can
    be replayed before the Celestia publish.
  - Clock skew between Celestia and Midnight block timestamps for near-
    simultaneous events.

### Impact

A filled (or canceled) offer whose nullifier event is processed before its
insert remains permanently "active" until its 7-day TTL — a stale, unfillable
order on `GET /api/zswaps`.

### Recommended fix

1. Persist unmatched nullifiers instead of dropping them: on
   `archived.length === 0`, upsert into a `seen_nullifiers (nullifier,
   first_seen_height)` table.
2. At offer-index time (`celestia-zswap`), after inserting nullifier rows, check
   `seen_nullifiers` for any of them and archive immediately if present.
3. Confirm and document the runtime's cross-chain input ordering. If it already
   guarantees global timestamp ordering and replay determinism, this race cannot
   occur and the fix above is belt-and-suspenders; if not, the fix is required.

---

## 6 — Archiving is destructive with no reorg / un-archive path

**Severity: MEDIUM (verify against sync confirmation depth)**
**Components:** `packages/database/sql/queries.sql`, `packages/node-sdk/sync/.../midnight/fetcher.ts`

### Summary

Archiving an offer is a destructive `DELETE FROM offer_file` that moves the row
into history. There is no inverse operation. If a nullifier or unshielded-spend
event is observed in a block that is later reorged out (Midnight or Celestia),
the offer has already been removed from the active set and cannot be restored —
it will be wrongly reported as consumed forever.

### What the template does today

All three archive queries end by deleting the live row:

- `packages/database/sql/queries.sql:167-169` — `ArchiveOfferByNullifier` → `DELETE FROM offer_file … RETURNING id`.
- `packages/database/sql/queries.sql:253-255` — `ArchiveOfferByUnshieldedSpend` → same.
- `packages/database/sql/queries.sql:337-339` — `ArchiveOfferByIdTtl` → same.

The history tables have no "un-archive" / restore query, and the live table has
no `status` column that could be toggled back:

- `packages/database/migrations/000-init.sql:67-109` — history tables are insert-only mirrors.

The fetcher reads blocks by height range and returns them for processing; the
confirmation-depth / finality policy that decides when a height is safe to act on
is in the base fetcher / runtime, which was **not** reviewed here:

- `packages/node-sdk/sync/.../midnight/fetcher.ts:72-152` — `readData` fetches `[from..to]` and emits outputs.

### Why this matters (Midnight reference)

Archival is triggered by observing a `ZswapInput` nullifier event
(`fetcher.ts:181-212`). Nullifier insertion is a ledger state change that is only
final once the block is final:

- `midnight-ledger/zswap/src/ledger.rs:90` — nullifier inserted on input application.
- `midnight-ledger/zswap/src/ledger.rs:235-250` — root/state updates happen during block processing; a reorg replaces that processing.

Acting on a non-final block means acting on state that can be rolled back.

### Impact

- A reorg that drops the consuming transaction leaves the offer permanently
  archived as `CONSUMED`, even though on the canonical chain it is still open and
  fillable.
- Because the model is delete-then-insert-history (not a reversible status
  flag), recovery requires manual intervention or a full resync.

### Recommended fix

1. Only archive from **finalized** blocks. Confirm the sync layer's confirmation
   depth / finality handling for both Midnight and Celestia and ensure archive-
   triggering events are only processed once final.
2. Prefer a reversible model: replace the hard `DELETE` with a `status`
   (`ACTIVE` / `CONSUMED` / `EXPIRED`) column plus `consumed_at_height`, so a
   rollback handler can revert an offer to `ACTIVE`. Keep `GetOfferFiles`
   filtered to `status = 'ACTIVE'`.
3. If the runtime already provides rollback hooks for reorged inputs, wire an
   un-archive query into them.

---

## 7 — Hand-rolled `event[v9]` decoder; native path is a stub

**Severity: LOW–MEDIUM (silent failure mode, version-fragile)**
**Components:** `packages/node-sdk/sync/.../midnight/zswap-decoder.ts`

### Summary

Nullifier detection depends on a hand-written byte parser for the Midnight ledger
event format, pinned to the literal tag `midnight:event[v9]:` with hardcoded
field offsets. The intended "native" decoder that would use the ledger library's
own deserializer is present but **stubbed to always return `null`**. If the
ledger bumps its event tag version or layout, the parser silently produces wrong
bytes (or nothing), no nullifier matches, and **no offer is ever archived** —
with no error surfaced.

### What the template does today

The active decoder parses bytes by hand:

- `packages/node-sdk/sync/.../midnight/zswap-decoder.ts:80` — `const OUTER_TAG = "midnight:event[v9]:";` (used as a fixed 19-byte prefix length).
- `:71-78` — hardcoded layout comment (32-byte tx hash, 2-byte LE segments, SCALE variant, 4-byte contract id, 32-byte nullifier).
- `:96-119` — `decodeZswapInputEvent`: slices by these fixed offsets and returns the nullifier hex.
- `:112-113` — returns `null` for any non-`ZswapInput` variant.

The native alternative is a no-op stub:

```ts
// packages/node-sdk/sync/.../midnight/zswap-decoder.ts:4-23
// TODO This alternative implementation should be the native way to decode the event.
function new_decodeZswapInputEvent(rawHex: string): ledger.Event | null {
  try {
    const event = ledger.Event.deserialize(bytes);
    console.log("event", event);
    // ...all branches commented out...
  } catch { return null; }
  return null;   // <-- always null
}
```

It is wired into the only consumer here:

- `packages/node-sdk/sync/.../midnight/fetcher.ts:189` — `const decoded = decodeZswapInputEvent(event.raw);`

### Why it is fragile (Midnight reference)

The ledger versions every serialized type with an explicit tag, and these are
bumped across releases. Examples in the reference tree:

- `midnight-ledger/coin-structure/src/coin.rs:59` — `#[tag = "zswap-nullifier[v2]"]`.
- `midnight-ledger/zswap/src/structure.rs:212` — `#[tag = "zswap-input[v2]"]`.
- `midnight-ledger/zswap/src/ledger.rs:40` — `#[tag = "zswap-ledger-state[v5]"]`.

A `…[vN]` → `…[vN+1]` change to the event envelope (the parser assumes `event[v9]`)
or any field reordering breaks the offset math. Because the parser swallows
errors and returns `null` (`zswap-decoder.ts:120-122`), the failure is invisible:
the indexer keeps running, simply never archiving anything.

### Impact

- A ledger upgrade can turn the whole "canceled or not" feature into a no-op
  silently — every offer would look perpetually active until TTL.
- The manual SCALE/offset logic is also a correctness risk in its own right
  (e.g. the `readScaleU32` n-byte branch, the fixed 4-byte contract-id skip).

### Recommended fix

1. Switch to the library deserializer (`ledger.Event.deserialize`) and read
   `event.type === "ZswapInput"` / `event.nullifier`, replacing the hand parser
   — i.e. finish `new_decodeZswapInputEvent` and delete the manual path.
2. Until then, **version-guard**: assert the event tag matches the expected
   `event[vN]` and throw (or emit a loud metric) on mismatch instead of returning
   `null`, so an upgrade fails visibly rather than silently.
3. Add a regression test: a known event hex → expected nullifier, plus a
   `ZswapOutput` event → `null`, so a layout change is caught in CI.

---

## Appendix — consolidated source references

**Template (`pe-bun-4/templates/zswap-da/`)**

- `packages/node/state-machine.ts` — `:74-91` (midnight-nullifier), `:97-144` (unshielded), `:146-323` (celestia-zswap), `:186-194` (segment union), `:249-258` (nullifier extraction), `:310-316` (TTL schedule), `:337-366` (TTL cleanup).
- `packages/node/env.ts:37-39` — `OFFER_TTL_SECONDS`.
- `packages/database/migrations/000-init.sql` — `:26` (ttl default), `:49-53` (nullifiers table + UNIQUE), `:55-62` (unshielded table + UNIQUE), `:67-109` (history tables).
- `packages/database/sql/queries.sql` — `:45-54` (GetOfferFiles), `:59-66` (InsertOfferFileNullifier), `:71-82` (InsertOfferFileUnshieldedSpend), `:87-169` (ArchiveOfferByNullifier), `:171-255` (ArchiveOfferByUnshieldedSpend), `:257-339` (ArchiveOfferByIdTtl).
- `packages/node-sdk/sync/src/sync-protocols/midnight/fetcher.ts` — `:72-152` (readData), `:181-212` (fetchNullifiers), `:203` (payload.nullifier), `:214-244` (fetchUnshieldedSpends).
- `packages/node-sdk/sync/src/sync-protocols/midnight/zswap-decoder.ts` — `:4-23` (native stub), `:71-78` (layout), `:80` (event[v9] tag), `:96-123` (decodeZswapInputEvent).

**Midnight reference (`midnight-ref-ai/midnight-ledger/`)**

- `coin-structure/src/coin.rs` — `:59` (nullifier tag), `:581` (Info), `:637` (nullifier derivation).
- `zswap/src/ledger.rs` — `:40` (state tag), `:73-78` (UnknownMerkleRoot), `:81-90` (double-spend + insert), `:104` (output commitment), `:133-139` (apply_transient), `:235-250` (post_block_update / root TTL).
- `zswap/src/structure.rs` — `:212` (input tag), `:215` (Input.merkle_tree_root), `:382` (Transient.nullifier), `:481-493` (Offer), `:488` (Offer.transient), `:579-617` (merge).
- `zswap/src/verify.rs` — `:294-333` (offer balance / well-formed).
- `spec/zswap.md` — `:50-51` (commitment/nullifier defs), `:222-233` (root history), `:235-296` (transients), `:298-365` (offers + balancing).

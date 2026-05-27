---
slug: data-availability-part-2
title: "Data Availability Part 2: When to Use a DA Layer, and How to Index What You Posted"
authors: [effectstream]
tags: [celestia, avail, data-availability, indexing, zswap, technical]
---

[Part 1](/docs/blog/celestia-data-availability) walked through the Celestia integration as an architecture - the batcher, the funnel, the database, the demo UI. This second post is the document-the-subtleties counterpart: **when should you reach for a DA layer at all?** Both Avail and Celestia are first-class options in EffectStream - same primitive shape, different chains under the hood. Choosing between them, or choosing to skip the DA layer entirely, is the first design decision a team needs to make. After that, the second decision is how to **index** the data you posted, because a blob on a DA layer is useless to your application until something reads it back into PostgreSQL.

<!-- truncate -->

## Two DA options: Avail and Celestia

EffectStream ships generic DA primitives for both networks. They follow the same shape:

| Primitive type | Network | Posts to | Read primitive |
|---|---|---|---|
| `AVAIL:Generic` | [Avail](https://www.availproject.org/) | An Avail app ID (Substrate-based) | `availGenericGrammar` |
| `CELESTIA:Generic` | [Celestia](https://celestia.org/) | A Celestia namespace | `celestiaGenericGrammar` |

Both grammars are intentionally minimal:

```typescript
// celestia-generic-grammar.ts (avail-generic-grammar.ts is identical in shape)
export const celestiaGenericGrammar = [
  ["payload", Type.Object({ suppliedValue: Type.String() })],
] as const;
```

The primitive's job is to watch its DA layer and deliver each posted blob to the state machine as a `payload` event. What the blob *means* is up to your application - that's the part you index.

In practice, when do you pick which?

- **Avail** has Substrate ergonomics - useful if your team already runs Substrate infra or wants account-model semantics on the DA side.
- **Celestia** has the most mature blob-namespace model and a wide light-node ecosystem - useful if you want anyone to verify your data without trusting a full node.

Both are interchangeable at the EffectStream layer: same grammar, same state-machine handler shape, only the config changes.

## When a DA layer makes sense

Settlement chains (Cardano, Arbitrum, etc.) are expensive per byte and slow per block. They are the right home for: asset transfers, contract state, anything where censorship-resistance and finality are load-bearing for the *value* being moved. They are the *wrong* home for: high-volume, low-value data where speed isn't critical but you still need verifiability.

Three patterns where a DA layer is the right choice:

**1. Many small messages.** Game moves, chat lines, IoT sensor readings, application logs. Each individual record isn't worth a settlement-chain transaction, but together they're the bulk of your application's data. Post them as DA blobs at hundreds-to-thousands per minute, settle only the things that move value.

**2. Large blobs.** Generated assets, ZK proof artefacts, encoded media, sealed game replays. Anything over a few kilobytes that you don't want sitting in settlement-chain calldata. DA layers handle these cheaply - settlement chains do not.

**3. Cold storage with main-chain hashes.** When the data itself doesn't need to live on the settlement chain, but its *existence* does. Post the blob to Avail/Celestia, post only the blob's hash (and any commitment) to Cardano/EVM. Anyone can verify the hash matches and pull the body from DA on demand. This is the right pattern for "we promised to keep this immutable" data that nobody reads often.

The shared property: **speed is not the critical dimension**. If you need a record to be visible to the application within one block, DA is wrong - use the settlement chain (or your L2's mempool). DA is for "eventually-visible, cheaply, in volume."

## You must index what you posted

A blob on Celestia or Avail is just bytes. Your application doesn't see those bytes until the state machine reads the primitive's event and writes a row to PostgreSQL. **The indexer is the part of your application that turns blobs back into queryable state.**

The state-machine handler does three things on every DA event:

1. Decode the blob into a typed record.
2. Validate it (signature, sequence, schema).
3. Write it to one or more tables keyed by something useful to the application.

Here's the minimal shape, wired against the Celestia generic primitive:

```typescript
import { Stm } from "@effectstream/sm";
import { World } from "@effectstream/coroutine";
import { grammar } from "./grammar.ts";
import { insertDaRecord } from "@my-app/database";

const stm = new Stm<typeof grammar, {}>(grammar);

// "celestia-blobs" is the stateMachinePrefix declared in the primitive config.
stm.addStateTransition("celestia-blobs", function* (data) {
  const { suppliedValue } = data.parsedInput.payload;

  // 1. Decode - the blob is whatever your app posted (JSON, CBOR, protobuf...).
  let record: { kind: string; key: string; body: unknown };
  try {
    record = JSON.parse(suppliedValue);
  } catch {
    return; // malformed blob, skip
  }

  // 2. Validate - schema check, signature, idempotency, etc.
  if (!record.kind || !record.key) return;

  // 3. Index - one INSERT per blob keyed by something queryable.
  yield* World.resolve(insertDaRecord, {
    da_block_height: data.blockHeight,
    da_namespace: "celestia:my-app",
    record_kind: record.kind,
    record_key: record.key,
    record_body: JSON.stringify(record.body),
    posted_at: data.blockTimestamp,
  });
});
```

Swap `"celestia-blobs"` for `"avail-blobs"` and the handler is identical against the Avail primitive - that's the whole point of the matched grammar.

The table this writes to is the application's index:

```sql
CREATE TABLE da_records (
  id SERIAL PRIMARY KEY,
  da_block_height INTEGER NOT NULL,
  da_namespace TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_key TEXT NOT NULL,
  record_body TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_da_records_kind_key
  ON da_records(record_kind, record_key);
```

Now the application can `SELECT … WHERE record_kind = 'zswap' AND record_key = '0xabc...'` and get the blob body back, sorted by DA block height, without re-reading the DA layer.

The two things to get right at this layer are **idempotency** (each DA blob should produce the same row on replay - keep `(da_namespace, da_block_height, record_key)` unique) and **decode-failure tolerance** (a malformed blob shouldn't halt the state machine - log it, skip it, move on).

## Worked example: indexing ZSwap offers

[ZSwap](https://github.com/effectstream/effectstream/tree/v-next/bun-zswap-da) is the concrete case the M2 template demonstrates. ZSwap offers are short JSON records - wallet, token in, token out, amounts, nonce, signature - typically a few hundred bytes each. A busy ZSwap market generates thousands of offers per hour. Three properties matter:

- Each offer is small (a few hundred bytes).
- The volume is high (orders of magnitude more than settlement-chain capacity).
- The data must be decentralised - offers are public, fillable by any participant, with no privileged operator.

A traditional settlement chain is the wrong home: per-byte cost is prohibitive at that volume. A centralised database is wrong for a different reason: any operator can censor offers. A DA layer is the right answer - every offer is publicly retrievable, cheap, and anyone with the namespace can verify the full offer book by reading directly from Celestia or Avail.

The `bun-zswap-da` template applies the indexing pattern above against a richer schema. Offers, batches, and settlement state each get their own table; the DA handler decodes blobs into offer records and writes them; settlement-chain events on the EVM side mark offers as filled or expired. The on-chain footprint is one batch reference per N offers; the rest is on the DA layer.

```typescript
// State-machine slice from bun-zswap-da, simplified
stm.addStateTransition("zswap-offer", function* (data) {
  const offer = parseZswapOffer(data.parsedInput.payload.suppliedValue);
  if (!offer || !isSignatureValid(offer)) return;

  yield* World.resolve(insertOffer, {
    offer_id:        offer.id,
    wallet:          offer.wallet,
    token_in:        offer.tokenIn,
    token_out:       offer.tokenOut,
    amount_in:       offer.amountIn.toString(),
    amount_out:      offer.amountOut.toString(),
    da_block_height: data.blockHeight,
    da_namespace:    "celestia:zswap",
    status:          "open",
  });
});
```

The query surface on top of this is straightforward - "show me all open ZSwap offers for this token pair" becomes a single indexed `SELECT`, even though the underlying data lives on Celestia (or Avail) rather than in the application's own write path.

## When NOT to use a DA layer

The mirror-image of the three patterns above:

- **One transaction is enough.** If your application generates handful of records per hour and each one moves value, the settlement chain is simpler - no DA layer to keep healthy, no indexer to maintain, no extra namespace to fund.
- **Real-time visibility is required.** DA layers have their own block time and the indexer adds further delay. If a user needs to see a record reflected in application state within one settlement-chain block, DA is the wrong tool.
- **The data is private.** DA layers are *public*. A private payload still needs a settlement-side mechanism (encryption, ZK commitments) - DA alone gives you availability, not confidentiality.

The decision tree is short:

> *Is the data high-volume, low-individual-value, and verifiable rather than hidden?* If yes, DA. If no, settle on the main chain or look at L2/ZK.

## Wrap-up

DA layers are a sharp tool, not a free upgrade. They unlock workloads that were previously stuck between "too expensive for settlement" and "too important for a private database" - but only if the data has a clear indexing strategy and a use-case where availability matters more than instant visibility. The same primitive abstraction in EffectStream covers both Avail and Celestia, so the architectural decision is whether to use DA at all; the network choice is a tactical one you can change later.

---

- [Part 1: Celestia Data Availability - the integration architecture](/docs/blog/celestia-data-availability)
- [`bun-zswap-da` template (Celestia DA worked example)](https://github.com/effectstream/effectstream/tree/v-next/bun-zswap-da)
- [Avail Generic primitive source](https://github.com/effectstream/effectstream/tree/v-next/packages/node-sdk/sm/primitives/src/avail-generic)
- [Celestia Generic primitive source](https://github.com/effectstream/effectstream/tree/v-next/packages/node-sdk/sm/primitives/src/celestia-generic)

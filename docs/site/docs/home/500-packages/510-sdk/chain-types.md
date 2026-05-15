---
title: "@effectstream/chain-types"
description: "Chain-specific type definitions for EffectStream"
sidebar_label: "chain-types"
---

<!-- Generated from packages/effectstream-sdk/chain-types/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/chain-types`](https://www.npmjs.com/package/@effectstream/chain-types)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/chain-types)

Shared types and deterministic hash helpers that describe an EffectStream
block, its inputs, and its timers. Used internally by sync, runtime, and
state-machine packages so every component agrees on the wire format.

## Install

```bash
bun add @effectstream/chain-types
# or
npm install @effectstream/chain-types
```

## Standalone usage

The hash helpers are pure functions over plain data. You can use them to
verify or reconstruct EffectStream block / input / timer hashes outside the
node — handy for off-chain indexers, dashboards, or proof systems.

```typescript
import {
  genV1BlockHeader,
  hashBlockV1,
  hashRollupInput,
} from "@effectstream/chain-types";

const header = genV1BlockHeader(
  {
    blockHash: "abcd...",          // 64-hex source-chain block hash
    blockHeight: 42,
    msTimestamp: 1715731200_000,
  },
  /* prevBlockHash */ null,
  /* successfulTxs */ ["tx-1"],
  /* failedTxs */ [],
);

const blockHashHex = hashBlockV1.hash(header);

// Hash a rollup input the way the runtime does.
const inputHashHex = hashRollupInput.hash({
  caip2Prefix: "eip155:1" as any,
  txHash: "deadbeef...",
  indexInBlock: 0,
});
```

## Inside EffectStream

These shapes describe what flows between the sync, state-machine, and
database layers: `IntrinsicPrimitive` / `ExtrinsicPrimitive` for events,
`PostExecutionBlockHeader<V>` for blocks, `RollupInputHashInfo` for inputs,
`TimerHashInfo` for scheduled triggers. Keep the package as a tight types
layer with zero behavior — the only function is the hashing.

## Key exports

Hashing:

- `genV1BlockHeader(mainChainInfo, prevBlockHash, successfulTxs, failedTxs)` — assemble a `PostExecutionBlockHeader<1>` from the source-chain metadata and tx outcomes.
- `hashTransactions`, `hashBlockV1`, `hashRollupInput`, `hashTimerData` — `{ preHash, hash }` pairs. `preHash` returns the canonical string; `hash` returns `keccak256(preHash(input))`.

Types (selection):

- `IntrinsicPrimitive`, `ExtrinsicPrimitive`, `BasePrimitive`, `PrimitiveCommon` — event/primitive shapes.
- `PreExecutionBlockHeaderV1`, `PostExecutionBlockHeader<V>`, `BlockVersions` — block header types per version.
- `RollupInputHashInfo`, `TimerHashInfo` — payloads for the corresponding hashers.
- `InputDataString`, `NonceString`, `ScheduleTrigger` — small wire types.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/effectstream-sdk/chain-types/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/chain-types
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/chain-types

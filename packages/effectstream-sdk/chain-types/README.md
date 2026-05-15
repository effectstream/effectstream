# @effectstream/chain-types

Type definitions and deterministic hash helpers for EffectStream blocks,
rollup inputs, and timer triggers. Re-exported through
[`@effectstream/node-sdk/chain-types`](https://www.npmjs.com/package/@effectstream/node-sdk).
Use it to compute EffectStream block / input / timer hashes off-chain —
for example, in an external indexer, a proof system, or a verifier.

## Install

```bash
bun add @effectstream/chain-types
# or
npm install @effectstream/chain-types
```

## Standalone usage

Pure functions over plain data — no runtime dependency on the rest of
EffectStream.

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

const inputHashHex = hashRollupInput.hash({
  caip2Prefix: "eip155:1" as any,
  txHash: "deadbeef...",
  indexInBlock: 0,
});
```

## Inside EffectStream

A small types package. The hashing helpers exist so an off-chain
reconstruction of an EffectStream block matches what the node would
compute — useful as a stable schema reference and verifier kit.

## Key exports

- `genV1BlockHeader(mainChainInfo, prevBlockHash, successfulTxs, failedTxs)` — assembles a `PostExecutionBlockHeader<1>`.
- `hashTransactions`, `hashBlockV1`, `hashRollupInput`, `hashTimerData` — `{ preHash, hash }` pairs. `preHash` returns the canonical string; `hash` returns `keccak256(preHash(input))`.
- Types: `PostExecutionBlockHeader<V>`, `PreExecutionBlockHeaderV1`, `BlockVersions`, `RollupInputHashInfo`, `TimerHashInfo`, `IntrinsicPrimitive`, `ExtrinsicPrimitive`, `BasePrimitive`, `PrimitiveCommon`, plus small wire types (`InputDataString`, `NonceString`, `ScheduleTrigger`).

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/chain-types
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/chain-types

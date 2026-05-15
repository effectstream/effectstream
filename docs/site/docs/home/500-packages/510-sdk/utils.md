---
title: "@effectstream/utils"
description: "Shared utilities for the EffectStream framework"
sidebar_label: "utils"
---

{/* Generated from packages/effectstream-sdk/utils/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/utils`](https://www.npmjs.com/package/@effectstream/utils)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/utils)

Shared utilities for the EffectStream framework — chain-aware address types,
TypeBox schemas, concurrency primitives, and small helpers. No runtime
dependency on the rest of EffectStream; safe to use standalone in any
TypeScript project.

## Install

```bash
bun add @effectstream/utils
# or
npm install @effectstream/utils
```

## Standalone usage

The biggest reason to depend on this package outside EffectStream is the
chain-aware address validators and the `AddressType` enum, which lets you
normalize "which chain is this address from?" across EVM, Cardano,
Substrate, Algorand, Mina, Midnight, Avail, Polkadot, and NEAR.

```typescript
import { AddressType, AddressValidator } from "@effectstream/utils";
import { Value } from "@sinclair/typebox/value";

const addr = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

// Returns true when `addr` is well-formed for the given chain.
const isEvm = Value.Check(AddressValidator[AddressType.EVM], addr);
```

Also useful on its own:

- **`binarySearch(arr, target, toNum)`** — left-most index whose value is `>= target`.
- **`TypeboxHelpers.Evm.Address`**, `.Cardano.Address`, `.Midnight.Address`, … — TypeBox schemas you can compose into your own message validators.
- **Concurrency primitives** (`conditionVariable`, `countdownLatch`, `retry`, `then`) built on top of [Effection](https://frontside.com/effection).

## Inside EffectStream

`@effectstream/utils` is the bottom-of-stack package — `@effectstream/crypto`,
`@effectstream/concise`, `@effectstream/wallets`, `@effectstream/node-sdk` and
every chain integration depend on its address types, TypeBox helpers, and
concurrency utilities. If you find yourself rewriting an address validator,
look here first.

## Key exports

From `@effectstream/utils`:

- `AddressType` — enum of chain identifiers (EVM, CARDANO, SUBSTRATE, ALGORAND, MINA, MIDNIGHT, AVAIL, POLKADOT, NEAR).
- `AddressValidator` — `Record<AddressType, TSchema>` of TypeBox validators, one per chain.
- `AddressTypebox`, `AddressAndType` — tagged-union shapes for `{ type, address }` pairs.
- `TypeboxHelpers` — namespaced TypeBox schemas (e.g. `TypeboxHelpers.Evm.Address`, `TypeboxHelpers.Cardano.PolicyId`).
- `binarySearch(arr, target, toNum)` — left-most index where value `>= target`.
- `createViemPublicClient`, `truncateSelector` — viem-related helpers.
- `conditionVariable`, `countdownLatch`, `retry`, `then`, `tryYield` — Effection coroutine helpers.

Subpath entries:

- `@effectstream/utils/node-env` — `dotenv`-aware env loader, for Node-only callers.
- `@effectstream/utils/runtime` — Effection runtime helpers (re-exported from the main entry).
- `@effectstream/utils/runtime-spawn` — child-process spawn helpers built on Effection.

## Examples

Runnable examples: [`src/binary-search.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/effectstream-sdk/utils/src/binary-search.test.ts)
and [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/effectstream-sdk/utils/test/examples.test.ts). Both run as part of
`bun test ./packages`.

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/utils
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/utils

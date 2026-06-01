# @effectstream/utils

Shared utilities for the EffectStream framework - chain-aware address
types and validators, TypeBox schemas, Effection-based concurrency
primitives, viem helpers, and small type-level utilities. No runtime
dependency on the rest of EffectStream; safe to use standalone in any
TypeScript project.

This is the bottom-of-stack package: `@effectstream/crypto`,
`@effectstream/concise`, `@effectstream/wallets`, and most node packages
depend on it.

- Shared chain-aware types, TypeBox schemas, viem helpers, Effection primitives.
- Bottom-of-stack: `crypto`, `concise`, `wallets`, and most node packages depend on it.
- Safe to use standalone, no runtime dependency on the rest of Effectstream.
- `AddressType` is the most-imported symbol from the package (~170 cross-package references).

## Install

```bash
bun add @effectstream/utils
# or
npm install @effectstream/utils
```

## Standalone usage

The most useful exports for external consumers are the chain-aware
`AddressType` enum and the per-chain `TypeBox` schemas under
`TypeboxHelpers`. You can validate "which chain is this address from?"
across EVM, Cardano, Substrate, Algorand, Mina, Midnight, Avail,
Polkadot, and NEAR without depending on a runtime.

```typescript
import { AddressType, AddressValidator } from "@effectstream/utils";
import { Value } from "@sinclair/typebox/value";

const addr = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const isEvm = Value.Check(AddressValidator[AddressType.EVM], addr);
```

```typescript
import { TypeboxHelpers } from "@effectstream/utils";
import { Value } from "@sinclair/typebox/value";

// Compose your own schemas from chain-specific primitives.
Value.Check(TypeboxHelpers.Evm.Address, "0xab...");
Value.Check(TypeboxHelpers.Cardano.PolicyId, "abcd...");
```

## Inside EffectStream

A workhorse. `AddressType` is the most-imported symbol from this
package (~170 cross-package references); `TypeboxHelpers` and
`AddressAndType` are runners-up. Almost every chain integration, the
state machine, and the batcher pulls something from here.

## Key exports

Address types and validators:

- `AddressType` - enum of chain identifiers (EVM, CARDANO, SUBSTRATE, ALGORAND, MINA, MIDNIGHT, AVAIL, POLKADOT, NEAR).
- `AddressValidator` - `Record<AddressType, TSchema>` of TypeBox validators, one per chain.
- `AddressAndType` - tagged-union shape for `{ type, address }` pairs.

TypeBox schemas:

- `TypeboxHelpers.{Evm,Cardano,Substrate,Algorand,Mina,Midnight,Avail,Polkadot,Near}` - `.Address`, `.BlockHash`, `.TxHash`, `.Signature`, `.PrivateKey`, plus chain-specific extras (`PolicyId`, `AssetName`, `Selector`, …).
- Plain primitives: `TypeboxHelpers.Uint256`, `BlockNumber`, `AbsoluteSlotNumber`, `EpochNumber`.

Type aliases (heavily imported as nominal types):

- `WalletAddress`, `EvmAddress`, `Signature`, `EvmPrivateKey`, `BlockHash`, `BlockNumber`, `EffectstreamBlockHash`, `EffectstreamBlockNumber`, `TimestampMs`, `Caip2`, `HexString0x`, `HexStringNo0x`.

Type-level utilities (`./types/misc.ts`):

- `MergeIntersects<T>`, `ShallowMergeIntersects<T>`, `RemoveUnknown<T>`, `Satisfies<Base, T>`, `Mutable<T>`, `DeepMutable<T>`, `DeepReadonly<T>`, `UnionToIntersection<U>`, `TypeErrorMessage`, `ValueOf<T>`, `ElementOf<T>`.

Result + binary helpers:

- `Result<T>`, `narrowResult`, success/failure constructors.
- `hexStringToUint8Array`, `uint8ArrayToHexString`.

Decorators:

- `bound` - method-binding decorator (heavily used in classes that pass methods around).

Viem helpers:

- `createViemPublicClient(...)`, `truncateSelector(...)`.

Concurrency (Effection-based):

- `conditionVariable<T>()`, `tryYield(...)`, `retry(...)`.

Subpath entries:

- `@effectstream/utils/node-env` - `dotenv`-aware env loader, for Node-only callers.
- `@effectstream/utils/runtime` - Effection runtime helpers.
- `@effectstream/utils/runtime-spawn` - child-process spawn helpers built on Effection.

## Examples

Runnable: [`src/binary-search.test.ts`](./src/binary-search.test.ts),
[`src/concurrency/latch.test.ts`](./src/concurrency/latch.test.ts),
[`src/concurrency/retry.test.ts`](./src/concurrency/retry.test.ts), and
[`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/utils
- Source: https://github.com/effectstream/effectstream/tree/main/packages/effectstream-sdk/utils

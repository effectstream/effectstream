# @effectstream/crypto

Multi-chain signature verification - one API that verifies wallet signatures
from EVM, Cardano, Polkadot, Algorand, Mina, and Midnight. Also includes the
`Prando` seeded RNG used for on-chain-derived randomness.

- Multi-chain signature verification: EVM, Cardano, Polkadot, Algorand, Mina, Midnight.
- Bundles the `Prando` seeded RNG for on-chain-derived randomness.
- Used by the batcher to verify user-submitted input signatures.
- Only depends on `@effectstream/utils`; safe to use standalone.

## Install

```bash
bun add @effectstream/crypto
# or
npm install @effectstream/crypto
```

## Standalone usage

Any TypeScript app that lets users sign in with a wallet can use
`CryptoManager` to verify the signature server-side, without pulling in the
rest of EffectStream.

```typescript
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";

const evm = CryptoManager.getCryptoManager(AddressType.EVM);

const ok = await evm.verifySignature(
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  "Sign in to my dapp at 2026-05-14T00:00:00Z",
  "0x...the 130-hex-char signature...",
);

if (!ok) throw new Error("bad signature");
```

The same `CryptoManager` works for Cardano, Polkadot, Algorand, Mina, and
Midnight signatures - switch the `AddressType` and pass the chain-native
signature string.

### Deterministic randomness with Prando

`Prando` is a seeded RNG you can drive from any deterministic source (block
hash, transaction id, RNG-as-a-service result). Useful for on-chain games
that need verifiable shuffles or dice rolls.

```typescript
import { Prando } from "@effectstream/crypto";

const rng = new Prando(blockHash); // any string or number seed
const roll = rng.nextInt(1, 6);

// Re-seeding with the same value reproduces the same sequence.
const replay = new Prando(blockHash);
replay.nextInt(1, 6); // === roll
```

## Inside EffectStream

`@effectstream/crypto` is what the batcher uses to verify user-submitted
input signatures before accepting them into a batch, and what the state
machine uses to derive randomness from on-chain hashes
(`generateEffectstreamBlockHash`). It depends only on `@effectstream/utils`.

## Key exports

- `CryptoManager` - chain-aware factory. `CryptoManager.getCryptoManager(addressType)` returns an `IVerify`. Per-chain accessors: `CryptoManager.Evm()`, `.Cardano()`, `.Polkadot()`, `.Algorand()`, `.Mina()`, `.Midnight()`.
- `IVerify` - common interface: `verifyAddress`, `verifySignature`, `decodeAddress`.
- `Prando` - seeded deterministic RNG. `next()`, `nextInt(lo, hi)`, `nextString(n)`, `reset()`.
- `generateEffectstreamBlockHash` - block-hash helper used by the EffectStream runtime.

## Examples

Runnable examples: [`src/Prando.test.ts`](./src/Prando.test.ts) and
[`test/examples.test.ts`](./test/examples.test.ts). Both run as part of
`bun test ./packages`.

For end-to-end signature flows, see
[`e2e/evm/sync/batcher.test.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/evm/sync/batcher.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/crypto
- Source: https://github.com/effectstream/effectstream/tree/main/packages/effectstream-sdk/crypto

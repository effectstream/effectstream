# @effectstream/precompile

Generate deterministic EVM-sized (20-byte) addresses from string names by
hashing with keccak256. The intended use is "precompile" addresses —
synthetic 0x-addresses reserved by an EffectStream node for non-user
logic. Currently exposed for app authors; no internal package or template
in this monorepo imports it (the package exists as a stable namespace for
the pattern).

## Install

```bash
bun add @effectstream/precompile
# or
npm install @effectstream/precompile
```

## Standalone usage

Pure functions. Given a name, get an address. Same name, same address —
always.

```typescript
import { generatePrecompile, generatePrecompiles } from "@effectstream/precompile";

const addr = generatePrecompile("MY_FEATURE");
// addr === "0x<first-20-bytes-of-keccak256-of-MY_FEATURE>"

// Bulk-derive a typed map from a string enum.
enum MyNames {
  A = "feature-a",
  B = "feature-b",
}
const map = generatePrecompiles(MyNames);
// map["feature-a"] === generatePrecompile("feature-a")
// map["feature-b"] === generatePrecompile("feature-b")
```

The result is an EVM-shaped `0x[40 hex chars]` string, usable wherever
viem/ethers expects an `Address`.

## Inside EffectStream

Exported through `@effectstream/node-sdk/precompile` for app code. As of
v0.100.x, no package or template in this repo calls `generatePrecompile`
or `generatePrecompiles` — the package ships ready for use but the
pattern hasn't been adopted yet internally.

## Key exports

- `generatePrecompile(name: string): HexString0x` — `0x` + first 40 hex chars of `keccak256(name)`.
- `generatePrecompiles(names: Record<string, string>)` — bulk variant. Returns `{ [value]: address }`.

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/precompile
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/precompile

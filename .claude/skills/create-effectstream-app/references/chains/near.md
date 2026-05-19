# NEAR

`packages/contracts-near/` — Rust → WASM compiled contracts, deployed to a local NEAR sandbox.

> **See also (concept docs).**
> - **Note: docs are missing a top-level NEAR chain page** (`docs/site/docs/home/200-chains/` has no NEAR entry). Until one exists, this file is the primary reference.
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/near-sandbox.md`
> - NEAR primitives (NEP-141, NEP-171, NEP-245, intent, generic, account-watch): `docs/site/docs/home/100-components/118-primitives.md`

## Required `launchNear` package scripts

- `chain:start` — start NEAR sandbox
- `chain:wait` — wait until RPC is responsive

## Primitives

Sync protocol: `NEAR_RPC_PARALLEL`. Primitives:

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeNEARNEP141` | `builtinGrammars.nearNep141` | Fungible tokens |
| `PrimitiveTypeNEARNEP171` | `builtinGrammars.nearNep171` | NFTs |
| `PrimitiveTypeNEARNEP245` | `builtinGrammars.nearNep245` | Multi-tokens |
| `PrimitiveTypeNEARIntent` | `builtinGrammars.nearIntent` | DIP-4 intents |
| `PrimitiveTypeNEARGeneric` | `builtinGrammars.nearGeneric` | NEP-297 generic events |
| `PrimitiveTypeNEARAccountWatch` | `builtinGrammars.nearAccountWatch` | Function call tracking |

## Batcher adapters

- `NearAdapter` — standard NEAR transactions, time/size batching
- `NearIntentAdapter` — DIP-4 intents

## Orchestrator config

```ts
...launchNear("@my-template/contracts-near", {
  cwd: path.join(root, "packages/contracts-near"),
}),
```

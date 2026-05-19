# NEAR

`packages/contracts-near/` — Rust → WASM compiled contracts, deployed to a local NEAR sandbox.

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

# NEAR

`packages/contracts-near/` — Rust → WASM compiled contracts, deployed to a local NEAR sandbox.

> **See also (concept docs).**
> - **Note: docs are missing a top-level NEAR chain page** (`docs/site/docs/home/200-chains/` has no NEAR entry). Until one exists, this file is the primary reference.
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/near-sandbox.md`
> - NEAR primitives (NEP-141, NEP-171, NEP-245, intent, generic, account-watch): `docs/site/docs/home/100-components/118-primitives.md`

## Tools (probe before scaffolding)

| Tool | Required for | If missing |
|---|---|---|
| `bun` | All Effectstream work | Stop — install Bun before continuing. |
| Rust toolchain (`cargo`, `rustup target add wasm32-unknown-unknown`) | Compiling NEAR contracts to WASM | Stop and tell the user — without it, `bun run build:near` (or equivalent) can't produce the contract artifacts the sync node and tests depend on. |

The NEAR sandbox binary is vendored through `@effectstream/npm-near-sandbox` (no system install needed).

## Local dev environment

`launchNear` starts a NEAR sandbox node and exposes its RPC for the sync node to poll.

## Required `launchNear` package scripts

- `chain:start` — start the NEAR sandbox
- `chain:wait` — wait until RPC is responsive

## Sync protocol + primitives

Sync protocol: `NEAR_RPC_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeNEARNEP141` | `builtinGrammars.nearNep141` | Fungible tokens |
| `PrimitiveTypeNEARNEP171` | `builtinGrammars.nearNep171` | NFTs |
| `PrimitiveTypeNEARNEP245` | `builtinGrammars.nearNep245` | Multi-tokens |
| `PrimitiveTypeNEARIntent` | `builtinGrammars.nearIntent` | DIP-4 intents |
| `PrimitiveTypeNEARGeneric` | `builtinGrammars.nearGeneric` | NEP-297 generic events |
| `PrimitiveTypeNEARAccountWatch` | `builtinGrammars.nearAccountWatch` | Function call tracking |

## Batcher adapters

| Adapter | Batching criteria |
|---|---|
| `NearAdapter` | time, size |
| `NearIntentAdapter` | time, size — for DIP-4 intents |

## Orchestrator wiring

```ts
...launchNear("@my-template/contracts-near", {
  cwd: path.join(root, "packages/contracts-near"),
}),

{
  name: "sync",
  dependsOn: [DbNames.PGLITE_WAIT, NearNames.CHAIN_WAIT],
  // ...
},
```

## Sharp edges

(none documented — when you hit one, add it here)

## Frontend / wallet integration

NEAR has a mature browser-wallet story (NEAR Wallet, MyNearWallet, Meteor, Sender, etc.). The skill doesn't have an opinionated frontend pattern for NEAR yet — when scaffolding one, model it on the Cardano browser-wallet pattern in `references/frontend.md` (Fastify proxies + direct on-chain submission from the browser) rather than the EVM batcher pattern, since NEAR's gas model usually doesn't need batching.

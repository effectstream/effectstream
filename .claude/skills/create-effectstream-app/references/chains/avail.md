# Avail

`packages/contracts-avail/` — Avail DA layer configuration + deploy scripts. No smart contracts.

> **See also (concept docs).**
> - Avail chain overview: `docs/site/docs/home/200-chains/204-avail.md`
> - Per-package: `docs/site/docs/home/500-packages/530-chains/avail-contracts.md`
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/avail-node.md`, `docs/site/docs/home/500-packages/540-binaries/avail-light-client.md`

## Tools (probe before scaffolding)

(no extra system tools — `bun` is enough; both `avail-node` and `avail-light-client` are vendored through their `@effectstream/npm-avail-*` packages)

## Local dev environment

`launchAvail` starts an Avail node and a light client for syncing.

## Required `launchAvail` package scripts

- `avail-node:start` — start the Avail node
- `avail-light-client:start`, `avail-light-client:wait` — light client for syncing

## Sync protocol + primitives

Sync protocol: `AVAIL_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeAvailGeneric` | `builtinGrammars.availGeneric` | Application data submissions |

## Batcher adapters

(none — Avail is a DA layer, not a settlement/contract chain; submissions are direct)

## Orchestrator wiring

```ts
...launchAvail("@my-template/contracts-avail", {
  cwd: path.join(root, "packages/contracts-avail"),
}),

{
  name: "sync",
  dependsOn: [DbNames.PGLITE_WAIT, AvailNames.LIGHT_CLIENT_WAIT],
  // ...
},
```

## Sharp edges

(none documented — when you hit one, add it here)

## Frontend / wallet integration

Avail is a DA layer; the frontend pattern depends on whatever chain settles on top. Wire wallets via that settlement chain's reference (EVM via viem, Substrate via polkadot.js, etc.). Avail itself is read-only from the frontend's perspective in most use cases.

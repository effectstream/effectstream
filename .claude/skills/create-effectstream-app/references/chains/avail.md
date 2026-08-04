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

(Names verified against `packages/build-tools/orchestrator/scripts/launch-avail.ts`; earlier skill versions had the wrong light-client script name and would fail launcher validation.)

- `avail-node:start`, `avail-node:wait` — start the Avail node + wait for RPC
- `avail-light-client:deploy` — registers the app key + spawns the light client (NOT `:start`)
- `avail-light-client:wait` — wait for light client RPC

## Primitive config

`PrimitiveTypeAvailGeneric` requires THREE fields beyond the common ones — `appId`, `applicationKey`, and `genesisHash`. All three live in the per-`buildPrimitives` config. The `applicationKey` and `genesisHash` are written to `avail_app.json` by `avail-light-client:deploy` — read them at config-build time. Without them, the `ConfigBuilder` schema check fails before launch.

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

### Avail finality is ~60s — test timeouts must accommodate

`AVAIL_PARALLEL` typically uses `delayMs: 60000` (one minute) for confirmation. Phase B `assertSQL` should use ~240s budget. Defaults built for Hardhat (~20s) will time out before the first blob round-trips.

### First-boot binary download is slow

Both the Avail node and the light client download their binaries (~70MB each) from GitHub releases on first boot, then extract into `node_modules/@effectstream/npm-avail-*/vendor/`. This adds 30-60s per binary per platform. Subsequent boots are ~10s.

### Node WS RPC port is 9955, not the substrate-default 9944 (light client uses 7007)

The launcher overrides Avail's WS RPC port to 9955 (avoiding collisions with other substrate-based dev nodes). Include BOTH `9944` and `9955` in `killStalePorts()` defensively — older configs sometimes use 9944.

### `PrimitiveTypeAvailGeneric` only threads `suppliedValue` into the STM

Same pattern as Celestia/NEAR — the STM transition's `data.parsedInput` only contains `suppliedValue` (the blob bytes). `extrinsicIndex`, `(blockNumber, extrinsicIndex)` substrate coordinates, and any extrinsic-level metadata are NOT exposed. Subclass the primitive to surface them, or store invariant fields (`appId`) directly from config.

## Frontend / wallet integration

Avail is a DA layer; the frontend pattern depends on whatever chain settles on top. Wire wallets via that settlement chain's reference (EVM via viem, Substrate via polkadot.js, etc.). Avail itself is read-only from the frontend's perspective in most use cases.

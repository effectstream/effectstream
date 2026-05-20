# Celestia

`packages/contracts-celestia/` — Celestia DA layer config + bridge funding. No smart contracts and no dedicated `launchCelestia` helper; the node is expected to run externally.

> **See also (concept docs).**
> - Celestia chain overview: `docs/site/docs/home/200-chains/209-celestia.md`
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/celestia.md`

## Tools (probe before scaffolding)

(no extra system tools — `bun` is enough; the Celestia node itself is expected to be provided externally)

## Local dev environment

There is no `launchCelestia` helper. Bring the Celestia node up however suits the user (Docker Compose alongside the orchestrator, hosted node, etc.) and point the sync protocol at it. If a local node is needed inside the orchestrator, write a custom `ProcessConfig` entry — but most templates target a remote/shared node.

## Required `launchCelestia` package scripts

n/a — no launcher.

## Sync protocol + primitives

Sync protocol: `CELESTIA_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeCelestiaGeneric` | `builtinGrammars.celestiaGeneric` | Blob data events |

## Batcher adapters

(none — interact with Celestia directly; the batcher pattern doesn't apply to DA-layer writes)

## Orchestrator wiring

Since there's no launcher, add a custom process pointing at the external node:

```ts
{
  name: "celestia-wait",
  description: "Wait for the external Celestia node to respond",
  args: ["./scripts/wait-for-celestia.ts"],
  waitToExit: true,
  type: "system-dependency",
},
{
  name: "sync",
  // ...
  dependsOn: [DbNames.PGLITE_WAIT, "celestia-wait"],
},
```

## Sharp edges

(none documented — when you hit one, add it here)

## Frontend / wallet integration

n/a — Celestia DA isn't wallet-driven. Interact with the engine's GET API only.

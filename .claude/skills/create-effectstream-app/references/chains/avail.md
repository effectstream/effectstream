# Avail

`packages/contracts-avail/` — Avail DA layer configuration + deploy scripts (no smart contracts).

## Required `launchAvail` package scripts

- `avail-node:start` — start the Avail node
- `avail-light-client:start`, `avail-light-client:wait` — light client for syncing

## Primitive

`PrimitiveTypeAvailGeneric` via `builtinGrammars.availGeneric` — application data submissions. Sync protocol: `AVAIL_PARALLEL`.

## Orchestrator config

```ts
...launchAvail("@my-template/contracts-avail", {
  cwd: path.join(root, "packages/contracts-avail"),
}),
```

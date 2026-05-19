# Celestia

`packages/contracts-celestia/` — Celestia DA layer config + bridge funding (no smart contracts, no dedicated launcher).

> **See also (concept docs).**
> - Celestia chain overview: `docs/site/docs/home/200-chains/209-celestia.md`
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/celestia.md`

Sync protocol: `CELESTIA_PARALLEL`.

Primitive: `PrimitiveTypeCelestiaGeneric` via `builtinGrammars.celestiaGeneric` — blob data events.

There is no `launchCelestia` helper — the Celestia node is expected to be running externally (e.g. via Docker compose alongside the orchestrator, or pointed at a hosted node). Add a custom `ProcessConfig` if you need to start a local Celestia node from the orchestrator.

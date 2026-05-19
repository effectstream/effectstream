# Celestia

`packages/contracts-celestia/` — Celestia DA layer config + bridge funding (no smart contracts, no dedicated launcher).

Sync protocol: `CELESTIA_PARALLEL`.

Primitive: `PrimitiveTypeCelestiaGeneric` via `builtinGrammars.celestiaGeneric` — blob data events.

There is no `launchCelestia` helper — the Celestia node is expected to be running externally (e.g. via Docker compose alongside the orchestrator, or pointed at a hosted node). Add a custom `ProcessConfig` if you need to start a local Celestia node from the orchestrator.

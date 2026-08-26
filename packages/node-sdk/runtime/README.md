# @effectstream/runtime

The state-machine runtime - the loop that ties sync, state machine,
database, events, and HTTP API together inside an EffectStream node.
Boot it with `init()` then drive it with `start(config)` and your node
is up.

- The state-machine runtime that owns an Effectstream node's process model.
- `init()` once, `start(config)` to run; ties sync, state machine, DB, events, and HTTP API together.
- Used by every template.
- Also reachable through `@effectstream/node-sdk/runtime`.

## Install

```bash
bun add @effectstream/runtime
# or
npm install @effectstream/runtime
```

`@effectstream/runtime` is the canonical import for `init` and `start`,
used directly by every template. The same surface is also reachable
through `@effectstream/node-sdk/runtime` if you prefer the umbrella.

## Standalone usage

This package **owns the node's process model**. You don't pick parts of
it; you call `init()` once at boot and then `start(config)`. The config
brings together everything else:

`init()` and `start()` are Effection operations, so they must be
yielded inside an Effection `main()`:

```typescript
import { main } from "effection";
import { init, start } from "@effectstream/runtime";
import { Stm } from "@effectstream/sm";
import { config } from "./config.dev.ts";

await main(function* () {
  yield* init();

  const gameStm = new Stm(grammar);
  gameStm.addStateTransition("join", function* () { /* ... */ });

  yield* start({
    config,
    gameStateTransitions: [gameStm],
    apiRouter: undefined,           // optional Fastify route plugin
    migrations: [],                 // SQL migrations
  });
});
```

For an ordinary async process, `runEffectstream()` owns the Effection task and
returns only after its structured runtime resources have unwound:

```typescript
import { runEffectstream } from "@effectstream/runtime";

await runEffectstream({
  staticConfig,
  startConfig,
  // Defaults to ["SIGINT", "SIGTERM"]. Use false when a supervisor owns them.
  processSignals: false,
  signal: abortController.signal,
});
```

This entry point is process-wide and one-shot. Concurrent calls reject with
`RunEffectstreamError` code `ALREADY_RUNNING`; calls after settlement reject
with `ALREADY_USED`. A caller abort rejects as `ABORTED` and keeps the abort
reason in `cause`, while configured process signals are successful controlled
shutdowns. Runtime or cleanup errors take priority and reject as `RUN_FAILED`;
its frozen, identity-deduplicated `failures` list contains the errors surfaced
by the Effection task and halt boundaries. Invalid options fail before the
one-shot process slot is claimed. The helper does not create or close PGlite,
choose networks, mutate environment variables, or call `process.exit()`.

`runEffectstream()` guarantees structured runtime cleanup. It cannot make a
third-party Promise cancellable, and `events: true` may create the existing
process-global outbound event-client reconnect loops. Event-disabled read-only
nodes (`startConfig.events: false`) avoid those clients and are the bounded
global-process-quiescence mode.

While running, the runtime:

- Reads finalized blocks via `@effectstream/sync`.
- Routes batcher inputs through your registered `Stm`s.
- Commits all yielded SQL inside a per-block transaction.
- Publishes lifecycle and app events via `@effectstream/event-server`.
- Serves the optional Fastify API.
- Emits OpenTelemetry traces and logs through `@effectstream/log`.

These resources are scope-owned. Telemetry registers SDK shutdown before it
starts. When the local MQTT broker is enabled, runtime startup awaits both of
its listeners before launching sync workers and shutdown awaits their release.
HTTP startup also owns a pending Fastify listen attempt, so halt during bind
waits for the attempt and cannot leave a late listener behind. Bind and cleanup
failures remain structural errors instead of being logged and swallowed.

## Inside EffectStream

`@effectstream/runtime` is the conductor: it doesn't define any chain
integrations or queries itself, but every other node package only gets
exercised when this loop is running. The `StartConfig` shape determines
which DB migrations apply, which state machines fire, and whether the
runtime exposes a Fastify router.

## Empty-block coalescing (catch-up)

The runtime replays one Effectstream block per main-clock tick, each in its
own DB transaction. During a deep catch-up over an idle gap (e.g. an NTP main
chain at one block/second across days), most of those blocks are **empty** — no
on-chain content, no scheduled input, no migration — yet still cost a full
`BEGIN…COMMIT` round-trip.
Empty-block coalescing folds a run of consecutive empty blocks into a **single
transaction** that writes only the run's endpoint. It is **opt-in** and off by
default:

```bash
EFFECTSTREAM_COALESCE_EMPTY_BLOCKS=true
```

The lag threshold that defines "behind the chain tip" defaults to **20× the
main clock's block time** (falling back to 60 s when no `blockTimeMS` is
exposed by the network config). Override it with
`EFFECTSTREAM_LAG_THRESHOLD_MS` (milliseconds), e.g. for chains whose main
clock fires faster than the runtime can keep up with one transaction per block:

```bash
EFFECTSTREAM_LAG_THRESHOLD_MS=30000   # engage coalescing past 30 s of lag
```

Behavior and guarantees:

- **Catch-up only.** Coalescing engages only while behind the chain tip
  (`now - block.timestamp` greater than the lag threshold) and disengages at
  the tip, so steady-state stays one block per transaction.
- **Identical database.** A coalesced sync produces a byte-for-byte identical
  database to a non-coalesced one. Empty blocks already never advance the block
  hash or RNG seed, so only the endpoint's block row and the per-protocol resume
  watermark are written — exactly as the normal path would leave them.
- **Never skips work.** A run is flushed before any block that has on-chain
  content, a migration at its height, or a due block-height/timestamp-scheduled
  input — so nothing that mutates state is ever folded away.
- **Tip stays visible.** If the producer goes quiet on an empty tail, the run is
  flushed on a short idle timeout so the latest height still commits.
- A run is also capped (`MAX_EMPTY_RUN`) to bound transaction size and recovery.

Implementation: [`src/coalesce.ts`](./src/coalesce.ts) (the `createEmptyBlockCoalescer`
coordinator the main loop drives).

## Key exports

- `init()` - `Operation<void>`. One-shot setup: OpenTelemetry, config validation, version pinning. Call before `start`.
- `start(config: StartConfig)` - `Operation<void>`. Run the node loop until cancelled.
- `runEffectstream(options)` - process-wide one-shot Promise adapter with typed
  cancellation and failure codes.
- `RunEffectstreamError`, `RunEffectstreamOptions` - stable process-adapter
  error and option contracts.

Types and helpers re-exported alongside `init` / `start`:

- `DBMigrations` - versioned SQL migrations passed into `start`.
- `StartConfig`, `StartConfigGameStateTransitions`, `StartConfigApiRouter` - `start`'s config types. Templates type-check against these implicitly but don't usually import them by name.
- `PrimitiveConstructor<T>` - extension point for new primitives.
- `VERSION` - `${number}.${number}.${number}` literal type for version pinning.
- Pagination helpers re-exported from `./api/pagination.ts`.

## Examples

The templates under
[`templates/`](https://github.com/effectstream/effectstream/tree/main/templates)
are full working `init()` + `start()` examples. The simplest is
[`templates/minimal/`](https://github.com/effectstream/effectstream/tree/main/templates/minimal).

End-to-end EVM sync test:
[`e2e/evm/sync/`](https://github.com/effectstream/effectstream/tree/main/e2e/evm/sync).

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/runtime
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/runtime

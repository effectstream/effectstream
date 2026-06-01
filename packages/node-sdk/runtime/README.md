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

While running, the runtime:

- Reads finalized blocks via `@effectstream/sync`.
- Routes batcher inputs through your registered `Stm`s.
- Commits all yielded SQL inside a per-block transaction.
- Publishes lifecycle and app events via `@effectstream/event-server`.
- Serves the optional Fastify API.
- Emits OpenTelemetry traces and logs through `@effectstream/log`.

## Inside EffectStream

`@effectstream/runtime` is the conductor: it doesn't define any chain
integrations or queries itself, but every other node package only gets
exercised when this loop is running. The `StartConfig` shape determines
which DB migrations apply, which state machines fire, and whether the
runtime exposes a Fastify router.

## Key exports

- `init()` - `Operation<void>`. One-shot setup: OpenTelemetry, config validation, version pinning. Call before `start`.
- `start(config: StartConfig)` - `Operation<void>`. Run the node loop until cancelled.

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

# @effectstream/node-sdk

The main application-node SDK for EffectStream. A single package that
re-exports every runtime piece (runtime, state machine, sync, database,
events, config, utils, concise schemas) under stable subpaths so your app
imports one dependency, not twelve.

## Install

```bash
bun add @effectstream/node-sdk
# or
npm install @effectstream/node-sdk
```

## Standalone usage

Bootstrap an EffectStream node in a handful of lines: build a config, write
state-transition functions in `@effectstream/sm`, then call `init()` and
`start()` from `@effectstream/node-sdk/runtime`.

```typescript
import { init, start } from "@effectstream/node-sdk/runtime";
import { Stm } from "@effectstream/node-sdk/sm";
import { config } from "./config.dev.ts";       // built with @effectstream/config
import { stateTransitions } from "./stm.ts";    // your STMs

await init({ config });
await start({
  config,
  gameStateTransitions: stateTransitions,
  apiRouter: undefined,           // optional Fastify router
  dbMigrations: [],               // your SQL migrations
});
```

Once running, the node syncs configured chains, applies state transitions
to a PostgreSQL (or PgLite) database, exposes a Fastify HTTP API, and
publishes MQTT events for any frontend or worker that subscribes.

## Inside EffectStream

This package is the "batteries included" entry point. It pulls in every
EffectStream runtime package as a workspace dependency and exposes each
through a `./<subpath>` export, so the templates in
[`templates/*`](https://github.com/PaimaStudios/paima-engine/tree/main/templates)
only ever depend on `@effectstream/node-sdk`.

## Key subpath exports

- `@effectstream/node-sdk/runtime` — `init`, `start`, `StartConfig`, `DBMigrations`.
- `@effectstream/node-sdk/sm` — `Stm`, state-machine types and helpers.
- `@effectstream/node-sdk/sm/builtin` — built-in primitives (ERC20, ERC721, ERC1155, Bitcoin, Cardano, Midnight, NEAR, Avail, Celestia, …).
- `@effectstream/node-sdk/sm/grammar` — concise/grammar parsing utilities.
- `@effectstream/node-sdk/sync` — `genSyncProtocols`, sync protocol factory.
- `@effectstream/node-sdk/db` — `getConnection`, query helpers, snapshot utilities.
- `@effectstream/node-sdk/db/start-pglite`, `./db/apply-migrations`, `./db/db-wait`, `./db/pgtyped-update`, `./db/version` — DB ops scripts.
- `@effectstream/node-sdk/db-emulator` — in-memory test DB.
- `@effectstream/node-sdk/event-server` — MQTT broker.
- `@effectstream/node-sdk/config` — `ConfigBuilder` and friends.
- `@effectstream/node-sdk/chain-types`, `./precompile`, `./concise`, `./coroutine` — pass-throughs to the same-named SDK packages.
- `@effectstream/node-sdk/utils`, `./utils/node-env`, `./utils/runtime` — utility helpers.

## Examples

The templates under
[`templates/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates)
are full working nodes built on this package. The simplest is
[`templates/minimal/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/minimal);
the richest is
[`templates/dice/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/dice).

Runnable: [`test/examples.test.ts`](./test/examples.test.ts) — sanity-checks
that the subpath surface resolves.

## Links

- Docs: https://effectstream.github.io/docs/packages/node/node-sdk
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/node

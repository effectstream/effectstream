---
title: "@effectstream/node-sdk"
description: "Main application node SDK for EffectStream"
sidebar_label: "node-sdk"
---

<!-- Generated from packages/node-sdk/node/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/node-sdk`](https://www.npmjs.com/package/@effectstream/node-sdk)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/node)

An umbrella package that re-exports every EffectStream runtime piece
(runtime, state machine, sync, database, events, config, utils, concise
schemas) under stable subpaths. Depend on this if you want a single
name; import the underlying packages directly if you prefer.

- Umbrella package: every Effectstream node piece reachable from one dependency.
- Stable subpaths re-exporting the underlying packages (`/runtime`, `/sm`, `/db`, `/config`, ...).
- Depend on this if you want a single name; import the underlying packages directly if you prefer.
- Subpaths are thin re-exports, identical semantics to the source packages.

## Install

```bash
bun add @effectstream/node-sdk
# or
npm install @effectstream/node-sdk
```

## Standalone usage

Every piece is reachable from one dependency:

```typescript
import { init, start } from "@effectstream/node-sdk/runtime";
import { Stm } from "@effectstream/node-sdk/sm";
import { getConnection } from "@effectstream/node-sdk/db";
import { ConfigBuilder, ConfigNetworkType } from "@effectstream/node-sdk/config";
```

The subpaths are thin re-exports - semantics are identical to importing
from the underlying packages.

The re-exported `db/start-pglite` handle uses a bounded, non-destructive
`close()` by default and an explicit owner-only `close({ force: true })` mode.
Default close defers PGlite cleanup until the last accepted client socket drains.
Concurrent calls share the first cleanup promise and the first requested mode
wins. See the `@effectstream/db` PgLite gateway lifecycle section for the full
client-ownership, failure, and `0.104.0`→`0.200.1` migration contract.

## Inside EffectStream

A namespace seam, not a runtime piece. Each subpath simply re-exports
the corresponding package:

```
@effectstream/node-sdk/runtime    → @effectstream/runtime
@effectstream/node-sdk/sm         → @effectstream/sm
@effectstream/node-sdk/db         → @effectstream/db
…
```

## Subpath exports

- `@effectstream/node-sdk/runtime`: `init`, `start`, `runEffectstream`, `StartConfig`, `DBMigrations`.
- `@effectstream/node-sdk/sm`: `Stm` plus state-machine types and helpers.
- `@effectstream/node-sdk/sm/builtin` ships built-in primitive type tags (ERC20, ERC721, ERC1155, Cardano transfer/mint-burn/pool-delegation, Midnight generic, NEAR, Avail, Celestia, ...).
- `@effectstream/node-sdk/sm/grammar`: concise/grammar parsing utilities.
- `@effectstream/node-sdk/sync` - `getMidnightTip`, `genSyncProtocols`, and per-chain fetcher classes.
- `@effectstream/node-sdk/db`: `getConnection`, query helpers, snapshot utilities.
- `@effectstream/node-sdk/db/start-pglite`, `./db/apply-migrations`, `./db/db-wait`, `./db/pgtyped-update`, `./db/version`: DB operations scripts.
- `@effectstream/node-sdk/db-emulator`: in-memory test DB migration runner.
- `@effectstream/node-sdk/event-server`: local MQTT broker.
- `@effectstream/node-sdk/config`: `ConfigBuilder` and friends.
- `@effectstream/node-sdk/chain-types`, `./precompile`, `./concise`, `./coroutine` are pass-throughs to the same-named SDK packages.
- `@effectstream/node-sdk/utils`, `./utils/node-env`, `./utils/runtime`: utility helpers.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/node-sdk/node/test/examples.test.ts) - verifies
each subpath resolves.

For full working nodes, see:

- [`templates/minimal/`](https://github.com/effectstream/effectstream/tree/main/templates/minimal)
- [`templates/dice/`](https://github.com/effectstream/effectstream/tree/main/templates/dice)

## Links

- Docs: https://effectstream.github.io/docs/packages/node/node-sdk
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/node

---
title: "@effectstream/db"
description: "PostgreSQL and PgLite database layer for EffectStream"
sidebar_label: "db"
---

<!-- Generated from packages/node-sdk/db/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/db`](https://www.npmjs.com/package/@effectstream/db)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/db)

The PostgreSQL (and PgLite) layer for EffectStream. Wraps `pg` with a
connection pool, ships every pgtyped-generated SQL query the runtime
needs, owns the snapshot loop, and provides a mutex needed for safe
single-threaded PgLite access.

- Pooled Postgres client plus every pgtyped query the runtime needs.
- Snapshot loop (`runSnapshotLoop`) and `acquireDBMutex` / `releaseDBMutex` for PgLite.
- Subpath scripts for in-memory PgLite, migrations, and version checks.
- `getConnection()` is the dominant entry point, ~31 call sites across the repo.

## Install

```bash
bun add @effectstream/db
# or
npm install @effectstream/db
```

## Standalone usage

You can drop `@effectstream/db` into any Node service that needs a
pooled Postgres client plus EffectStream's pgtyped queries. The most
common things you'd reach for:

```typescript
import {
  getConnection,
  getBlockHeights,
  getLatestProcessedBlockHeight,
} from "@effectstream/db";

const pool = getConnection({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const client = await pool.connect();
try {
  const heights = await getBlockHeights.run({ limit: 5 }, client);
  console.log(heights);
} finally {
  client.release();
}
```

For PgLite (in-memory) the package ships `./start-pglite`,
`./apply-migrations`, `./db-wait`, `./pgtyped-update`, `./version` as
small executable subpaths — used directly by the orchestrator.

> **PgLite caveat:** PgLite is single-writer. Wrap PgLite-bound code in
> `acquireDBMutex(name)` / `releaseDBMutex(name)` so concurrent generators
> don't trample each other.

## Inside EffectStream

`@effectstream/db` is the canonical access path. The runtime gets a
pooled client through `getConnection()`, every state-transition function
yields against pgtyped queries exported here, and the snapshot loop
(`runSnapshotLoop`) emits versioned `pg_dump` artifacts so a fresh node
can rejoin without re-syncing from genesis.

## Key exports

Connection management (heavily used):

- `getConnection(creds?)`: pooled `Pool` singleton. Dominant entry point (~31 call sites across the repo).
- `acquireDBMutex(name, priority?)` and `releaseDBMutex(name)` coordinate PgLite access; ~7 call sites each.
- `waitUntilFree()` — companion to the mutex.
- `getPersistentConnection(creds)` returns a non-pooled `Client` for long-lived listeners.

Queries (pgtyped-generated, shipped under one umbrella):

- Block bookkeeping: `getBlockHeights`, `getBlockByHash`, `blockHeightDone`, `saveLastBlock`, `getLatestProcessedBlockHeight`.
- Achievements: `getAchievementProgress`, `setAchievementProgress`.
- Re-exports of `*.queries.ts` for statistics, nonces, rollup inputs, accounts, events, sync protocol pages, primitives, system, tables.

Snapshots:

- `runSnapshotLoop` — periodic `pg_dump` of synced state.
- `createSnapshot`: single-shot snapshot helper.
- `SnapshotConfig`, `SnapshotRetentionConfig`: config types.

Dynamic table / event helpers:

- `createDynamicTables` registers tables a primitive wants to own.
- `createIndexesForEvents` and `registerEventHandlers` register pgtyped indexes for app events.

Subpath entry points (executable scripts):

- `@effectstream/db/start-pglite`: boot a PgLite instance.
- `@effectstream/db/apply-migrations` — apply SQL migrations against the active DB.
- `@effectstream/db/db-wait`: block until the DB accepts a connection.
- `@effectstream/db/pgtyped-update`: regenerate pgtyped types.
- `@effectstream/db/version` — print schema version.

## Examples

- Real connection round-trip: [`src/pg-connection.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/node-sdk/db/src/pg-connection.test.ts).
- Runnable: [`test/examples.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/node-sdk/db/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/db
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/db

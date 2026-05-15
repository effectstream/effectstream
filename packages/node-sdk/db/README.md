# @effectstream/db

The PostgreSQL (and PgLite) layer for EffectStream. Wraps `pg` with a
connection pool, ships every pgtyped-generated SQL query the runtime
needs, owns the snapshot loop, and provides a mutex needed for safe
single-threaded PgLite access.

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

- `getConnection(creds?)` — pooled `Pool` singleton. The dominant entry point (~31 cross-package call sites).
- `acquireDBMutex(name, priority?)` / `releaseDBMutex(name)` — coordination for PgLite (~7 cross-package call sites each).
- `waitUntilFree()` — companion to the mutex.
- `getPersistentConnection(creds)` — exported but currently has no in-repo consumers; intended for long-lived listeners.

Queries (pgtyped-generated, shipped under one umbrella):

- `getBlockHeights`, `getBlockByHash`, `blockHeightDone`, `saveLastBlock`, `getLatestProcessedBlockHeight` — block bookkeeping.
- `getAchievementProgress`, `setAchievementProgress` — achievements.
- Re-exports of `*.queries.ts` for statistics, nonces, rollup inputs, accounts, events, sync protocol pages, primitives, system, tables.

Snapshots:

- `runSnapshotLoop` — periodic `pg_dump` of synced state.
- `createSnapshot` — single-shot snapshot helper.
- `SnapshotConfig`, `SnapshotRetentionConfig` — config types.

Dynamic table / event helpers:

- `createDynamicTables` — register tables a primitive wants to own.
- `createIndexesForEvents`, `registerEventHandlers` — exported but currently have no in-repo consumers.

Subpath entry points (executable scripts):

- `@effectstream/db/start-pglite` — boot a PgLite instance.
- `@effectstream/db/apply-migrations` — apply SQL migrations against the active DB.
- `@effectstream/db/db-wait` — block until the DB accepts a connection.
- `@effectstream/db/pgtyped-update` — regenerate pgtyped types.
- `@effectstream/db/version` — print schema version.

## Examples

- Real connection round-trip: [`src/pg-connection.test.ts`](./src/pg-connection.test.ts).
- Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/db
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/db

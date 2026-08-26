# @effectstream/db

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
small executable subpaths - used directly by the orchestrator.

> **PgLite caveat:** PgLite is single-writer. Wrap PgLite-bound code in
> `acquireDBMutex(name)` / `releaseDBMutex(name)` so concurrent generators
> don't trample each other.

### PgLite gateway lifecycle

`startPglite(0)` binds only to `127.0.0.1` and reports the actual assigned port.
Its handle has two shutdown modes:

```typescript
const database = await startPglite(0);

// Compatibility default: stop accepting, preserve accepted client sockets.
await database.close();

// Explicit owner shutdown: destroy any stragglers and wait for teardown.
await database.close({ force: true });
```

The no-argument close is bounded even if a consumer deliberately retains a raw
`pg.Client`: it stops new accepts, unrefs and preserves accepted sockets, and
settles without waiting for those clients. Existing clients may finish work
while they remain connected. PGlite database cleanup is deferred until the last
accepted socket drains, so a client retained forever can defer that cleanup
forever. A resolved default-close promise therefore does not mean database
cleanup has completed. Consumers remain responsible for their client lifecycle.

Use `{ force: true }` only when your framework owns every connected client.
Forced close destroys tracked sockets and waits for listener/socket teardown,
so raw clients can emit their normal `Connection terminated unexpectedly`
error; owners must end clients first or handle that event.

Every call returns the same stored cleanup promise. The first call selects the
mode, including when default and force calls race; a later force call cannot
escalate cleanup already started in default mode. Startup listen failure still
attempts database cleanup. Forced shutdown and default shutdown with no retained
socket attempt database cleanup even if the listener fails to close. When both
operations fail, the promise rejects with an `AggregateError` in
listener-then-database order. If default shutdown deferred database cleanup, a
later cleanup failure is observed and logged, but cannot change the already
settled close promise.

Migration note: forced socket destruction became the implicit default in
`0.104.0` and was observed downstream during an upgrade to `0.200.1`. The
corrected no-argument close restores the non-destructive compatibility default;
PGlite cleanup waits for the last accepted socket, and forced teardown is
explicit. The useful `0.104.0` changes remain: IPv4 loopback binding, startup
rejection, address validation, actual-port reporting, and listener-close error
propagation. Cleanup idempotency is strengthened from a boolean early return to
a shared promise.

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
- `waitUntilFree()` - companion to the mutex.
- `getPersistentConnection(creds)` returns a non-pooled `Client` for long-lived listeners.

Queries (pgtyped-generated, shipped under one umbrella):

- Block bookkeeping: `getBlockHeights`, `getBlockByHash`, `blockHeightDone`, `saveLastBlock`, `getLatestProcessedBlockHeight`.
- Achievements: `getAchievementProgress`, `setAchievementProgress`.
- Re-exports of `*.queries.ts` for statistics, nonces, rollup inputs, accounts, events, sync protocol pages, primitives, system, tables.

Snapshots:

- `runSnapshotLoop` - periodic `pg_dump` of synced state.
- `createSnapshot`: single-shot snapshot helper.
- `SnapshotConfig`, `SnapshotRetentionConfig`: config types.

Dynamic table / event helpers:

- `createDynamicTables` registers tables a primitive wants to own.
- `createIndexesForEvents` creates pgtyped indexes for app events; `registerEventTypes` records each event's topic/name in the database.

Subpath entry points (executable scripts):

- `@effectstream/db/start-pglite`: boot a PgLite instance and choose bounded
  default or explicit forced teardown as described above.
- `@effectstream/db/apply-migrations` - apply SQL migrations against the active DB.
- `@effectstream/db/db-wait`: block until the DB accepts a connection.
- `@effectstream/db/pgtyped-update`: regenerate pgtyped types.
- `@effectstream/db/version` - print schema version.

## Examples

- Real connection round-trip: [`src/pg-connection.test.ts`](./src/pg-connection.test.ts).
- Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/db
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/db

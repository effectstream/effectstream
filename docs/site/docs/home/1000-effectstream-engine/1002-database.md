# Database

At the heart of every EffectStream node is a powerful PostgreSQL database. This database is the single source of truth for your application's state, storing everything from raw on-chain inputs to the processed, real-time state of your game world.

EffectStream provides a sophisticated and developer-friendly toolkit for defining your database schema, managing its evolution over time, and interacting with it in a type-safe manner.

### Database Schema

Your dApp's database is organized into three main schemas:

*   **`effectstream`**: This schema is reserved for EffectStream's internal system tables. These tables manage the core operations of the node, such as block processing, input queuing, account management, and achievement tracking. You should generally not modify these tables directly.
*   **`primitives`**: This schema holds the **Dynamic Tables** that are automatically created and managed by the EffectStream to represent the state of your configured Primitives. For example, an `ERC20` primitive will create a table in this schema to track token balances.
*   **`public`**: This is **your schema**. All of your dApp's custom tables, such as `players`, `games`, or `inventories`, should be created here.

In development, you can opt into `config.dev.resetPublicData` to truncate every table in `public` (sequences reset) right after the startup DB mutex is acquired and before migrations or sync run. **Only use this on development**. See [Node Startup](../100-components/117-node-startup.md#development-reset-option-configdevresetpublicdata) for details.

### Defining Custom Tables & Migrations

The process of defining and evolving your database schema is managed through a robust **migration system**. A migration is simply a SQL file containing `CREATE TABLE`, `ALTER TABLE`, or other DDL statements.

### Creating Migration Files

Your migrations live in **your own** `database` package — conventionally `packages/database/migrations/` — and you hand them to the engine through the `migrations` field of `start(...)`. Do not put them in `packages/node-sdk/db/migrations/`; that directory holds the engine's internal `system-up-v-*.sql` / `system-down-v-*.sql` files, which build the `effectstream` schema and are not a place for application tables.

**1. Write the SQL** (`packages/database/migrations/000-init.sql`) — create your tables in the `public` schema:

```sql
CREATE TABLE inputs_log (
  id SERIAL PRIMARY KEY,
  signer TEXT NOT NULL,
  payload JSONB NOT NULL,
  block_height INTEGER NOT NULL
);
```

**2. Declare the order** (`packages/database/migration-order.ts`) — each entry pairs a name with the SQL text:

```ts
import type { DBMigrations } from "@effectstream/runtime";
import initSql from "./migrations/000-init.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  { name: "000-init.sql", sql: initSql },
];
```

**3. Pass it to `start(...)`** from your node entry point (`packages/node/main.{env}.ts`):

```ts
import { migrationTable } from "@my-app/database";

yield* start({
  appName: "my-app",
  appVersion: "1.0.0",
  syncInfo: toSyncProtocolWithNetwork(config),
  migrations: migrationTable,
  // …grammar, appStateTransitions, apiRouter
});
```

The engine applies any migration it has not run yet, in array order, during startup. See [`templates/minimal/packages/database/`](https://github.com/effectstream/effectstream/tree/main/templates/minimal/packages/database) for the complete working example.
### Type-Safe Queries with `pgtyped`

EffectStream uses `pgtyped` to bridge the gap between your SQL database and your TypeScript code. It automatically generates fully type-safe TypeScript functions directly from your raw SQL queries, eliminating an entire class of bugs and providing excellent editor autocompletion.

### Writing Named Queries
In a template, SQL queries live under `packages/database/sql/` (see [`templates/minimal/packages/database/sql/queries.sql`](https://github.com/effectstream/effectstream/blob/main/templates/minimal/packages/database/sql/queries.sql) for a working reference). Each query gets a `@name` comment that `pgtyped` uses as the generated function name.

**Example (`packages/database/sql/queries.sql`):**
```sql
/* @name insertInput */
INSERT INTO inputs_log (signer, payload, block_height)
VALUES (:signer!, :payload!, :block_height!);

/* @name getAllInputs */
SELECT * FROM inputs_log
ORDER BY id DESC
LIMIT 100;
```

### Generating TypeScript Functions
After writing your queries, run the `pgtyped:update` script defined in your app's `database` package:
```sh
bun run --cwd packages/database pgtyped:update
```
This introspects your SQL files and database schema, then writes a `*.queries.ts` file next to each `*.sql` with fully-typed wrapper functions.

### Required Extension: `pg_ivm`

Effectstream relies on the [`pg_ivm`](https://github.com/sraoss/pg_ivm) PostgreSQL extension to maintain the read-side views over each Primitive's intermediate state (`primitives.<view>`). `pg_ivm` produces an *incrementally maintained materialized view* — a compact, up-to-date projection that the engine writes through synchronously on each accounting update, so reads from `primitives.<view>` hit a small physical table instead of scanning the full intermediate.

This matters because the intermediate tables grow monotonically: when an ERC20 holder transfers their full balance out, their row stays (with `balance = 0`) so that future credits can find it. On a long-lived token with millions of historical addresses, the intermediate can be 10× to 100× the size of the currently-active set. `pg_ivm` filters that down at write time so reads stay fast forever.

**The engine aborts at startup when `pg_ivm` is not installed.** You will see a multi-line error explaining the two ways forward. To install:

```sh
# From source — works on any self-hosted Postgres 14+
git clone --depth 1 --branch v1.11 https://github.com/sraoss/pg_ivm
cd pg_ivm && make && sudo make install

# Then in your database (as a superuser):
CREATE EXTENSION pg_ivm;
```

#### `ALLOW_NO_PG_IVM=true` — dev/test fallback

If you cannot install `pg_ivm` (managed Postgres providers like RDS, Cloud SQL, or Neon don't allow custom extensions), you can opt into a fallback path by setting:

```sh
ALLOW_NO_PG_IVM=true
```

In this mode the engine creates plain SQL `VIEW`s over the intermediate tables instead of incrementally maintained ones. Correctness is identical — the underlying trigger that maintains the intermediate is the same in both modes, so reads always see a transactionally-consistent snapshot. **But performance is not.** Every read of `primitives.<view>` becomes a sequential scan over the full intermediate with the filter applied at read time. For high-cardinality contracts (popular tokens, long-running games) this becomes unusable past some scale.

| Mode | Read cost | Suitable for |
| :--- | :--- | :--- |
| `pg_ivm` (default) | Index lookup on a compact materialized table | Production at any scale |
| `ALLOW_NO_PG_IVM=true` | Seq scan + filter over the full intermediate | Dev / test / low-volume apps only |

When running with `ALLOW_NO_PG_IVM=true`, the engine emits a prominent `[WARN]` log line on every startup so the degraded mode is visible.

### System Tables Overview

The `effectstream` schema contains a number of tables essential for the engine's operation. Here are a few of the most important ones:

| Table | Description |
| :--- | :--- |
| **`effectstream.effectstream_blocks`** | Records every L2 block processed by the engine, including its seed for randomness. |
| **`effectstream.rollup_inputs`** | A queue for all incoming inputs from on-chain events. |
| **`effectstream.rollup_input_future_block`** | Stores scheduled inputs that are set to execute at a future block height (for timers/ticks). |
| **`effectstream.accounts` & `effectstream.addresses`** | Manages the L2 Account System, linking wallets to persistent accounts. |
| **`effectstream.achievement_progress`** | Stores the dynamic per-player progress for the PRC-1 Achievement system. |
| **`effectstream.primitive_config`** | Stores the configuration of all your defined Primitives. |
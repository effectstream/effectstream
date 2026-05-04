# Database

At the heart of every Effectstream node is a powerful PostgreSQL database. This database is the single source of truth for your application's state, storing everything from raw on-chain inputs to the processed, real-time state of your game world.

Effectstream provides a sophisticated and developer-friendly toolkit for defining your database schema, managing its evolution over time, and interacting with it in a type-safe manner.

### Database Schema

Your dApp's database is organized into three main schemas:

*   **`effectstream`**: This schema is reserved for Effectstream's internal system tables. These tables manage the core operations of the node, such as block processing, input queuing, account management, and achievement tracking. You should generally not modify these tables directly.
*   **`primitives`**: This schema holds the **Dynamic Tables** that are automatically created and managed by the Effectstream to represent the state of your configured Primitives. For example, an `ERC20` primitive will create a table in this schema to track token balances.
*   **`public`**: This is **your schema**. All of your dApp's custom tables, such as `players`, `games`, or `inventories`, should be created here.

In development, you can opt into `config.dev.resetPublicData` to truncate every table in `public` (sequences reset) right after the startup DB mutex is acquired and before migrations or sync run. **Only use this on development**. See [Node Startup](../100-components/117-node-startup.md#development-reset-option-configdevresetpublicdata) for details.

### Defining Custom Tables & Migrations

The process of defining and evolving your database schema is managed through a robust **migration system**. A migration is simply a SQL file containing `CREATE TABLE`, `ALTER TABLE`, or other DDL statements.

### Creating Migration Files

All your SQL migration files should be placed in the `/packages/node-sdk/db/migrations/system-down-v-x.x.x.sql` directory.

**Example (`system-down-v-x.x.x.sql`):**
```sql
CREATE TABLE effectstream.system_table (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  ...other fields...
);
```
### Type-Safe Queries with `pgtyped`

Effectstream uses `pgtyped` to bridge the gap between your SQL database and your TypeScript code. It automatically generates fully type-safe TypeScript functions directly from your raw SQL queries, eliminating an entire class of bugs and providing excellent editor autocompletion.

### Writing Named Queries
You write your SQL queries in files within the `/TODO` directory. To make a query available to `pgtyped`, you must give it a special named comment.

**Example (`TODO.sql`):**
```sql
-- TODO
```

### Generating TypeScript Functions
After writing your queries, you run a simple command:
```sh
deno task -f @effectstream/db pgtyped:update
```
This command introspects your SQL files and your database schema, then generates corresponding TypeScript functions.

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

### Block-hash storage policy

To keep the `effectstream.effectstream_blocks` table from growing linearly with the chain, the engine retains hash content for **only the most recently finalized block**. Older rows still exist (with all their other columns intact — `block_height`, `seed`, `ms_timestamp`, etc.) but their hash columns are flattened to empty bytea.

What gets written for each new block:

- `main_chain_block_hash` — always empty bytea. The column is `BYTEA NOT NULL`; an empty buffer satisfies the constraint. Its content was never used internally and the API endpoints that surfaced it are no longer meaningful.
- `effectstream_block_hash` — written with the real hash for the block being finalized. As part of the same block-processing transaction, every previously populated row is flattened to empty bytea (see `pruneOldBlockHashes`). Only one row carries hash content at any time.

Why this is safe:

- **Prando RNG determinism** is preserved across restarts. On startup, `start()` reads the latest finalized row's `effectstream_block_hash` and seeds the in-memory hash chain from it before processing the next block. `generatePaimaBlockHash` therefore receives the correct predecessor hash regardless of how many restarts have happened.
- **Block-done sentinel.** Empty bytea is non-null in Postgres, so the `WHERE effectstream_block_hash IS NOT NULL` filters used by `getLatestProcessedBlockHeight` and `getBlockSeeds` continue to match every finalized row.
- **In-flight blocks** (after `saveLastBlock` but before `blockHeightDone`) have `effectstream_block_hash = NULL`. The hydration query skips them via the same `IS NOT NULL` filter, so a crash mid-block resumes from the last fully-finalized predecessor.

What stops working:

- `getBlockByHash` and the rollup-input JOINs that read `effectstream_blocks.effectstream_block_hash` only resolve correctly for the most recently finalized block. Historical lookups by hash return empty/no results.

#### Reclaiming disk for already-populated deployments

Engine version `0.0.1` always wrote real hash content for every row. When upgrading a deployment that ran on an earlier version, run a one-off DBA script during a maintenance window — **not** as a versioned migration, because the engine's migration runner blocks startup. The script is idempotent on already-flattened rows, so it can be re-run safely.

```sql
-- 1. Batched rewrite. Preserves the hash on the latest finalized row so that
--    on the next engine boot, hydration still finds a non-empty predecessor
--    and Prando seeding stays continuous.
WITH latest AS (
  SELECT block_height
  FROM effectstream.effectstream_blocks
  WHERE effectstream_block_hash IS NOT NULL
  ORDER BY block_height DESC
  LIMIT 1
)
UPDATE effectstream.effectstream_blocks AS b
SET main_chain_block_hash = ''::bytea,
    effectstream_block_hash = CASE
      WHEN effectstream_block_hash IS NULL THEN NULL
      ELSE ''::bytea
    END
WHERE octet_length(b.main_chain_block_hash) > 0
   OR (
     octet_length(b.effectstream_block_hash) > 0
     AND b.block_height <> (SELECT block_height FROM latest)
   );

-- 2. Reclaim space. Pick ONE of:
--    (a) VACUUM (effectstream.effectstream_blocks);          -- non-blocking; dead tuples reusable, file size unchanged
--    (b) VACUUM FULL effectstream.effectstream_blocks;        -- shrinks file; takes ACCESS EXCLUSIVE lock
--    (c) pg_repack -t effectstream.effectstream_blocks ...    -- shrinks file online; requires the pg_repack extension
```

Regular `VACUUM` (option a) is the safest default on a running service; avoid `VACUUM FULL` while sync is live. After this script runs once, the engine's per-block `pruneOldBlockHashes` keeps the table at constant hash overhead going forward.
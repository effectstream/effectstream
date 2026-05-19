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

EffectStream uses `pgtyped` to bridge the gap between your SQL database and your TypeScript code. It automatically generates fully type-safe TypeScript functions directly from your raw SQL queries, eliminating an entire class of bugs and providing excellent editor autocompletion.

### Writing Named Queries
You write your SQL queries in files within the `/TODO` directory. To make a query available to `pgtyped`, you must give it a special named comment.

**Example (`TODO.sql`):**
```sql
-- TODO
```

### Generating TypeScript Functions
After writing your queries, you run a simple command:
```sh
bun run --cwd packages/node-sdk/db pgtyped:update
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
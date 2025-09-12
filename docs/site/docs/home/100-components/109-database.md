# Database

Paima Engine uses a SQL Database and tooling to support dApps:
* Define custom tables and migrations.
* Define at what block number migrations get applied.
* Write custom SQL queries, and they get compiled to typescript.

## Tables & Migrations

1. Create your SQL files at:
`/backend/database/src/migrations/*.sql`

```sql
CREATE TABLE my_table (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0
);
```

2. Define the order they will executed at:
`/backend/database/src/migration-order.ts`

```ts
import type { DBMigrations } from "@paima/runtime";
import firstSql from "./migrations/first.sql" with { type: "text" };
import secondSql from "./migrations/second.sql" with { type: "text" };
import thirdSql from "./migrations/third.sql" with { type: "text" };
import fourthSql from "./migrations/fourth.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  {
    name: "initial-database",
    sql: firstSql,
  },
  {
    versionDependency: "0.3.10",
    name: "add-rows",
    sql: secondSql,
  },
  {
    blockHeight: 2,
    name: "add-indexes",
    sql: thirdSql,
  },
  {
    blockHeight: 3,
    versionDependency: "0.3.20",
    name: "further-changes",
    sql: fourthSql,
  },
];
```
> You can define the "versionDependency" field to enforce that that version or greater of Paima Engine will be running when the migration is applied.

> "blockHeight" field allows to define in what exact blockHeight the migration will be applied. 1 is default.

## TS type-safe SQL Queries

And uses PGTyped to convert SQL into Typescript functions.

To convert the SQL for your project:  
`deno task -f @example-evm-midnight/database pgtyped:update`

* SQL Files are located at `/packages/backend/database/src/sql/*.sql`

This uses PGTyped format, where "@name" will be used for the Typescript name. 
```sql
/* @name myQuery */
SELECT * from my_table;
```

Now you can use the type-safe query in your TS Code
```ts
...
const data = await myQuery.run(undefined, dbConnection);
console.log(data);
...
```

## Primitives Dynamic Tables

If you have primitives as ERC20, ERC721, ERC1155 for example - these will automatically aggregate the data for you and expose them in dynamic tables. 

For example `ERC20's` primitives will create a table called:  
`erc20_balances_view_<YOUR_PRIMITIVE_NAME>`  
This table will contain rows with `wallet address`, `token count`. 

| address | wallet |
| ------- | ------ |
| 0xabcd  | 100    |
| 0x1111  | 0      |
| 0xdead  | 590    |
| 0xbeaf  | 201    |

More info in available in [Chains](../200-chains/200-chains.md)
# Database

Paima Engine uses a postgres database.  

## Queries

And uses PGTyped to convert SQL into Typescript functions.

To convert the SQL for your project:  
`deno task -f  @example/database pgtyped:update`

* SQL Files are located at `/packages/backend/database/src/sql/*.sql`
* Database creation and migrations files are located at `/packages/backend/database/src/migrations/*.sql`

## Custom Tables and Migrations 

To let the engine to know when to apply your migrations you must provide a migration function:

```ts
export const migrationRouter: StartConfigMigrationRouter = async function (
  blockHeight: number,
): Promise<string | undefined> {
  switch (blockHeight) {
    case 1:
      return await readFile(`${__dirname}/migrations/database.sql`, "utf-8");
  }
  return undefined;
};
```
> NOTE: blockHeight = 1, is the first block created at launch.

> NOTE 2: These block heights are Paima Engine L2 blocks.
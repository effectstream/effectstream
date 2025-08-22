# Database

> INFO: This is intended for developers making changes or contributions to Paima Engine.

## Queries 

The database uses PGTyped to convert SQL to Typescript save queries.  
To update the pgtyped functions run:  
`deno task -f @paima/db pgtyped:update` 

* SQL Scripts:
@paima/db `/src/sql/*.sql`

## System Tables and Migrations

* DB Initialization
@paima/db `/migrations/system-up-v-<MAJOR>-<MINOR>-<PATCH>.sql` 

Where the version MUST match the Package Version.
e.g., For Paima Engine 0.3.20, the migration is called: `/migrations/system-up-v-0-3-20.sql` 
> NOTE 0.0.0 Is a special migration that gets applied before the node starts.


And then the file must be added to the `assets-config.json` 
> NOTE: This is a JSR limitation at the time

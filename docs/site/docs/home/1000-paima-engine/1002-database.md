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
@paima/db `/migrations/up.sql` 

> up.sql is applied at the start up.
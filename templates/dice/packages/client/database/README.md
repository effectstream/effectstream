# Database

This package contains all logic that interacts with the Postgres database containing game data. Exports from this package are to be imported by the state transition module.

## Exports

This package exports a `pool` object, which is the Postgres database connection used by nodeJS.

It also exports a series of SQL queries, compiled by the `pgtyped` library.

## pgTyped

[pgTyped](https://github.com/adelsz/pgtyped) generates type safe SQL queries to run on a nodeJS application.

To use it you must write up the queries in `sql` files annotated in pgTyped's custom syntax, and run the CLI. The CLI can be run with `npm run compile`.

The pgTyped compiler requires a json configuration file, `pgtypedconfig.json` in this repo. The compiler requires a local database with a working schema to validate the queries before compilation. The config file in this repo uses my personal setup, please change to your local setup before compiling yourself.

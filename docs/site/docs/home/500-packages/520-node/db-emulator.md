---
title: "@effectstream/db-emulator"
description: "In-memory test database for EffectStream"
sidebar_label: "db-emulator"
---

<!-- Generated from packages/node-sdk/db-emulator/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/db-emulator`](https://www.npmjs.com/package/@effectstream/db-emulator)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/db-emulator)

A standalone migration runner for EffectStream's database. Apply the
EffectStream system schema plus your migrations to a Postgres or PgLite
instance without booting the full runtime - handy for unit tests and CI
fixtures.

- Standalone migration runner: apply Effectstream's system schema + your migrations to a fresh DB.
- For tests and CI fixtures; do not point at a production database.
- Exists separately from `@effectstream/db` to break a circular dep with `@effectstream/sm`.
- Single export: `standAloneApplyMigrations`.

## Install

```bash
bun add @effectstream/db-emulator
# or
npm install @effectstream/db-emulator
```

This package exists separately from `@effectstream/db` to break the
circular dependency between `@effectstream/db` and `@effectstream/sm` -
both of which `standAloneApplyMigrations` needs.

## Standalone usage

```typescript
import { getConnection } from "@effectstream/db";
import { standAloneApplyMigrations } from "@effectstream/db-emulator";
import { localhostConfig } from "./config.ts";
import { migrationTable } from "./migrations.ts";

const db = await getConnection();
await standAloneApplyMigrations(
  db,
  migrationTable,
  localhostConfig,
  /* userDefinedPrimitives */ undefined,
);
```

You're left with a database that has every EffectStream system table
plus your migrations applied, ready for tests to read and write
directly against the client returned by `getConnection()`.

> Use only against ephemeral / in-memory databases. The function
> assumes it owns the schema.

## Inside EffectStream

Designed for use in tests and migration tooling. Pair with
[`@effectstream/db/start-pglite`](https://www.npmjs.com/package/@effectstream/db)
for a quick in-memory database that's ready for app code to read /
write.

## Key exports

- `standAloneApplyMigrations(db, migrationTable, config, userPrimitives?)` - apply the EffectStream system migrations plus your own, against the given pg client.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/node-sdk/db-emulator/test/examples.test.ts).

For the broader migration pattern, see
`templates/*/packages/client/database/sql-to-ts.ts`.

## Links

- Docs: https://effectstream.github.io/docs/packages/node/db-emulator
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/db-emulator

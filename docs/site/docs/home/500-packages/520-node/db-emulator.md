---
title: "@effectstream/db-emulator"
description: "In-memory test database for EffectStream"
sidebar_label: "db-emulator"
---

<!-- Generated from packages/node-sdk/db-emulator/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/db-emulator`](https://www.npmjs.com/package/@effectstream/db-emulator)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/db-emulator)

A standalone migration runner for EffectStream's database. Apply your
schema to a Postgres or PgLite instance from a test or a script without
booting the full runtime — handy for unit tests and CI fixtures.

## Install

```bash
bun add @effectstream/db-emulator
# or
npm install @effectstream/db-emulator
```

This package exists separately from `@effectstream/db` to break the
circular dependency between `@effectstream/db` and `@effectstream/sm` —
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

You're left with a database that has every EffectStream system table plus
your migrations applied. The state machine isn't running — you can read
and write directly with whichever client you got from `getConnection()`.

> Use only against ephemeral / in-memory databases. The function assumes
> it owns the schema.

## Inside EffectStream

The orchestrator and `bun test ./packages` use this helper to set up
PgLite instances before exercising state-machine code. Production nodes
don't need it: the runtime's startup path runs migrations itself.

## Key exports

- `standAloneApplyMigrations(db, migrationTable, config, userPrimitives?)` — apply the EffectStream system migrations plus your own, against the given pg client.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/node-sdk/db-emulator/test/examples.test.ts).

The full pattern in action: most templates'
`packages/node/db-up.ts` wire `standAloneApplyMigrations` into their
`bun run db:up` script.

## Links

- Docs: https://effectstream.github.io/docs/packages/node/db-emulator
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/db-emulator

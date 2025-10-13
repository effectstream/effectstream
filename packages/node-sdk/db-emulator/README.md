# @paima/db-emulator

Database emulation utilities for Paima Engine development and testing.

## Purpose

This package provides utilities for applying database migrations in test
environments and during development. It was separated from `@paima/db` to break
the circular dependency between `@paima/db` and `@paima/sm`.

## Dependencies

- `@paima/db` - Core database functionality
- `@paima/sm` - State machine primitives (for built-in primitives map)

## Usage

```typescript
import { getConnection } from "@paima/db";
import { standAloneApplyMigrations } from "@paima/db-emulator";

const db = await getConnection();
await standAloneApplyMigrations(
  db,
  migrationTable,
  localhostConfig,
  userDefinedPrimitives, // optional
);
```

## Note

This is primarily a development/testing utility. Production applications
typically use the migration system directly through `@paima/db`.

# @effectstream/db-emulator

Database emulation utilities for Effectstream development and testing.

## Purpose

This package provides utilities for applying database migrations in test
environments and during development. It was separated from `@effectstream/db` to break
the circular dependency between `@effectstream/db` and `@effectstream/sm`.

## Dependencies

- `@effectstream/db` - Core database functionality
- `@effectstream/sm` - State machine primitives (for built-in primitives map)

## Usage

```typescript
import { getConnection } from "@effectstream/db";
import { standAloneApplyMigrations } from "@effectstream/db-emulator";

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
typically use the migration system directly through `@effectstream/db`.

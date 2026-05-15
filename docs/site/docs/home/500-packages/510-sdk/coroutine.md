---
title: "@effectstream/coroutine"
description: "Async control flow for EffectStream"
sidebar_label: "coroutine"
---

<!-- Generated from packages/effectstream-sdk/coroutine/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/coroutine`](https://www.npmjs.com/package/@effectstream/coroutine)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/coroutine)

Generator-based control flow primitives for EffectStream's state machine.
Defines the `StateUpdateStream` generator type and the `World.*` helpers
that EffectStream's runtime executes — the API your state-transition
functions yield against.

## Install

```bash
bun add @effectstream/coroutine
# or
npm install @effectstream/coroutine
```

## Standalone usage

This package is **only useful inside an EffectStream node**. It defines the
generator protocol that `@effectstream/runtime` interprets — the
`QueuedUpdate` shape, the `ExecPromise` shape, and the `World.resolve` /
`World.all` / `World.promise` helpers that produce them. Without a runtime
that executes those yields against a database connection, the generators
return nothing meaningful.

If you're a node author, you'll use it through `@effectstream/sm`, which
wraps these primitives in the state-machine DSL.

## Inside EffectStream

A state-transition function is a generator that yields SQL queries (paired
with their typed inputs via `@pgtyped/runtime`); the runtime advances the
generator after each query is executed, threading the results back in.
`World.resolve` is how a transition asks the runtime "run this typed SQL
query and give me the rows back".

```typescript
import { World } from "@effectstream/coroutine";
import { getUser, updateBalance } from "./queries.ts"; // pgtyped queries

export function* spend(amount: number) {
  const [user] = yield* World.resolve(getUser, { id: 1 });

  if (user.balance < amount) return { ok: false } as const;

  yield* World.resolve(updateBalance, {
    id: user.id,
    balance: user.balance - amount,
  });
  return { ok: true } as const;
}
```

The runtime collects every yielded `QueuedUpdate` (a `[SQLQueryIR, input]`
tuple) and executes it against the active database transaction, returning
the rows so `World.resolve` can hand them back to the generator.

## Key exports

- `World.resolve(query, input)` — yield a typed pgtyped query and receive its result rows.
- `World.all(streams)` — yield several generators in parallel; receive a tuple of their return values.
- `World.promise(promise)` — embed a plain async result into a generator stream.
- `QueuedUpdate<Input>` — branded `[SQLQueryIR, Input]` tuple that the runtime knows how to execute.
- `SyncStateUpdateStream<Return>`, `StateUpdateStream<Return>` — types for state-transition generators (sync and async variants).
- `ExecPromise<T>` — yieldable wrapper around a promise.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/effectstream-sdk/coroutine/test/examples.test.ts).

For real state-machine code that uses these primitives, see the primitives
implemented in
[`packages/node-sdk/sm/primitives/src/`](https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/sm/primitives/src).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/coroutine
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/coroutine

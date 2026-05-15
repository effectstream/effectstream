---
title: "@effectstream/sm"
description: "State machine DSL for EffectStream"
sidebar_label: "sm"
---

{/* Generated from packages/node-sdk/sm/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/sm`](https://www.npmjs.com/package/@effectstream/sm)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/sm)

The state-machine DSL inside an EffectStream node. Define a typed grammar
of commands, register one generator per command, and `Stm` parses each
incoming batcher input, dispatches it to the right handler, and yields
SQL updates through the runtime.

## Install

```bash
bun add @effectstream/sm
# or
npm install @effectstream/sm
```

## Standalone usage

The DSL itself runs without a database — you can author and even
`processInput` test fixtures against an `Stm` in a pure-TS unit test
(see [`primitives/src/evm-erc20/erc20-primitive.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/node-sdk/sm/primitives/src/evm-erc20/erc20-primitive.test.ts)).
What's missing is the runtime: nothing executes the SQL the generators
yield until `@effectstream/runtime` drives the loop.

```typescript
import { Stm } from "@effectstream/sm";
import { World } from "@effectstream/coroutine";
import { Type } from "@sinclair/typebox";
import { join, leave } from "./queries.ts"; // pgtyped queries

const grammar = {
  join: [["user", Type.String()]] as const,
  leave: [["user", Type.String()]] as const,
} as const;

const stm = new Stm(grammar);

stm.addStateTransition("join", function* ({ parsedInput, msTimestamp }) {
  yield* World.resolve(join, { user: parsedInput.user, ts: msTimestamp });
});

stm.addStateTransition("leave", function* ({ parsedInput }) {
  yield* World.resolve(leave, { user: parsedInput.user });
});
```

The runtime calls `stm.processInput(input)` for every batcher subunit; the
DSL parses against `grammar`, finds the right handler, and the generator
yields `World.resolve(...)` so the runtime can execute the pgtyped queries.

## Inside EffectStream

`Stm` is the central piece a node author writes. The runtime's per-block
loop wires each user input through the corresponding `Stm` instance,
collects yielded SQL, and commits it inside the per-block transaction.
The built-in primitives package (`@effectstream/sm/builtin`) covers
common on-chain events — ERC-20/721/1155 transfers, Cardano transfers,
Midnight events, etc. — so you don't re-implement them.

## Key exports

- `Stm<Grammar, Events>` — the state machine. `.addStateTransition(prefix, handler)`, `.processInput(input)`, `.grammar`, `.fullJsonGrammar`, `.keyedJsonGrammar`.
- `MessageListener<Events, Params>` — handler type (`(input) => SyncStateUpdateStream<void>`).
- `ParamToData<Params>` — derives the typed argument shape from a grammar entry.
- `BaseStfInput` — the input shape passed to every handler (includes `msTimestamp`, `blockHeight`, etc.).
- `delegate-wallet` helpers — account delegation primitives reused by built-ins.

Subpath exports:

- `@effectstream/sm/builtin` — `PrimitiveTypeERC20`, `PrimitiveTypeERC721`, `PrimitiveTypeERC1155`, `PrimitiveTypeCardanoTransfer`, `PrimitiveTypeMidnightGeneric`, and many more (20+ chain-specific event tags).
- `@effectstream/sm/grammar` — the underlying grammar/parsing utilities (also re-exported from `@effectstream/concise`).

## Examples

- [`primitives/src/evm-erc20/erc20-primitive.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/node-sdk/sm/primitives/src/evm-erc20/erc20-primitive.test.ts) — a real primitive's behavior unit-tested.
- Game logic in
  [`templates/dice/packages/node/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/dice/packages/node)
  shows the full `new Stm(...).addStateTransition(...)` pattern.

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/node-sdk/sm/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/sm
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/sm

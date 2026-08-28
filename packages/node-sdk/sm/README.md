# @effectstream/sm

The state-machine DSL inside an EffectStream node. Define a typed grammar
of commands, register one generator per command, and `StateMachine` parses each
incoming batcher input, dispatches it to the right handler, and yields
SQL updates through the runtime.

- State-machine DSL: define a typed grammar, register one generator per command.
- Parses each batcher input, dispatches to the handler, yields SQL through the runtime.
- `@effectstream/sm/builtin` ships common on-chain event primitives (ERC-20/721/1155, Cardano, Midnight, ...).
- DSL is directly testable in a pure-TS unit test, without a database.

## Install

```bash
bun add @effectstream/sm
# or
npm install @effectstream/sm
```

## Usage

This package pairs with [`@effectstream/runtime`](https://www.npmjs.com/package/@effectstream/runtime).
The canonical `runEffectstream()` call receives one `StateMachine`, binds the
grammar produced by configured primitives before sync begins, then drives a
per-block loop that calls that same object's `processInput(...)`, collects the
SQL yielded by its generators, and commits it inside a per-block PostgreSQL
transaction. You author the DSL here; the runtime executes it.

The DSL is also directly testable in a pure-TS unit test (parse + dispatch
without a database) - see
[`primitives/src/evm-erc20/erc20-primitive.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/node-sdk/sm/primitives/src/evm-erc20/erc20-primitive.test.ts).

```typescript
import { StateMachine } from "@effectstream/sm";
import { World } from "@effectstream/coroutine";
import { Type } from "@sinclair/typebox";
import { join, leave } from "./queries.ts"; // pgtyped queries

const grammar = {
  join: [["user", Type.String()]] as const,
  leave: [["user", Type.String()]] as const,
} as const;

const stm = new StateMachine(grammar);

stm
  .addStateTransition("join", function* ({ parsedInput, blockTimestamp }) {
    yield* World.resolve(join, {
      user: parsedInput.user,
      ts: blockTimestamp,
    });
  })
  .addStateTransition("leave", function* ({ parsedInput }) {
    yield* World.resolve(leave, { user: parsedInput.user });
  });
```

The runtime calls `stm.processInput(input)` for every batcher subunit; the
DSL parses against `grammar`, finds the right handler, and the generator
yields `World.resolve(...)` so the runtime can execute the pgtyped queries.

Applications whose runtime derives grammar from configured primitives can
instead construct `new StateMachine()` and register handlers fluently. The
canonical runner calls `bindGrammar(...)` once; application code does not need
a standalone grammar, transition map, adapter generator, or manual
`processInput` wrapper. Binding rejects duplicate configured prefixes,
registered prefixes absent from runtime grammar, and configured prefixes
without handlers before sync starts. The constructor-with-grammar form above
remains available for precise explicit-grammar callers.

Each `addStateTransition(...)` returns the same object and preserves yielded
operations from the registered generator. Duplicate registration is rejected
immediately, and each successfully parsed input dispatches exactly once. An
unbound generic state machine exposes the precision of the selected primitive
grammar; it does not infer callback types from a sibling configuration object.
The Midnight generic primitive currently exposes `payload` as `Type.Any`.

## Inside EffectStream

`StateMachine` is the central piece a node author writes. The runtime's per-block
loop wires each user input through the corresponding `StateMachine` instance,
collects yielded SQL, and commits it inside the per-block transaction.
The built-in primitives package (`@effectstream/sm/builtin`) covers
common on-chain events - ERC-20/721/1155 transfers, Cardano transfers,
Midnight events, etc. - so you don't re-implement them.

## Key exports

- `StateMachine<Grammar, Events>`: the canonical state machine. `.addStateTransition(prefix, handler)` fluently returns the same instance; `.processInput(input)`, `.grammar`, `.fullJsonGrammar`, and `.keyedJsonGrammar` remain available.
- `Stm<Grammar, Events>`: a transitional alias of the exact same `StateMachine`
  constructor and implementation for gradual migration. New code should use
  `StateMachine`; the alias is not a second dispatcher.
- `ParamToData<Params>` derives the typed argument shape from a grammar entry.
- `BaseStfInput`: input shape passed to every handler. Includes `blockTimestamp`, `blockHeight`, etc.
- `delegate-wallet` helpers - account delegation primitives reused by built-ins.

`MessageListener<Events, Params>` is exported as the handler type but is
inferred at call sites rather than imported directly.

Subpath exports:

- `@effectstream/sm/builtin`: `PrimitiveTypeEVMERC20`, `PrimitiveTypeEVMERC721`, `PrimitiveTypeEVMERC1155`, `PrimitiveTypeEVMEffectstreamL2`, `PrimitiveTypeCardanoTransfer`, `PrimitiveTypeMidnightGeneric`, `PrimitiveTypeUtxorpcGeneric`, and 20+ more chain-specific event tags.
- `@effectstream/sm/grammar`: the underlying grammar/parsing utilities, also re-exported from `@effectstream/concise`.

## Examples

- [`primitives/src/evm-erc20/erc20-primitive.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/node-sdk/sm/primitives/src/evm-erc20/erc20-primitive.test.ts) - a real primitive's behavior unit-tested.
- Canonical fluent and runtime-binding coverage:
  [`test/state-machine.test.ts`](./test/state-machine.test.ts).

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/sm
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/sm

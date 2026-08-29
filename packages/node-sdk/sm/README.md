# @effectstream/sm

The state-machine DSL inside an EffectStream node. Define a typed grammar
of commands, register one generator per command, and `StateMachine` parses each
incoming batcher input, dispatches it to the right handler, and yields
SQL updates through the runtime. `Stm` is an alias of the same constructor for
source compatibility.

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

This package pairs with [`@effectstream/runtime`](https://www.npmjs.com/package/@effectstream/runtime),
which drives a per-block loop that calls `stm.processInput(...)` for every
batcher subunit, collects the SQL yielded by your generators, and commits
it inside a per-block postgres transaction. You author the DSL here;
the runtime executes it.

The DSL is also directly testable in a pure-TS unit test (parse + dispatch
without a database) - see
[`primitives/src/evm-erc20/erc20-primitive.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/node-sdk/sm/primitives/src/evm-erc20/erc20-primitive.test.ts).

```typescript
import { StateMachine } from "@effectstream/sm";
import { World } from "@effectstream/coroutine";
import { Type } from "@sinclair/typebox";
import { join, leave } from "./queries.ts"; // pgtyped queries

const stateMachine = new StateMachine({
  join: [["user", Type.String()]],
  leave: [["user", Type.String()]],
})
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

The constructor requires a grammar and exposes that exact object as
`stateMachine.grammar`. `addStateTransition` returns the same instance, so the
registrations above can be chained without introducing a wrapper or a second
transition map. A host dispatches directly with
`stateMachine.processInput(input)`.

Use a named grammar when it is shared or when an application supplies an
explicit events type:

```typescript
import { StateMachine, Stm } from "@effectstream/sm";
import { Type } from "@sinclair/typebox";

const grammar = {
  join: [["user", Type.String()]] as const,
} as const;

const stateMachine = new StateMachine(grammar).addStateTransition(
  "join",
  function* ({ parsedInput }) {
    console.log(parsedInput.user);
  },
);

type Events = { readonly example: "event" };
const compatible = new Stm<typeof grammar, Events>(grammar);

StateMachine === Stm; // true: Stm is the same value and type constructor
```

## Inside EffectStream

`StateMachine` is the central piece a node author writes. The runtime's
per-block loop wires each user input through the corresponding instance,
collects yielded SQL, and commits it inside the per-block transaction.
The built-in primitives package (`@effectstream/sm/builtin`) covers
common on-chain events - ERC-20/721/1155 transfers, Cardano transfers,
Midnight events, etc. - so you don't re-implement them. Canonical-runner
adoption of the public `stateMachine.grammar` is separate downstream work; this
package supplies the constructor-owned grammar and direct dispatcher.

## Key exports

- `StateMachine<Grammar, Events>`: the canonical state machine. `.addStateTransition(prefix, handler)`, `.processInput(input)`, `.grammar`, `.fullJsonGrammar`, `.keyedJsonGrammar`.
- `Stm<Grammar, Events>`: compatibility alias of the exact `StateMachine` constructor.
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

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/sm
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/sm

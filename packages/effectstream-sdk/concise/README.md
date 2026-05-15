# @effectstream/concise

Type-safe, compact message schemas for EffectStream — the wire format the
batcher uses to pack many small user inputs into one on-chain transaction.
Define a grammar of allowed commands; the package generates, parses, and
validates inputs against it with TypeBox.

## Install

```bash
bun add @effectstream/concise
# or
npm install @effectstream/concise
```

## Standalone usage

The batcher message construction primitives work entirely client-side.
Browsers, CLIs, and tests use them to build the exact message the user's
wallet has to sign before posting to the batcher.

```typescript
import {
  createBatcherSubunit,
  createMessageForBatcher,
  hashBatchSubunit,
} from "@effectstream/concise";
import { AddressType } from "@effectstream/utils";

const timestamp = String(Date.now()) as `${number}`;
const address = "0x1234567890123456789012345678901234567890";
const inputData = "join|alice";

// 1. Build the canonical message the wallet signs.
const message = createMessageForBatcher(
  /* namespace */ null,
  timestamp,
  address,
  AddressType.EVM,
  inputData,
);
// const signature = await wallet.signMessage(message);

// 2. Pack the signed input into a batcher subunit.
const subunit = createBatcherSubunit(
  timestamp,
  address,
  AddressType.EVM,
  /* signature */ "0x…",
  inputData,
);

// 3. The batcher hashes each subunit when committing.
const hash = hashBatchSubunit(subunit);
```

The "grammar" half of the package lets you define what `inputData` strings
look like once decoded — each command is a list of `[paramName, schema]`
tuples:

```typescript
import {
  generateStmInput,
  parseStmInput,
  toKeyedJsonGrammar,
} from "@effectstream/concise";
import { Type } from "@sinclair/typebox";

const grammar = {
  join: [["user", Type.String()]] as const,
  leave: [["user", Type.String()]] as const,
} as const;

const keyed = toKeyedJsonGrammar(grammar);

const tuple = generateStmInput(grammar, "join", { user: "alice" });
// tuple === ["join", "alice"]

const parsed = parseStmInput(JSON.stringify(tuple), grammar, keyed);
// parsed.prefix === "join", parsed.data.user === "alice"
```

## Inside EffectStream

`@effectstream/concise` sits between user-facing wallets and the batcher:
clients build messages with the helpers above, sign them through
`@effectstream/wallets`, and POST them to the batcher HTTP endpoint
(`@effectstream/batcher-sdk`). The batcher then runs the same encoding to
pack accepted subunits into the on-chain transaction the state machine
later reads.

## Key exports

Batcher message construction:

- `createBatcherSubunit(ts, address, addressType, signature, input)` — pack a single signed input.
- `createMessageForBatcher(namespace, ts, address, addressType, input, target?)` — canonical string the wallet signs.
- `hashBatchSubunit(input)` — `0x`-prefixed keccak256 over the subunit.
- `buildBatchData(maxSize, inputs)` — pack as many subunits as fit under a byte budget.
- `extractBatches(inputData)` — inverse of `buildBatchData`; pull subunits back out of a batched payload.

Grammar / schema:

- `BatcherGrammar`, `BuiltinGrammar`, `KeyedBatcherGrammar` — built-in command sets.
- `generateStmInput(grammar, command, data)` / `generateRawStmInput(...)` — serialize a typed value.
- `parseStmInput(grammar, raw)` / `parseRawStmInput(...)` — parse and validate.
- `toFullJsonGrammar(...)`, `toKeyedJsonGrammar(...)` — derive TypeBox schemas from a grammar map.
- `usesPrefix(input, prefix)` — quick check.
- `extractDelegateWallet(...)` — pull the delegated wallet out of an account-delegation input.
- `accountMessages`, `accountPayload_` — helpers for the standard account-linking commands.

## Examples

Runnable: [`src/batcher.test.ts`](./src/batcher.test.ts),
[`src/delegate.test.ts`](./src/delegate.test.ts), and
[`test/examples.test.ts`](./test/examples.test.ts).

End-to-end batcher flow:
[`e2e/evm/sync/batcher.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/e2e/evm/sync/batcher.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/concise
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/concise

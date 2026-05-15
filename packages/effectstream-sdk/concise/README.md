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

### Building and parsing concise inputs

Most of the in-repo usage centers on the grammar API: define a tuple
shape per command, then encode (`generateRawStmInput` /
`generateStmInput`) and decode (`parseStmInput`) values against it.

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

### Batcher message construction

The package also ships primitives for building the exact message a
user's wallet signs before posting to the batcher. These are intended
for client SDKs that submit to the batcher HTTP endpoint (and as a
reference encoder for tests).

```typescript
import {
  createBatcherSubunit,
  createMessageForBatcher,
  hashBatchSubunit,
} from "@effectstream/concise";
import { AddressType } from "@effectstream/utils";

const message = createMessageForBatcher(
  null,
  String(Date.now()) as `${number}`,
  "0x1234567890123456789012345678901234567890",
  AddressType.EVM,
  "join|alice",
);
// const signature = await wallet.signMessage(message);

const subunit = createBatcherSubunit(
  String(Date.now()) as `${number}`,
  "0x1234567890123456789012345678901234567890",
  AddressType.EVM,
  /* signature */ "0x…",
  "join|alice",
);
const hash = hashBatchSubunit(subunit);
```

## Inside EffectStream

`@effectstream/concise` sits between user-facing wallets and the batcher:
clients build messages with the helpers above, sign them through
`@effectstream/wallets`, and POST them to the batcher HTTP endpoint
(`@effectstream/batcher-sdk`). The batcher then runs the same encoding to
pack accepted subunits into the on-chain transaction the state machine
later reads.

## Key exports

Grammar / schema (heavily used across the runtime + state machine):

- `generateRawStmInput(grammarEntry, prefix, data)` — the high-volume encoder (`~46` cross-package call sites in this repo).
- `buildBatchData(maxSize, inputs)` — pack as many subunits as fit under a byte budget (used in the batcher's submission path; `~35` sites).
- `BatcherGrammar`, `BuiltinGrammar` — built-in command sets.
- `generateStmInput(grammar, command, data)` — typed value → JSON tuple.
- `parseStmInput(rawJson, grammar, keyed)` — parse and validate.
- `toFullJsonGrammar(...)`, `toKeyedJsonGrammar(...)` — derive TypeBox schemas from a grammar map.
- `extractBatches(inputData)` — inverse of `buildBatchData`.
- `extractDelegateWallet(...)` — pull the delegated wallet out of an account-delegation input.
- `accountMessages`, `accountPayload_` — helpers for the standard account-linking commands.

Batcher message construction (intended for external client SDKs and
tests; the in-repo batcher uses a lower-level path):

- `createMessageForBatcher(namespace, ts, address, addressType, input, target?)` — canonical string the wallet signs.
- `createBatcherSubunit(ts, address, addressType, signature, input)` — pack a signed input into a subunit shape.
- `hashBatchSubunit(input)` — `0x`-prefixed keccak256 over the subunit.

`KeyedBatcherGrammar`, `parseRawStmInput`, `usesPrefix` are exported but
currently have no consumers in this monorepo — kept for downstream
SDK use.

## Examples

Runnable: [`src/batcher.test.ts`](./src/batcher.test.ts),
[`src/delegate.test.ts`](./src/delegate.test.ts), and
[`test/examples.test.ts`](./test/examples.test.ts).

End-to-end batcher flow:
[`e2e/evm/sync/batcher.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/e2e/evm/sync/batcher.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/concise
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/concise

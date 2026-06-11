---
name: create-primitive
description: Add a new built-in sync primitive to the Effectstream SDK, end-to-end — the SDK primitive module + registration, the chain client/fetcher wiring that reads the event from the chain, the consumer-side config/STM-handler/table wiring, and e2e coverage that proves it live. Use this skill whenever the user wants to create or add a primitive, index or track a new kind of on-chain event or data stream (nullifiers, UTXO creates/spends, merkle tree roots, token transfers, registrations, deposits, …) into the state machine, extend a chain's fetcher with a new event type, or asks how a primitive flows from chain to database. Trigger even if they don't say "primitive" — "make the node track X from the chain" is this skill.
---

# create-primitive

A **primitive** is Effectstream's unit of chain data ingestion: the per-chain
fetcher reads one kind of on-chain event each block, wraps it in a typed
payload, and the runtime (a) records it in `effectstream.primitive_accounting`
and (b) optionally dispatches it as a state-machine input under a
`stateMachinePrefix` so app code can react to it in a deterministic, replayable
way. One primitive *class* (e.g. `Midnight:Nullifier`) can be instantiated many
times in a node's config with different instance names and prefixes.

This skill exists because a primitive is not one file — it's a chain of ~8 SDK
edits plus consumer wiring plus e2e coverage, and several steps fail silently
or only at runtime if you get them wrong (fetch flags, GraphQL interface
fields, replay determinism, publish ordering). The flow below is extracted
from primitives that shipped through this exact checklist
(`Midnight:Nullifier`, `Midnight:UnshieldedSpend`, and the
`Midnight:UnshieldedCreate` / `Midnight:ZswapRoot` pair from PR #763).

**Before writing a new primitive, check you actually need one.** Every chain
has a `*-generic` primitive (e.g. `Midnight:Generic`) that surfaces per-block
contract state for a configured contract address. If the data you want is
derivable from a contract's ledger state, configure the generic primitive
instead. Write a new primitive only for a first-class chain event stream that
isn't tied to one contract (ledger events, UTXO lifecycle, tree roots,
chain-level registrations).

## The file inventory

A new primitive touches exactly these places. Use an existing primitive of the
same chain as a living reference while you work —
`packages/node-sdk/sm/primitives/src/midnight-nullifier/` is a good minimal
one (`midnight-zswap-root` / `midnight-unshielded-create` are richer examples
once PR #763 is merged).

**SDK side (`packages/node-sdk/`):**

| # | File | Change |
|---|------|--------|
| 1 | `sm/primitives/src/builtin.ts` | `PrimitiveType<Name>` string constant + add to the `BuiltInPrimitives` union |
| 2 | `sm/primitives/src/<chain>-<name>/<chain>-<name>-grammar.ts` | the payload grammar (new file) |
| 3 | `sm/primitives/src/<chain>-<name>/<chain>-<name>.ts` | the primitive class (new file) |
| 4 | `sm/primitives/src/mod.ts` | import + `builtInPrimitivesMap` entry + re-export |
| 5 | `sync/src/sync-protocols/<chain>/<Chain>Client.ts` | fetch option flag + the query field(s) that read the event |
| 6 | `sync/src/sync-protocols/<chain>/fetcher.ts` | enable the flag when the primitive is configured + a `fetch<Name>s()` emission method + dispatch branch |

**Consumer side (any node: a template's `packages/node/`, or `e2e/<chain>/`):**

| # | File | Change |
|---|------|--------|
| 7 | `config.ts` | `.addPrimitive(...)` entry on the chain's parallel sync protocol |
| 8 | `grammar.ts` | a grammar entry keyed by the `stateMachinePrefix` |
| 9 | `node.ts` (or the template's state-machine module) | `stm.addStateTransition(prefix, ...)` handler writing to a user table |
| 10 | DB migration (`create-user-tables.sql` or template migration) | the user table |
| 11 | test runner (`run-tests.ts`) | an on-chain trigger + assertions (see e2e section) |

Nothing else changes: `@effectstream/config` treats the type string opaquely
and the runtime dispatches through the `mod.ts` map, so don't go hunting for a
config-schema registry to extend.

## Step 1 — type constant (`builtin.ts`)

The convention is `"<Chain>:<PascalName>"`:

```ts
export const PrimitiveTypeMidnightZswapRoot = "Midnight:ZswapRoot" as const;
```

Add `typeof PrimitiveTypeMidnightZswapRoot` to the `BuiltInPrimitives` union in
the same file. Consumers import this from `@effectstream/sm/builtin`.

## Step 2 — grammar

The grammar defines the shape of the state-machine input. The established
convention for chain-event primitives is a single `payload` field, loosely
typed — the payload is produced by your own fetcher (not user input), so
`Type.Any()` keeps the grammar stable while the payload evolves:

```ts
import { Type } from "@sinclair/typebox";

export const midnightZswapRootGrammar = [
  ["payload", Type.Any()],
] as const;
```

If you want consumers to get typed payloads, tighten this with a TypeBox
object — but look at what the chain's existing primitives do first and match
them; mixed conventions in one chain are worse than a loose one.

## Step 3 — the primitive class

Copy an existing primitive of the same chain and adjust. The class is mostly
boilerplate that adapts fetcher output to the runtime; the real logic lives in
the fetcher (step 6). Anatomy, using the shipped `MidnightZswapRootPrimitive`:

```ts
export class MidnightZswapRootPrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,   // which sync protocol it rides
  typeof midnightZswapRootGrammar
> {
  readonly internalTypeName = PrimitiveTypeMidnightZswapRoot;
  override readonly grammar = midnightZswapRootGrammar;

  // no dynamic tables / view prefixes for plain event streams
  override dynamicTables = undefined;
  override getIntermediatePrefix(): string[] { return []; }
  override getViewPrefix(): string[] { return []; }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string;
  }) { super(config); }

  override *getPayload(_, primitiveTransactionData) {
    // the fetcher already shaped the payload — pass it through
    const payload = primitiveTransactionData.output.payload;
    const accountingPayload = { payload };
    const stateMachinePayload = this.stateMachinePrefix
      ? generateRawStmInput(this.grammar, this.stateMachinePrefix, accountingPayload)
      : null;
    return {
      isBatched: false,
      data: [{
        fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
        accountingPayload,
        stateMachinePayload,
      }],
    };
  }

  override getConfig() {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix ?? "",
    } as const;
  }
}
```

Read the real file for the exact imports and generic signatures — they matter
and the compiler will tell you if you drift. Write a doc comment on the class
saying what the event means on-chain, what the payload fields are, and a short
`stm.addStateTransition` usage example — consumers discover primitives by
reading these files.

## Step 4 — register (`mod.ts`)

Three edits in `sm/primitives/src/mod.ts`: import the class, add
`[PrimitiveTypeMidnightZswapRoot]: MidnightZswapRootPrimitive` to
`builtInPrimitivesMap`, and add the class to the `export { ... }` block. The
map entry is what makes a config `type:` string instantiate your class —
forgetting it produces an unknown-primitive error at node boot.

## Step 5 — chain client: read the event

In the chain's client (e.g.
`sync/src/sync-protocols/midnight/MidnightClient.ts`), the block query is
assembled from option flags so nodes only pay for the fields their configured
primitives need. Add a flag to `BlockFetchOptions` (default `false`) and the
corresponding field to the query + the block-state type.

Two traps from the Midnight indexer (GraphQL) that generalize:

- **Interface-typed results need inline fragments.** A field that exists only
  on a concrete type (e.g. `zswapMerkleTreeRoot` on `RegularTransaction`, not
  on the `Transaction` interface) silently returns nothing if you select it
  directly — select it via `... on RegularTransaction { zswapMerkleTreeRoot }`.
- **Keep the payload verbatim.** Pass strings through exactly as the source
  returns them (no re-hexing, no case changes). The e2e fidelity check
  (below) asserts byte-equality between what you stored and what the source
  reports, which is only meaningful if nothing in between transforms it.

## Step 6 — fetcher: emit per block

In `sync/src/sync-protocols/<chain>/fetcher.ts`:

1. Enable the fetch flag when any configured primitive has your type
   (mirror the existing `this.config.primitives.some((p) => p.primitive.type === "Midnight:ZswapRoot")` lines).
2. Add a dispatch branch for your type. Pure transforms of already-fetched
   block data go in the **sync** list; anything needing extra I/O per block
   goes in the **async** ops list (see `fetchContractState`).
3. Write the emission method. The shape:

```ts
fetchZswapRoots(height, primitiveEntry, block): PrimitiveType[] {
  // derive zero or more events from the block …
  return [{
    syncProtocol: {
      name: primitiveEntry.syncProtocol,
      blockNumber: height,
      transactionHash: txHash,
      contractAddress: "",
    },
    primitive: primitiveEntry.primitive.name,   // the INSTANCE name from config
    output: {
      payloadType: "midnight-zswap-root",        // kebab-case of the primitive
      payload: { root, txHash },                 // your payload contract
    },
  }];
}
```

Rules that earn their keep:

- **Deterministic per block.** The same block must always emit the same
  events in the same order — sync replay depends on it. No clocks, no
  randomness, no state carried between blocks.
- **Emit nothing when nothing happened.** A block with no matching events
  returns `[]`, not a placeholder.
- **Always include `txHash`** (or the chain's equivalent reference) in the
  payload — consumers need it to cross-check against the source of truth, and
  `data.blockHeight` in the STM handler is the *Effectstream* height, not the
  chain height, so the payload is the only chain-side anchor.
- **Log per-height read failures.** The fetch loop retries failed heights
  silently; without an error log a bad query stalls the merge with zero
  symptoms except "no new blocks" (this exact failure cost a day of
  debugging — the log line now exists in the Midnight fetcher; keep it true
  for yours).

## Step 7 — consumer wiring

In the consuming node (template or e2e):

```ts
// config.ts — on the chain's parallel sync protocol
.addPrimitive(
  (syncProtocols) => (syncProtocols as any).parallelMidnight,
  (network, deployments, syncProtocol) => ({
    name: "Midnight-ZswapRoot",          // instance name (primitive_accounting key)
    type: PrimitiveTypeMidnightZswapRoot, // from @effectstream/sm/builtin
    startBlockHeight: 1,
    stateMachinePrefix: "midnightZswapRootState",
    networkId: midnightNetworkConfig.id,
  }),
)
```

```ts
// grammar.ts
"midnightZswapRootState": [["payload", Type.Any()]],
```

```ts
// node.ts — the STM handler. Idempotent writes only.
stm.addStateTransition("midnightZswapRootState", function* (data) {
  const { payload } = data.parsedInput;
  yield* World.promise(pool.query(
    `INSERT INTO midnight_zswap_roots (block_height, root, tx_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (root) DO UPDATE SET block_height = EXCLUDED.block_height`,
    [data.blockHeight, String(payload?.root ?? ""), String(payload?.txHash ?? "")],
  ));
});
```

Pick the `ON CONFLICT` semantics deliberately: `DO NOTHING` for append-only
sets (nullifiers, UTXO creates — re-observing is a no-op), `DO UPDATE` for
latest-wins values (a re-observed tree root refreshes its height, mirroring
the ledger's own re-insertion semantics). The handler must tolerate replays —
the runtime can re-deliver inputs after a restart.

Add the user table to the consumer's migration with a uniqueness constraint
matching the event's natural key.

## Step 8 — e2e coverage (`e2e/<chain>/`)

Every built-in primitive gets SDK-level e2e coverage. The e2e workspace
resolves `@effectstream/sm` via `workspace:*`, so your unpublished primitive
is testable immediately — no publish, no linking. The pattern (see the
Midnight suite, which covers Nullifier and — post-#763 — UnshieldedCreate +
ZswapRoot):

1. Wire steps 7's four files inside `e2e/<chain>/` (config, grammar, node,
   `database/migrations/create-user-tables.sql`).
2. **Generate the event on-chain.** Add a `trigger<Name>s()` helper to the
   chain's shared test utilities (e.g.
   `e2e/shared/contracts/midnight/faucet.ts` — `triggerNullifiers` does a
   shielded self-transfer; `triggerUnshieldedCreates` an unshielded one) and
   call it from `run-tests.ts` after the sync node is healthy. Prefer reusing
   the suite's existing wallet/transfer helpers over new machinery.
3. **Assert in three layers** (use `assertSQL`, which polls):
   - `effectstream.primitive_accounting` has rows for your instance name —
     proves the primitive ran at all;
   - the user table has shape-valid rows (non-empty keys, sane indexes) —
     proves the STM handler parsed the payload;
   - a **fidelity cross-check**: take a stored row and re-query the chain's
     source of truth (e.g. the local indexer's GraphQL) for the same
     transaction; assert byte-equality. This proves fetcher → STM → DB didn't
     mangle the value, and it's the assertion that catches quiet encoding bugs.
4. **Run the negative check once**: comment out the trigger, re-run, and
   confirm your assertions fail by timeout while the rest of the suite stays
   green. An assertion that passes without its trigger is testing nothing.
   Revert the comment.

Run with `bun run e2e/runner.ts <chain>`. Stop any local orchestrator first
(`bun packages/build-tools/orchestrator/src/cli.ts stop`) — suites share
ports, and a leftover dev stack produces confusing cross-talk failures.

## Publish ordering (templates)

Templates pin **published** `@effectstream/*` versions and CI template-tests
installs from npm — a template cannot reference your new
`PrimitiveType<Name>` until the SDK release containing it is published (the
sync node dies at import with `Export named '…' not found`). Sequence
accordingly:

1. SDK primitive + e2e coverage → one PR (e2e proves it pre-publish).
2. Merge, release/publish.
3. Template wiring + pin bump → follow-up (or accept a red template-tests gate
   on a combined PR and say so in the PR description).

For local template development against unpublished SDK code there is a
`link.sh` flow with significant wasm-instance sharp edges — that's template
territory, not this skill; just don't be surprised that a template can't see
your primitive before a publish.

## Definition of done

- [ ] `builtin.ts` constant + union; grammar file; primitive class with doc
      comment; `mod.ts` import/map/export.
- [ ] Client fetch flag + query field (inline fragment if the field lives on a
      concrete type); fetcher flag wiring + deterministic emission + failure
      logging.
- [ ] Consumer wiring compiles and the node boots.
- [ ] e2e: trigger + three assertion layers green; negative check confirmed;
      `bun run e2e/runner.ts <chain>` fully green.
- [ ] If a template will consume it: publish-ordering plan stated in the PR.

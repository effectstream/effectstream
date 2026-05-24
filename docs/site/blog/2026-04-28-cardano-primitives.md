---
slug: cardano-primitives
title: "Cardano Primitives: From Indexer Tasks to First-Class Chain Events"
authors: [effectstream]
tags: [cardano, primitives, dolos, utxorpc, technical]
---

When we set out to connect Cardano to game state, we started from the obvious place: write an indexer task. Each new use-case got its own custom Carp module, its own SQL schema, its own glue code. After the third one - stake-pool delegation, projected NFTs, native-asset transfers - it was clear we'd been writing the same scaffold three times. EffectStream now ships those scaffolds as **Cardano Primitives**: a shared architecture that turns Dolos/UTxORPC streams into typed, queryable state machine events, with five concrete primitives delivered out of the box.

<!-- truncate -->

## What a primitive is

A primitive is a small contract between a chain and an application state machine:

1. **A predicate** that the indexer (Dolos via UTxORPC) evaluates server-side to filter transactions before they ever leave the gRPC stream.
2. **A typed grammar** - a TypeBox schema declaring the shape of the event the primitive emits.
3. **An IVM (Indexed View Materializer)** - a PostgreSQL materialised view definition that maintains a queryable snapshot of state as events arrive.
4. **A state-machine prefix** - every event the primitive emits routes to the application's `addStateTransition(prefix, ...)` handler under this name.

Five primitives ship with EffectStream today, all sharing the same architecture:

| Primitive | What it tracks | UTxORPC predicate | IVM view |
|---|---|---|---|
| `Cardano:Transfer` | ADA + native-asset transfers | `has_address` | none (event-only) |
| `Cardano:MintBurn` | Token mints and burns | `mints_asset` | none (event-only) |
| `Cardano:DelayedAsset` | UTxO creation/spending for a policy | `moves_asset` | `cardano_asset_utxos_view_<name>` |
| `Cardano:PoolDelegation` | Stake pool delegations (pre-Conway + Conway) | `has_certificate` | `cardano_pool_delegation_view_<name>` |
| `Cardano:ProjectedNFT` | Lock/Unlock/Claim on a Hololocker script | `has_address` (by `payment_part`) | `cardano_projected_nft_view_<name>` |

Source for all five lives in [`packages/node-sdk/sm/primitives/src`](https://github.com/effectstream/effectstream/tree/v-next/packages/node-sdk/sm/primitives/src).

## Why this isn't just an indexer

The temptation when wiring a new chain integration is to start with a generic block listener and write parsing logic in the application. That works once. By the second integration you're re-parsing UTXOs in two places; by the third you're trying to remember which event normalisation lives in which template.

The primitive pattern pushes three concerns down the stack:

- **Filtering** moves to the gRPC layer. Dolos evaluates the predicate before serialising - your application never sees a transaction it doesn't care about.
- **Parsing** moves into the primitive. The Hololocker datum, Conway delegation certificates, CIP-14 asset fingerprints - each gets parsed once, in the primitive, into a stable typed payload.
- **State materialisation** moves into Postgres. The IVM definition declares the table shape and the triggers; EffectStream keeps it consistent with the stream.

What's left in the application is the part you actually wanted to write: the state transition handler that decides what *your game* does when a delegation changes or an NFT gets locked.

## Worked example: the Projected NFT primitive

The `CardanoProjectedNFT` primitive is the densest of the five because the Hololocker contract has a non-trivial state machine - Lock, Unlocking (with a time-lock expiry), and Claim - and each of those transitions has to be reconstructed from raw inputs and outputs.

The grammar declares the typed payload:

```typescript
export const projectedNftGrammar = [
  ["ownerAddress", Type.String()],
  ["previousTxId", Type.String()],
  ["previousOutputIndex", Type.String()],
  ["currentTxId", Type.String()],
  ["currentOutputIndex", Type.String()],
  ["policyId", Type.String()],
  ["assetName", Type.String()],
  ["status", Type.String()],     // "Lock" | "Unlocking" | "Claim"
  ["forHowLong", Type.String()], // time-lock expiry for Unlocking
] as const;
```

Wiring it into a config is a few lines:

```typescript
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelUtxoRpc,
    () => ({
      name: "GameNFTLocker",
      type: PrimitiveTypeCardanoProjectedNFT,
      startBlockHeight: 1,
      stateMachinePrefix: "cardano-projected-nft",
      scriptHash: "abc123...",  // hololocker script hash
      network: "yaci",
    }),
  )
)
```

And the state machine subscribes by registering a handler against the prefix:

```typescript
stm.addStateTransition("cardano-projected-nft", function* (data) {
  const { ownerAddress, policyId, assetName, status, forHowLong } =
    data.parsedInput;

  if (status === "Lock") {
    yield* World.resolve(grantPower, { address: ownerAddress, policyId });
  } else if (status === "Claim") {
    yield* World.resolve(revokePower, { address: ownerAddress, policyId });
  }
});
```

The primitive itself does the heavy lifting: walking `tx.inputs` and `tx.outputs` at the script address, parsing the Hololocker `State` datum, matching consumed inputs to produced outputs to detect state transitions, and emitting one event per transition. None of that logic appears in the game.

## Why projected NFTs are the same architecture as pool delegation

The `CardanoPoolDelegation` primitive was the first to ship under this pattern (as part of the [stake pool delegation work](/docs/blog/stakepool-delegation)). When we built `CardanoProjectedNFT`, almost everything carried over:

- Same UTxORPC parallel sync protocol (`CARDANO_UTXORPC_PARALLEL`).
- Same grammar + state-machine prefix mechanic.
- Same IVM scaffolding for the materialised view (UPSERT on transitions, DELETE on terminal events).
- Same handler signature on the state-machine side.

What differs is local: the predicate (`has_certificate` for delegation, `has_address` for the script), the payload (delegation triple vs. NFT lock state), the IVM trigger logic (replace-on-change vs. lock/unlocking/claim lifecycle), and the datum parser (no datum for delegation; a CBOR Plutus datum walk for Projected NFTs). The shared scaffold is what lets a new primitive be a few hundred lines of focused code rather than a multi-week integration.

The five primitives that ship today are the ones we needed for the templates we're building. Adding a sixth - Cardano voting, drep delegation, governance actions - would follow the same shape.

## Running the template

Each primitive is paired with a runnable template that exercises it end-to-end:

- `templates/cardano-delegation` - `CardanoPoolDelegation` + Stake Pool Delegation Explorer dApp
- `templates/projected-nft-preorder` - `CardanoProjectedNFT` + Hololocker lock/unlock/claim UI plus a campaign + marketplace state machine on top

Both templates start the same way:

```bash
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/projected-nft-preorder   # or cardano-delegation
bun install
bun run dev
```

The orchestrator brings up PGLite, YACI DevKit, Dolos, the sync node, and the frontend together. Open the URL printed in the terminal and the primitive is live - every state transition emitted by the primitive is observable in the materialised view and surfaced on the frontend.

## What this unlocks

Once a chain has a primitive layer, the cost of adding a new on-chain integration drops to "implement the predicate + parser + IVM, then write the game logic." The five primitives that ship today cover the most common Cardano integration patterns - fungible transfers, native-asset lifecycle, mint/burn, stake-pool delegation, and projected-NFT custody. A new primitive can plug into the same machinery without touching the framework.

---

- [All five Cardano primitives source](https://github.com/effectstream/effectstream/tree/v-next/packages/node-sdk/sm/primitives/src)
- [Cardano Primitives reference docs](/docs/home/chains/cardano#primitives)
- [Stake Pool Delegation post](/docs/blog/stakepool-delegation) - the first primitive built on this architecture
- [Projected NFTs post](/docs/blog/projected-nfts) - the Hololocker dApp + ProjectedNFT primitive end-to-end
- [`cardano-delegation` template](https://github.com/effectstream/effectstream/tree/v-next/templates/cardano-delegation)
- [`projected-nft-preorder` template](https://github.com/effectstream/effectstream/tree/v-next/templates/projected-nft-preorder)

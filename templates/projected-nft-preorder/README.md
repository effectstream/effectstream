# Projected NFT Pre-Order — Cardano

> Runnable PRC-2 reference for Cardano: locks an NFT at the Hololocker Plutus script and indexes the Lock → Unlocking → Claim lifecycle into Postgres.

[PRC-2](https://effectstream.io/home/paima-standards/prc2) describes *projecting* an NFT: instead of bridging it, the owner locks it at a contract on its home chain and the application treats that lock as proof of ownership. Withdrawal goes through a time-locked cooldown, so the asset can never be in use in two places at once. This template is the Cardano-side implementation of that idea, end to end — the Aiken-compiled Hololocker validator, a local Cardano devnet, an Effectstream node running `PrimitiveTypeCardanoProjectedNFT`, and a React dApp that mints, locks, unlocks and claims a test NFT from the browser.

The interesting problem is the one Cardano forces on you: there are no events. A Plutus script emits nothing. All you get is a stream of transactions, each consuming some UTxOs and producing others. Turning that into "this NFT was locked, then unlock was requested, then it was claimed" is the primitive's job, and this template is the shortest complete illustration of how it does it.

## What this template shows

**A UTxO state machine reconstructed by diffing inputs against outputs.** `PrimitiveTypeCardanoProjectedNFT` does not look for a log line, because there is none. For each transaction it collects the inputs whose resolved address carries the configured script hash, then walks the outputs at that same address. An output with a parseable Hololocker datum and a matching consumed input is a *state transition*; an output with no matching input is a fresh `Lock`. Then comes the part worth copying:

> Remaining script inputs with no corresponding output = Claims — the NFT left the script and returned to the owner's wallet.

The `Claim` event is inferred from an **absence**. Nothing in the transaction says "claim"; what says it is that a script UTxO was consumed and nothing replaced it. Any UTxO-based lifecycle you want to index — vaults, escrows, staking positions — is detected the same way.

**The application state is the datum, so the datum is the schema.** The Hololocker `State` datum is `State { owner, status: Locked | Unlocking(out_ref, for_how_long) }`, CBOR-encoded PlutusData. The primitive's datum parser walks that `Constr` tree and produces exactly the nine fields the grammar declares — owner, the previous and current UTxO references, `policyId`, `assetName`, `status`, and `forHowLong`. `packages/contracts-cardano/cardano-tx-helpers.ts` builds the mirror image of the same structure with Lucid, and the two halves are worth reading side by side:

```ts
function makePkhLockDatum(walletPKH: string): string {
  return Data.to(new Constr(0, [
    new Constr(0, [walletPKH]),   // Owner::PKH
    new Constr(0, []),            // Status::Locked
  ]));
}

function makePkhUnlockingDatum(walletPKH: string, lockTxHash: string, lockOutputIndex: number, forHowLong: bigint): string {
  return Data.to(new Constr(0, [
    new Constr(0, [walletPKH]),
    new Constr(1, [               // Status::Unlocking
      new Constr(0, [
        new Constr(0, [lockTxHash]),
        BigInt(lockOutputIndex),
      ]),
      forHowLong,                 // POSIX ms after which a claim is valid
    ]),
  ]));
}
```

**Two representations of the same lifecycle, and only one of them forgets.** The template's own `nft_locks` table is append-only history: `Lock`, `Unlocking` and `Claim` each add a row, and a claimed NFT's rows stay forever. The primitive *also* maintains a materialised view of what is currently at the script, created automatically from its `dynamicTables`. That one is a live set, not a log: a `Lock` or `Unlocking` upserts a row keyed by `(primitive_name, current_tx_id, current_output_index)` and deletes the row for the UTxO it replaced, while a `Claim` **deletes the row for `previousTxId` / `previousOutputIndex` and inserts nothing**. Once an NFT is claimed it vanishes from the view, which is exactly what an application asking "is this NFT projected right now?" needs. Query the view (`primitives.cardano_projected_nft_view_cardanoprojectednft`, named after the primitive instance) for current state; query `nft_locks` for history.

**The address you sync isn't known until you compile.** A Plutus script's hash falls out of its compiled code, so the primitive cannot be configured with a literal. `packages/contracts-cardano/submit-tx.ts` computes it at boot and writes it to disk; `packages/node/config.dev.ts` reads that file, and warns rather than crashing if it is missing:

```ts
const scriptHashFile = path.resolve(import.meta.dirname!, "../contracts-cardano/temp/hololocker-script-hash.txt");
const HOLOLOCKER_SCRIPT_HASH = existsSync(scriptHashFile)
  ? readFileSync(scriptHashFile, "utf-8").trim()
  : "";
```

That file is what the `sync` process's `dependsOn: [CardanoNames.CARDANO_SUBMIT_TX]` in `start.dev.ts` is really waiting for.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `PrimitiveTypeCardanoProjectedNFT` | `packages/node/config.dev.ts` | Parses Hololocker datums out of the block stream and emits Lock / Unlocking / Claim |
| Builtin grammar (`@effectstream/sm/grammar`) | `packages/node/grammar.ts` | `builtinGrammars.cardanoProjectedNft` — nine fields, no parser written by the template |
| `@effectstream/sm` state machine (`Stm`) | `packages/node/state-machine.ts` | One transition, `cardano-projected-nft`, appending each lifecycle event to `nft_locks` |
| Primitive-maintained materialised view | created by the engine from the primitive's `dynamicTables` | Live set of NFTs currently at the script; a `Claim` removes the row |
| NTP main + Cardano UTxORPC parallel sync protocols (`@effectstream/config`) | `packages/node/config.dev.ts` | `ConfigBuilder` wires `mainNtp` (`NTP_MAIN`) and `parallelUtxoRpc` (`CARDANO_UTXORPC_PARALLEL`) |
| `@effectstream/runtime` `start()` | `packages/node/main.dev.ts` | Boots the node with state transitions, migrations, grammar and API router |
| `runPreparedQuery` + custom Fastify router | `packages/node/api.ts` | Four GET endpoints; guards on `nftLocksTableExists` before migrations have run |
| `@effectstream/db` + pgtyped | `packages/database/` | `migrationTable` plus typed queries generated from `sql/queries.sql` |
| `@effectstream/orchestrator` launch helpers | `start.dev.ts`, `packages/tests/start.test.ts`, `packages/node/test-minimal.ts` | `launchPglite` and `launchCardano` build the local dependency graph |

## Quick start

Prerequisites beyond [Bun](https://bun.sh):

- **YACI DevKit.** The first `bun run dev` runs `bunx @bloxbean/yaci-devkit up`, which downloads the devkit and its Cardano node on first use, so the first run takes noticeably longer than later ones.

No contract toolchain is needed. The Hololocker is shipped pre-compiled: `packages/contracts-cardano/plutus.json` is the Aiken build output of [`dcspark/projected-nft-whirlpool`](https://github.com/dcSpark/projected-nft-whirlpool) (PlutusV2, validators `hololocker.spend` and `hololocker.mint`), and the frontend embeds the same compiled code in `packages/frontend/client/src/cardano/hololocker.ts` so it can build transactions without calling the node.

```sh
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/projected-nft-preorder

# Inside the monorepo, use link.sh — it installs npm deps and then symlinks
# every @effectstream/* package to its local source. Standalone copies of the
# template use `bun install` instead.
./link.sh

# Starts PGLite, YACI DevKit and Dolos; mints a test NFT and writes the
# Hololocker script hash; then starts the sync node and the frontend.
bun run dev
```

`bun run dev` is `NODE_ENV=development bunx orchestrator start`, which reads `start.dev.ts` (declared as the default launcher under `effectstream.default` in `package.json`). Open the dApp at [http://localhost:10599](http://localhost:10599).

| Service | URL |
| --- | --- |
| Frontend dApp | http://localhost:10599 |
| Sync node API | http://localhost:9999 |
| Orchestrator API | http://localhost:4747 |
| YACI DevKit admin API | http://localhost:10000/local-cluster/api |
| YACI Cardano node | `tcp://localhost:3001` |
| Dolos UTxORPC (gRPC) | `http://localhost:50051` |
| Dolos MiniBF (Blockfrost-compatible) | http://localhost:3000 |
| PGLite (Postgres) | `postgres://postgres:postgres@localhost:5432/postgres` |

`bun run dev` only mints the test NFT and records the script hash. To make the *node process itself* walk the whole Lock → Unlocking → Claim sequence on startup, set `RUN_LIFECYCLE_TEST=1` — that is what `packages/tests/start.test.ts` does for the test run.

## Project structure

```
projected-nft-preorder/
├── start.dev.ts                                  # Orchestrator process graph for the local stack
├── link.sh                                       # Symlink @effectstream/* to monorepo sources
└── packages/
    ├── node/                                     # @projected-nft-preorder/node — sync node
    │   ├── main.dev.ts                           #   Entry point: init() + start()
    │   ├── config.dev.ts                         #   Networks, sync protocols, ProjectedNFT primitive
    │   ├── grammar.ts                            #   Prefix -> builtin grammar mapping
    │   ├── state-machine.ts                      #   The cardano-projected-nft transition
    │   ├── api.ts                                #   Read-only GET endpoints
    │   ├── main.minimal.ts                       #   Same primitive with an inline config, no API/frontend
    │   └── test-minimal.ts                       #   Orchestrator graph that runs main.minimal.ts
    ├── database/                                 # @projected-nft-preorder/database
    │   ├── migrations/000-init.sql               #   The nft_locks table
    │   ├── migration-order.ts                    #   migrationTable consumed by the runtime
    │   ├── sql/queries.sql                       #   pgtyped query definitions
    │   └── sql/queries.queries.ts                #   Generated typed wrappers
    ├── contracts-cardano/                        # @projected-nft-preorder/contracts-cardano
    │   ├── plutus.json                           #   Compiled Hololocker (hololocker.spend / .mint)
    │   ├── cardano-tx-helpers.ts                 #   Lucid: mint, lock, unlock, claim, datums, redeemer
    │   ├── submit-tx.ts                          #   Boot script: mint NFT, write script hash to temp/
    │   ├── dolos.template.toml                   #   Dolos config template (gRPC :50051, MiniBF :3000)
    │   └── fill-template.ts                      #   Fetches devnet genesis files, writes dolos.toml
    ├── frontend/                                 # @projected-nft-preorder/frontend
    │   ├── client/src/pages/LockPage.tsx         #   Mint / lock / unlock / claim UI
    │   ├── client/src/cardano/hololocker.ts      #   Embedded validator, datum + redeemer builders
    │   ├── client/src/cardano/transactions.ts    #   Browser-side transaction construction
    │   ├── client/src/cardano/wallet.ts          #   Lucid seed wallet + faucet
    │   ├── client/src/cip30.ts                   #   CIP-30 browser wallet connection
    │   ├── client/src/cardano-api.ts             #   Typed client for the node's GET endpoints
    │   ├── server/main.ts                        #   Fastify static server + /api, /yaci, /dolos proxies
    │   └── e2e/app.spec.ts                       #   Playwright suite
    └── tests/                                    # @projected-nft-preorder/tests
        ├── run-tests.ts                          #   Phase runner: boots the stack, then asserts
        ├── start.test.ts                         #   Orchestrator graph used by the test run
        ├── infra/                                #   Cardano + sync readiness checks
        ├── stm/                                  #   Lifecycle rows and API assertions
        └── frontend/                             #   Vite build smoke test + Playwright driver
```

## How it works

### Contracts

The Hololocker is the reference Aiken validator from `dcspark/projected-nft-whirlpool`, shipped compiled. `loadHololockerValidator()` reads `plutus.json`, picks the `hololocker.spend` validator, and double-CBOR-encodes the compiled code so Lucid can attach it:

```ts
const spendValidator = plutusJson.validators.find((v: any) => v.title === "hololocker.spend");
if (!spendValidator) throw new Error("hololocker.spend validator not found in plutus.json");
return {
  type: "PlutusV2",
  script: applyDoubleCborEncoding(spendValidator.compiledCode),
};
```

The script *address* is derived from that validator, and everything the node syncs is defined by its hash.

### The lifecycle, transaction by transaction

`packages/contracts-cardano/submit-tx.ts` performs the whole sequence, and `packages/frontend/client/src/cardano/transactions.ts` does the same thing from the browser.

1. **Lock.** Pay the NFT to the script address with an inline `Locked` datum. Nothing is spent from the script, so the primitive sees a script output with no matching script input and emits `status: "Lock"`.

   ```ts
   const tx = lucid
     .newTx()
     .pay.ToAddressWithData(scriptAddress, { kind: "inline", value: lockDatum }, { lovelace, [nftUnit]: 1n });
   ```

2. **Unlocking.** Spend the locked UTxO and pay the same assets straight back to the script, now with an `Unlocking` datum carrying the original out-ref and a `forHowLong` POSIX timestamp. One script input, one script output — the primitive pairs them, so the emitted event carries both `previousTxId`/`previousOutputIndex` and `currentTxId`/`currentOutputIndex`, and `forHowLong` is populated.

   ```ts
   const tx = lucid
     .newTx()
     .collectFrom([lockUtxo], redeemer)
     .attach.SpendingValidator(validator)
     .pay.ToAddressWithData(scriptAddress, { kind: "inline", value: unlockingDatum }, lockUtxo.assets)
     .validTo(validityUpperMs)
     .addSigner(walletAddr);
   ```

3. **Claim.** After the cooldown, spend the `Unlocking` UTxO with a transaction whose validity interval starts after `forHowLong` — and pay nothing back to the script. There is no `.pay.ToAddressWithData(scriptAddress, …)` in `claimNftFromScript`, and that omission *is* the claim. The primitive finds an unmatched script input, parses the datum off the resolved input rather than an output, and emits `status: "Claim"` with an empty `currentOutputIndex`.

Because YACI's slot configuration is not the public one, the helpers fetch the devnet's start time and Shelley genesis and patch `SLOT_CONFIG_NETWORK["Custom"]` before building any time-bounded transaction (`ensureYaciSlotConfig`). Getting this wrong is the usual cause of a claim being rejected on a local devnet.

### Sync configuration and the primitive

```ts
.buildPrimitives((builder) =>
  builder
    .addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
      () => ({
        name: "CardanoProjectedNFT",
        type: PrimitiveTypeCardanoProjectedNFT,
        startBlockHeight: 1,
        stateMachinePrefix: "cardano-projected-nft",
        scriptHash: HOLOLOCKER_SCRIPT_HASH || "0000000000000000000000000000000000000000000000000000000000",
      }),
    )
)
```

The script hash becomes a Dolos predicate (`has_address` with `payment_part: scriptHash`), so only transactions touching the Hololocker are streamed to the node at all. The placeholder hash is deliberate: with no compiled script on disk the primitive matches nothing rather than crashing the node. `config.dev.ts` also computes the parallel protocol's `delayMs` from the devnet's latest block time, read from `http://localhost:3000/blocks/latest`.

### Grammar

```ts
// packages/node/grammar.ts
export const grammar = {
  "cardano-projected-nft": builtinGrammars.cardanoProjectedNft,
} as const satisfies GrammarDefinition;
```

One prefix, one builtin grammar, nine string fields: `ownerAddress`, `previousTxId`, `previousOutputIndex`, `currentTxId`, `currentOutputIndex`, `policyId`, `assetName`, `status`, `forHowLong`.

### State machine

`packages/node/state-machine.ts` destructures all nine, drops anything missing an owner, tx id or policy, and appends one row per event. Empty strings are normalised to `NULL` on the way in, so a `Lock` (no previous UTxO) and a `Claim` (no current output index) both store cleanly:

```ts
yield* World.resolve(insertNftLock, {
  owner_address: ownerAddress,
  policy_id: policyId,
  asset_name: assetName,
  status,
  current_tx_id: currentTxId,
  previous_tx_id: previousTxId || null,
  current_output_index: currentOutputIndex || null,
  previous_output_index: previousOutputIndex || null,
  for_how_long: forHowLong || null,
  block_height: data.blockHeight,
});
```

Note what the transition does *not* do: it never deletes. A claimed NFT keeps its `Lock` and `Unlocking` rows and gains a `Claim` row. Forgetting is the materialised view's job.

### Database

One table, `packages/database/migrations/000-init.sql`:

```sql
CREATE TABLE IF NOT EXISTS nft_locks (
  id SERIAL PRIMARY KEY,
  owner_address TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  status TEXT NOT NULL,
  current_tx_id TEXT NOT NULL,
  previous_tx_id TEXT,
  current_output_index TEXT,
  previous_output_index TEXT,
  for_how_long TEXT,
  block_height INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

`packages/database/sql/queries.sql` defines the reads, including `getActiveNftLockByAsset`, which is what "is this asset currently locked?" looks like against a history table — the newest row for that asset with `status = 'Lock'`. Against the primitive's view the same question is a plain existence check, which is the argument for using it. `bun run build:pgtypes` regenerates `sql/queries.queries.ts`.

### API

Four routes, all GET (`packages/node/api.ts`):

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/locks` | Every lifecycle event, newest first; `[]` until `nft_locks` exists |
| GET | `/api/locks/:address` | Events for one owner address |
| GET | `/api/cardano/script-hash` | `{ scriptHash }` — the Hololocker script hash |
| GET | `/api/cardano/script-address` | `{ scriptAddress }` — its bech32 address |

The first route guards on `nftLocksTableExists` before querying, so the dApp renders during the window between the node accepting connections and migrations having run.

### Frontend

`packages/frontend/server/main.ts` serves the built client on 10599 and proxies `/api/*` to the sync node, `/yaci/*` to the YACI admin API and `/dolos/*` to the Blockfrost-compatible endpoint, with an `application/cbor` parser so signed transactions pass through untouched. Wallets are either a Lucid seed wallet created and funded in the page or a CIP-30 browser extension (`packages/frontend/client/src/cip30.ts`), and every transaction is routed through a confirmation modal before it is signed.

Two behaviours in `packages/frontend/client/src/pages/LockPage.tsx` are worth knowing about. `deduplicateLocks` first collapses rows that are identical on `(current_tx_id, current_output_index, status)`, then keeps only the highest-`block_height` row per `(policy_id, asset_name, owner_address)` — which is how the UI derives current state from a history table. The Playwright suite additionally asserts that the page issues no `POST`, `PATCH` or `DELETE` to port 9999 at all: the node is an indexer, and every mutation goes to Cardano.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | set by `bun run dev` | Must be `development` for the orchestrator to pick `start.dev.ts` |
| `PGLITE` | `true` (set on the `sync` process) | Set `PGLITE=false` to use an external Postgres on `DB_PORT` instead of embedded PGLite |
| `DEBUG_PGLITE` | `0` (set in `start.dev.ts`) | Verbose PGLite logging |
| `MQTT_BROKER` | `false` (set on the `sync` process) | The dApp polls over HTTP, so the MQTT event broker is not started |
| `USE_DB_STARTHEIGHT` | `true` (set in `start.dev.ts`, not in `start.test.ts`) | Lets the persisted config snapshot win over the in-memory one. Needed because the NTP `startTime` in `config.dev.ts` is `new Date().getTime()`, which changes on every boot and would otherwise fail the immutable-config check on restart |
| `RUN_LIFECYCLE_TEST` | unset in dev, `1` in the test graph | When set, `submit-tx.ts` continues past minting and performs Lock → Unlocking → Claim |
| `EFFECTSTREAM_API_PORT` | `9999` | Sync node HTTP API port |
| `API_URL` / `DOLOS_URL` / `YACI_URL` | `http://localhost:9999` / `:3000` / `:10000` | Upstreams the frontend server proxies to |
| `VITE_API_URL` / `VITE_DOLOS_URL` / `VITE_YACI_URL` | `""` / `/dolos` / `/yaci` | Client-side endpoints; the defaults keep every request same-origin through the proxy |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PW` / `DB_NAME` | `localhost` / `5432` / `postgres` / `postgres` / `postgres` | Read by `packages/tests/run-tests.ts` when connecting to the database |

The root `package.json` pins `libsodium-wrappers-sumo` to `0.7.15` via `overrides`, which the Lucid Evolution stack needs to load under Bun.

### Pointing at a real network

- In `packages/node/config.dev.ts`, change the Cardano network's `nodeUrl` and `network`, point `parallelUtxoRpc`'s `rpcUrl` at a hosted UTxORPC provider and set `headers` for its API key, and replace `startChainPoint: "origin"` with a recent chain point.
- Replace the `scriptHash` source. On a real network the Hololocker is deployed once, so read the hash from configuration instead of `packages/contracts-cardano/temp/hololocker-script-hash.txt`, and drop the `cardano-submit-tx` dependency from the `sync` process in `start.dev.ts`.
- The `Custom` slot-configuration patching in `cardano-tx-helpers.ts` and `packages/frontend/client/src/cardano/wallet.ts` exists only for the devnet; on a public network Lucid's built-in network configuration applies.

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` starts the orchestrator against `packages/tests/start.test.ts` — the same graph as `start.dev.ts`, but with `RUN_LIFECYCLE_TEST=1` on `cardano-submit-tx` so the full lifecycle actually happens — waits on the orchestrator's `/health` and `/processes` endpoints, runs the phases below, then shuts the stack down. It exits non-zero if any assertion fails or any wait times out.

| Phase | Files | Covers |
| --- | --- | --- |
| A — Infrastructure | `infra/cardano-ready.test.ts`, `infra/sync-ready.test.ts` | Waits (up to 5 minutes) for `cardano-submit-tx` to complete the Lock → Unlocking → Claim sequence, then asserts the YACI admin API, Dolos MiniBF and Dolos gRPC are reachable and the sync node reports `/health` `ok` |
| B — State machine + API | `stm/projected-nft.test.ts`, `stm/api.test.ts` | A `Lock` row with a non-empty owner and policy id, an `Unlocking` row with a non-empty `for_how_long`, a `Claim` row, and all three statuses present; `/api/locks` returns an array and `/api/cardano/script-hash` a non-empty hash |
| C — Frontend | `frontend/build-smoke.test.ts`, `frontend/playwright-e2e.test.ts` | The Vite build succeeds and emits `dist/index.html`; Playwright then drives the real dApp against `http://localhost:10599`, including the assertion that it never mutates through the node API |

`packages/node/main.minimal.ts` with `packages/node/test-minimal.ts` is a smaller harness for the same primitive: an inline `ConfigBuilder` and no API, database package or frontend, useful when isolating a sync problem.

## Where to go next

- [PRC-2 — Paima Hololocker Interface](https://effectstream.io/home/paima-standards/prc2) — the standard this template implements, including the EVM-side interface and the reasoning behind the unlock cooldown
- [Cardano integration](https://effectstream.io/home/chains/cardano) — every Cardano primitive, the UTxORPC sync protocol, and the `launchCardano` orchestrator helper
- [Primitives](https://effectstream.io/home/components/primitives) — how a primitive turns raw chain data into scheduled state machine input, and what its materialised views are for
- [Database](https://effectstream.io/home/components/database) — migrations, pgtyped queries, and how the engine's own schemas relate to yours
- Sibling templates: [`cardano-delegation`](https://github.com/effectstream/effectstream/tree/main/templates/cardano-delegation) for a Cardano primitive that needs no contract at all, and [`preorder`](https://github.com/effectstream/effectstream/tree/main/templates/preorder) for a multi-chain presale that reconciles EVM and Cardano payments into a single order book

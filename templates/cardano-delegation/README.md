# Cardano Stake Pool Delegation Explorer

> Indexes native Cardano stake-delegation certificates into a live dashboard — no smart contract, no batcher, and a node API that only ever answers GET.

Most Effectstream templates watch a contract: an ERC-721 emits `Transfer`, a Plutus validator holds a UTxO, a Compact circuit discloses a ledger field. This one watches the Cardano *ledger itself*. Delegating stake to a pool is not a contract call — it is a certificate carried inside an ordinary transaction, part of Cardano's consensus layer. `PrimitiveTypeCardanoPoolDelegation` reads those certificates straight out of the block stream and hands them to a state transition, which materialises them into a `delegations` table and a `pool_stats` roll-up.

The result is an application whose entire write path is the Cardano chain. The browser builds and submits a delegation transaction with Lucid Evolution; the sync node observes it and writes rows; the React dashboard polls the node's read-only API. Read it when you want to index chain-native activity — certificates, stake, native assets — rather than the events of a contract you deployed.

## What this template shows

**A primitive that reads a consensus-layer action, not a contract.** There is no Plutus script, no Aiken source, no `plutus.json` anywhere in this template. `packages/contracts-cardano/` contains only devnet plumbing — the YACI DevKit and Dolos launch scripts, a Dolos config template, and a shell script that registers a second stake pool. Its `cardano-submit-tx` script is a deliberate no-op:

```json
"cardano-submit-tx": "echo 'No infrastructure transactions for cardano-delegation template'"
```

and `start.dev.ts` filters that process out of the orchestrator graph entirely. Nothing is deployed. The primitive iterates `tx.certificates` and picks out `stakeDelegation` (pre-Conway) plus `stakeRegDelegCert` and `stakeVoteDelegCert` (Conway era), extracting the staking credential hash and the target pool keyhash. That is the pattern worth copying: if the behaviour you care about is already expressed in the ledger, you do not need to wrap it in a contract to index it.

**The write path is the chain; the API is read-only.** `packages/node/api.ts` registers five routes and every one of them is `server.get`. There is no batcher package, no L2 contract, no POST endpoint the frontend could use to fake state. Wallets are created in the browser (`packages/frontend/client/src/wallet/cardano-wallet.ts` generates a seed phrase with Lucid Evolution), funded from the YACI faucet, and delegate with a single Lucid call. Whatever the dashboard shows was put there by a Cardano transaction, which makes the template a clean demonstration of an Effectstream node as a pure indexer.

**Filtering is pushed into the indexer where it can be, and done in the primitive where it can't.** The primitive's `getConfig()` emits a Dolos predicate so only transactions containing certificates are streamed at all — the overwhelming majority of transfer-only transactions never reach the node. When exactly one pool is configured the predicate narrows further to `any_pool_keyhash`; this template configures two pools, so the predicate is the broader `has_certificate: true` and the pool filter is applied in `getPayload()`.

**Epoch is derived, not fetched.** Cardano block data carries a slot, not an epoch. The primitive computes the epoch from `syncProtocol.absoluteSlot` using per-network era parameters (`slotToEpoch`), so the state machine receives an `epoch` field without the node ever calling out to an explorer. On the YACI devnet an epoch is 600 slots, which is why a few minutes of local play produces visibly advancing epoch numbers.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `PrimitiveTypeCardanoPoolDelegation` | `packages/node/config.dev.ts` | Extracts delegation certificates from the Cardano block stream, filtered to two pool hashes |
| Builtin grammar (`@effectstream/sm/grammar`) | `packages/node/grammar.ts` | `builtinGrammars.cardanoPoolDelegation` parses the primitive payload — the template writes no parser |
| `@effectstream/sm` state machine (`Stm`) | `packages/node/state-machine.ts` | One transition, `cardano-pool-delegation`, writing both the event row and the pool roll-up |
| NTP main + Cardano UTxORPC parallel sync protocols (`@effectstream/config`) | `packages/node/config.dev.ts` | `ConfigBuilder` wires `mainNtp` (`NTP_MAIN`) and `parallelUtxoRpc` (`CARDANO_UTXORPC_PARALLEL`) |
| `@effectstream/runtime` `start()` | `packages/node/main.dev.ts` | Boots the node with state transitions, migrations, grammar and API router |
| Custom Fastify API router | `packages/node/api.ts` | Five GET endpoints over the indexed tables |
| `@effectstream/db` + pgtyped | `packages/database/` | `migrationTable` plus typed queries generated from `sql/queries.sql` |
| Sync pagination table | `packages/database/sql/queries.sql` | `getSyncPagination` and `getBlockHeights` read `effectstream.sync_protocol_pagination` to recover the NTP epoch and expose sync progress |
| `@effectstream/orchestrator` launch helpers | `start.dev.ts`, `packages/tests/start.test.ts` | `launchPglite` and `launchCardano` build the local dependency graph |

## Quick start

Prerequisites beyond [Bun](https://bun.sh):

- **YACI DevKit.** The first `bun run dev` runs `bunx @bloxbean/yaci-devkit up`, which downloads the devkit and its Cardano node into `~/.yaci-cli`. `packages/contracts-cardano/register-test-pool.sh` then shells out to `~/.yaci-cli/cardano-node/bin/cardano-cli` and the node socket at `~/.yaci-cli/local-clusters/default/node/node.sock`, so the first run takes noticeably longer than later ones. The orchestrator sequences that script after `yaci-devkit-wait`, so no manual ordering is needed.

Then:

```sh
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/cardano-delegation

# Inside the monorepo, use link.sh — it installs npm deps and then symlinks
# every @effectstream/* package to its local source. Standalone copies of the
# template use `bun install` instead.
./link.sh

# Starts PGLite, YACI DevKit and Dolos, registers a second stake pool,
# then starts the sync node and the frontend.
bun run dev
```

`bun run dev` is `NODE_ENV=development bunx orchestrator start`, which reads `start.dev.ts` (declared as the default launcher under `effectstream.default` in `package.json`). Open the dashboard at [http://localhost:10599](http://localhost:10599).

| Service | URL |
| --- | --- |
| Frontend dashboard | http://localhost:10599 |
| Sync node API | http://localhost:9999 |
| Orchestrator API | http://localhost:4747 |
| YACI DevKit admin API | http://localhost:10000/local-cluster/api |
| YACI Cardano node | `tcp://localhost:3001` |
| Dolos UTxORPC (gRPC) | `http://localhost:50051` |
| Dolos MiniBF (Blockfrost-compatible) | http://localhost:3000 |
| PGLite (Postgres) | `postgres://postgres:postgres@localhost:5432/postgres` |

## Project structure

```
cardano-delegation/
├── start.dev.ts                                 # Orchestrator process graph for the local stack
├── link.sh                                      # Symlink @effectstream/* to monorepo sources
└── packages/
    ├── node/                                    # @cardano-delegation/node — sync node
    │   ├── main.dev.ts                          #   Entry point: init() + start()
    │   ├── config.dev.ts                        #   Networks, sync protocols, PoolDelegation primitive
    │   ├── grammar.ts                           #   Prefix -> builtin grammar mapping
    │   ├── state-machine.ts                     #   The cardano-pool-delegation transition
    │   └── api.ts                               #   Read-only GET endpoints
    ├── database/                                # @cardano-delegation/database
    │   ├── migrations/000-init.sql              #   delegations + pool_stats tables
    │   ├── migration-order.ts                   #   migrationTable consumed by the runtime
    │   ├── sql/queries.sql                      #   pgtyped query definitions
    │   └── sql/queries.queries.ts               #   Generated typed wrappers
    ├── contracts-cardano/                       # @cardano-delegation/contracts-cardano
    │   ├── dolos.template.toml                  #   Dolos config template (gRPC :50051, MiniBF :3000)
    │   ├── fill-template.ts                     #   Fetches devnet genesis files, writes dolos.toml
    │   ├── register-test-pool.sh                #   Registers "Test Pool 2" via cardano-cli
    │   ├── test-pool-2/                         #   Cold / VRF / stake / payment keys for that pool
    │   └── cardano-tx-helpers.ts                #   Genesis pool hash / bech32 id constants
    ├── frontend/                                # @cardano-delegation/frontend
    │   ├── client/src/wallet/cardano-wallet.ts  #   Browser wallets: create, fund, delegate
    │   ├── client/src/components/               #   PoolInfo, WalletList, DelegationsTable, DevInfo
    │   ├── client/src/config.ts                 #   Pool hashes, bech32 ids, poll interval
    │   ├── server/main.ts                       #   Fastify static server + /api, /yaci, /dolos proxies
    │   └── e2e/app.spec.ts                      #   Playwright suite
    └── tests/                                   # @cardano-delegation/tests
        ├── run-tests.ts                         #   Phase runner: boots the stack, then asserts
        ├── start.test.ts                        #   Orchestrator graph used by the test run
        ├── infra/cardano-ready.test.ts          #   YACI / Dolos health checks
        └── stm/pool-delegation.test.ts          #   Schema and seed-row assertions
```

## How it works

### Sync configuration and the primitive

`packages/node/config.dev.ts` declares an NTP network for the rollup clock and a Cardano network pointed at the YACI devnet, then one main and one parallel sync protocol. The primitive hangs off the parallel one:

```ts
.buildPrimitives((builder) =>
  builder.addPrimitive(
    (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
    () => ({
      name: "CardanoPoolDelegation",
      type: PrimitiveTypeCardanoPoolDelegation,
      startBlockHeight: 1,
      stateMachinePrefix: "cardano-pool-delegation",
      pools: [
        "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57",
        "82ec502f8c0a51e7c0db410e6722dd42df3b8e11f48e833f9fdf2941",
      ],
      network: "yaci",
    }),
  ),
)
```

The first hash is the YACI genesis pool; the second is the pool `register-test-pool.sh` creates, so the dashboard has two pools to switch between. `network: "yaci"` selects the era parameters used to turn a slot into an epoch.

Two details in the same file make restarts well-behaved. The NTP `startTime` is recovered from the database rather than reset:

```ts
const rows = await getSyncPagination.run({ protocol_name: mainSyncProtocolName }, dbConn);
if (!rows.length) throw new Error("DB is empty");
launchStartTime = (rows[0].page as any).root - rows[0].page_number * 1000;
```

and the Cardano protocol's `delayMs` is computed from how far behind the devnet's latest block is, read from Dolos' Blockfrost-compatible endpoint at `http://localhost:3000/blocks/latest`. Both fall back silently when the services are not up yet, which is what makes the same file usable on a cold first boot.

### Grammar

The prefix maps to a builtin grammar, so no parser is written here:

```ts
// packages/node/grammar.ts
export const grammar = {
  "cardano-pool-delegation": builtinGrammars.cardanoPoolDelegation,
} as const satisfies GrammarDefinition;
```

That grammar is three string fields — `address`, `pool`, `epoch` — which is exactly the shape the state transition destructures.

### From certificate to state transition

The path a delegation takes, end to end:

1. The browser submits a Cardano transaction. `delegateWallet` in `packages/frontend/client/src/wallet/cardano-wallet.ts` picks the right certificate depending on whether the stake key has been registered yet:

   ```ts
   const tx = wallet.delegated
     ? wallet.lucid.newTx().delegate.ToPool(wallet.rewardAddress, poolBech32)
     : wallet.lucid.newTx().registerAndDelegate.ToPool(wallet.rewardAddress, poolBech32);
   ```

2. Dolos ingests the block and streams the transaction over UTxORPC, filtered by the primitive's `has_certificate` predicate.
3. The primitive's `getPayload()` walks `tx.certificates`, keeps the delegation-shaped ones, converts the stake credential and pool keyhash to hex, drops anything not in `pools`, and computes the epoch from the absolute slot.
4. The payload is scheduled under the `cardano-pool-delegation` prefix and arrives in the state machine.

### State machine

`packages/node/state-machine.ts` holds one transition. It ignores malformed input, logs the event as a banner, then performs two writes:

```ts
stm.addStateTransition("cardano-pool-delegation", function* (data) {
  const { address, pool, epoch } = data.parsedInput as {
    address: string;
    pool: string;
    epoch: string;
  };

  if (!address || !pool) return;

  yield* World.resolve(insertDelegation, {
    block_height: data.blockHeight,
    address,
    pool,
    epoch,
    tx_hash: null,
  });

  yield* World.resolve(updatePoolStats, {
    pool,
    latest_epoch: epoch,
    latest_block: data.blockHeight,
  });
});
```

`tx_hash` is written as `null` because the pool-delegation grammar does not carry the transaction hash — the column exists for applications that enrich the row from another source.

### Database

Two tables (`packages/database/migrations/000-init.sql`): an append-only event log, and a roll-up keyed by pool that is pre-seeded with the genesis pool so the dashboard has something to render before the first delegation lands.

```sql
CREATE TABLE delegations (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  address TEXT NOT NULL,
  pool TEXT NOT NULL,
  epoch TEXT NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_delegations_pool ON delegations(pool);
CREATE INDEX idx_delegations_address ON delegations(address);

CREATE TABLE pool_stats (
  pool TEXT PRIMARY KEY,
  total_delegators INTEGER NOT NULL DEFAULT 0,
  latest_epoch TEXT NOT NULL DEFAULT '0',
  latest_block INTEGER NOT NULL DEFAULT 0
);
```

The roll-up is recomputed rather than incremented, so a replayed or duplicated event cannot inflate it (`packages/database/sql/queries.sql`):

```sql
/* @name updatePoolStats */
INSERT INTO pool_stats (pool, total_delegators, latest_epoch, latest_block)
VALUES (:pool!, 1, :latest_epoch!, :latest_block!)
ON CONFLICT (pool) DO UPDATE SET
  total_delegators = (SELECT COUNT(DISTINCT address) FROM delegations WHERE pool = :pool!),
  latest_epoch = GREATEST(pool_stats.latest_epoch, :latest_epoch!),
  latest_block = GREATEST(pool_stats.latest_block, :latest_block!);
```

`bun run build:pgtypes` regenerates the typed wrappers in `sql/queries.queries.ts`.

Alongside the template's own tables, the primitive maintains a view of the *current* delegation per staking credential, created automatically by the engine from the primitive's `dynamicTables`. Its intermediate table upserts on `(primitive_name, staking_credential)`, so re-delegating replaces the row rather than adding one — the complement of the append-only `delegations` log. The name is derived from the primitive instance name, giving `primitives.cardano_pool_delegation_view_cardanopooldelegation` here.

### API

Every route in `packages/node/api.ts` is a GET, and each one swallows errors into an empty array so the dashboard keeps rendering while migrations are still being applied:

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/delegations` | Newest delegations first; `limit` and `offset` query params (default 50 / 0) |
| GET | `/api/delegations/:pool` | The same, filtered to one pool keyhash |
| GET | `/api/delegations/by-address/:address` | Every delegation for one staking credential |
| GET | `/api/pool-stats` | The `pool_stats` roll-up, ordered by pool |
| GET | `/api/block-heights` | Highest synced page per sync protocol, from `effectstream.sync_protocol_pagination` |

### Frontend

`packages/frontend/server/main.ts` is a Fastify server on port 10599 that serves the built Vite client and proxies three upstreams, so the browser only ever talks to one origin: `/api/*` to the sync node on 9999, `/yaci/*` to `http://localhost:10000/local-cluster/api`, and `/dolos/*` to the Blockfrost-compatible API on 3000. It registers an `application/cbor` body parser, which is what lets a signed transaction be forwarded to the YACI submit endpoint unchanged.

The client creates wallets entirely in the browser: `createWallet()` generates a seed phrase, selects it into Lucid, and reads back the payment address, reward address and staking credential hash. `fundWallet()` posts to the YACI faucet and polls for UTxOs. The dashboard tables refresh on a timer — `POLL_INTERVAL_MS` in `packages/frontend/client/src/config.ts` is 2000 ms. The same file pins both pool hashes and their bech32 ids, which is how the pool dropdown stays in sync with the primitive's `pools` list.

## Configuration

The orchestrator sets everything the local stack needs; the table below covers what you would change.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | set by `bun run dev` | Must be `development` for the orchestrator to pick `start.dev.ts` |
| `PGLITE` | `true` (set on the `sync` process) | Set `PGLITE=false` to use an external Postgres on `DB_PORT` instead of embedded PGLite |
| `DEBUG_PGLITE` | `0` (set in `start.dev.ts`) | Verbose PGLite logging |
| `MQTT_BROKER` | `false` (set on the `sync` process) | The dashboard polls over HTTP, so the MQTT event broker is not started |
| `EFFECTSTREAM_API_PORT` | `9999` | Sync node HTTP API port |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PW` / `DB_NAME` | `localhost` / `5432` / `postgres` / `postgres` / `postgres` | Read by `packages/tests/run-tests.ts` when connecting to the database |
| `VITE_API_URL` | `http://localhost:9999` | Upstream the frontend server proxies `/api/*` to |
| `YACI_URL` | `http://localhost:10000` | Upstream the frontend server proxies `/yaci/*` to |

### Pointing at a real network

Everything network-specific lives in `packages/node/config.dev.ts`. To index preprod, preview or mainnet instead of the devnet:

- Change the Cardano network's `nodeUrl` and set `network` to `"preprod"`, `"preview"` or `"mainnet"`. The same string is passed to the primitive, where it selects the era parameters used for slot-to-epoch conversion.
- Point `parallelUtxoRpc`'s `rpcUrl` at a UTxORPC provider, adjust `headers` for its API key, and replace `startChainPoint: "origin"` with a recent chain point so the node does not replay the whole chain. Consider raising `confirmationDepth` from `0`.
- Replace the `pools` array with the pool keyhashes you care about. With a single entry the primitive narrows the indexer-side predicate to `any_pool_keyhash`, which is materially cheaper than filtering after the fact.
- Drop `register-test-pool.sh` and the `register-test-pool` process from `start.dev.ts`; they exist only to give the devnet a second pool.

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` starts the orchestrator against `packages/tests/start.test.ts` (the same graph as `start.dev.ts`, plus `ENABLE_DEV_AND_DEBUG_ENDPOINTS=true` on the sync node), waits on the orchestrator's `/health` and `/processes` endpoints, runs the phases below, then shuts the stack down. It exits non-zero if any assertion fails or any wait times out.

| Phase | Files | Covers |
| --- | --- | --- |
| A — Infrastructure | `infra/cardano-ready.test.ts` | Waits for `dolos-minibf-wait` and `register-test-pool` to finish, then asserts the YACI admin API, the Dolos MiniBF endpoint and the Dolos gRPC port are reachable; then waits for the sync node's `/health` and for `/api/pool-stats` to return rows, which proves migrations ran |
| B — State machine | `stm/pool-delegation.test.ts` | `delegations` exists in the public schema, and `pool_stats` carries the seeded genesis-pool row |
| C — Playwright E2E | `packages/frontend/e2e/app.spec.ts` | Installs Chromium, then drives the real dashboard: create a wallet, fund it from the faucet, delegate, assert the delegation appears in the table, and re-delegate to the second pool |

## Where to go next

- [Cardano integration](https://effectstream.io/home/chains/cardano) — every Cardano primitive, the UTxORPC sync protocol, and the `launchCardano` orchestrator helper
- [Primitives](https://effectstream.io/home/components/primitives) — how chain-aware listeners like `PrimitiveTypeCardanoPoolDelegation` turn raw chain data into scheduled state machine input
- [Grammar](https://effectstream.io/home/components/grammar) — what `builtinGrammars.cardanoPoolDelegation` is doing, and how to write your own
- [State machine](https://effectstream.io/home/components/state-machine) — writing and testing state transition functions
- Sibling templates: [`projected-nft-preorder`](https://github.com/effectstream/effectstream/tree/main/templates/projected-nft-preorder) for the Cardano primitive that *does* read a Plutus script, [`evm-cardano`](https://github.com/effectstream/effectstream/tree/main/templates/evm-cardano) for Cardano alongside a second chain, and [`zk-cardano`](https://github.com/effectstream/effectstream/tree/main/templates/zk-cardano), which gates a Midnight ZK ballot on this same delegation primitive

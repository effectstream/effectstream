# EVM-Cardano Explorer

> Syncs an EVM chain and a Cardano devnet side by side into one deterministic state machine, and shows both event streams in a single dashboard.

Two chains with nothing in common — an account-model EVM chain with block-number
pagination, and a UTxO chain paginated by chain point — are read by the same node, folded
into one ordered block stream, and written into one `events` table. A React dashboard
polls that table and shows NFT mints next to ADA transfers with no client-side merging.

Read this template if you need more than one chain in a single application and want to see
what actually has to be configured to make that deterministic: how each chain is paginated,
how their wall-clock timestamps are reconciled, and what the state machine can assume about
ordering once they are interleaved.

## What this template shows

**One clock, two chains.** Effectstream does not order events by "whichever arrived
first". Every configuration has exactly one *main* sync protocol whose blocks define the
timeline, and any number of *parallel* protocols whose data is bucketed into that
timeline's slots by timestamp. Here the main protocol is an NTP clock ticking once a
second, and both real chains are parallel:

```ts
// packages/node/config.dev.ts
.addMain(
  (networks) => networks.ntp,
  () => ({
    name: mainSyncProtocolName,
    type: ConfigSyncProtocolType.NTP_MAIN,
    chainUri: "",
    startBlockHeight: 1,
    pollingInterval: 1000,
  }),
)
.addParallel(
  (networks) => networks.evmMain,
  (network) => ({
    name: "mainEvmRPC",
    type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    chainUri: network.rpcUrls.default.http[0],
    startBlockHeight: 1,
    pollingInterval: 500,
    confirmationDepth: 1,
  }),
)
.addParallel(
  (networks) => (networks as any).yaci,
  () => ({
    name: "parallelUtxoRpc",
    type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
    rpcUrl: "http://127.0.0.1:50051",
    startChainPoint: "origin",
    delayMs: yaciDevKitStartTime || 0,
    pollingInterval: 1000,
    headers: { "x-rpc-key": "dev" },
  }),
)
```

Three things in that block are the whole lesson, and each of them is something you have to
handle yourself when you combine chains:

- **The two chains are paginated differently.** The EVM protocol starts at
  `startBlockHeight: 1` — an integer block number — and declares `confirmationDepth: 1`,
  meaning a block counts once one block sits on top of it. The Cardano protocol has no
  block height at all; it starts at `startChainPoint: "origin"` and advances by chain
  point. You never write code that reconciles those two cursors, because the merge only
  ever compares the millisecond timestamp each protocol maps its blocks to.

- **Clock skew has to be corrected, not ignored.** A YACI DevKit devnet starts its ledger
  clock in the past, so its newest block can be timestamped hours behind wall time. Left
  alone, that data would be bucketed into NTP slots the timeline has long passed. The
  config measures the offset at boot from the Dolos Blockfrost endpoint and feeds it to
  `delayMs`, which the sync service *adds* to the chain's timestamps:

  ```ts
  // packages/node/config.dev.ts
  const latestResponse = await fetch("http://localhost:3000/blocks/latest");
  const latestBlock = await latestResponse.json();
  yaciDevKitStartTime = latestBlock.time * 1000;
  yaciDevKitStartTime = new Date().getTime() - yaciDevKitStartTime;
  ```

  Real networks use `delayMs` for the same reason in the opposite direction — as the
  waiting period that lets a block reach its confirmation depth before it is merged.

- **The main clock's epoch must survive restarts.** If the NTP protocol restarted at
  `Date.now()`, the same chain data would land in different blocks on a replay and the
  state would diverge. Before building the config, the node reads its own committed
  pagination row back out of Postgres and reconstructs the original start time from it:

  ```ts
  // packages/node/config.dev.ts
  launchStartTime = result.rows[0].page.root - result.rows[0].page_number * 1000;
  ```

  Only when the table is empty (a first run) does it fall back to `new Date().getTime()`.

The consequence for application code is that the state machine sees a single ordered
stream and never has to think about either chain's finality. Two independent transitions
write into the same table, tagged by origin:

```ts
// packages/node/state-machine.ts
stm.addStateTransition("nft-transfer", function* (data) { /* chain: "evm"     */ });
stm.addStateTransition("cardano-transfer", function* (data) { /* chain: "cardano" */ });
```

The trade-off worth knowing before you copy this: because a root block is only emitted
once *every* parallel protocol has proven it scanned past that timestamp, a slow or stalled
chain holds up block production for all of them. Multi-chain sync buys you determinism at
the cost of coupling your throughput to your slowest source.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `ConfigBuilder` (`@effectstream/config`) | `packages/node/config.dev.ts` | Declaring networks, sync protocols and primitives in one typed pipeline |
| NTP main protocol (`ConfigSyncProtocolType.NTP_MAIN`) | `packages/node/config.dev.ts` | A 1 s deterministic clock that defines the block timeline |
| EVM sync (`ConfigSyncProtocolType.EVM_RPC_PARALLEL`) | `packages/node/config.dev.ts` | Reading the local Hardhat chain with `confirmationDepth: 1` |
| Cardano sync (`ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL`) | `packages/node/config.dev.ts` | Reading Cardano blocks from Dolos over UTxO-RPC from `origin` |
| `PrimitiveTypeEVMERC721` (`@effectstream/sm/builtin`) | `packages/node/config.dev.ts` | Decoding ERC-721 `Transfer` logs into `{ to, from, tokenId, isBurn }` |
| `PrimitiveTypeCardanoTransfer` (`@effectstream/sm/builtin`) | `packages/node/config.dev.ts` | Decoding Cardano transactions into `{ txId, metadata, inputCredentials, outputs }` |
| Builtin grammars (`@effectstream/sm/grammar`) | `packages/node/grammar.ts` | Typing both primitives' payloads without writing a schema by hand |
| `Stm` state transitions (`@effectstream/sm`) | `packages/node/state-machine.ts` | Two transitions writing into one shared `events` table |
| `World.resolve` (`@effectstream/coroutine`) | `packages/node/state-machine.ts` | Running pgtyped queries inside a state transition |
| Migrations + pgtyped queries (`@effectstream/db`) | `packages/database/` | `events` / `chain_stats` schema and type-safe SQL |
| `StartConfigApiRouter` (`@effectstream/runtime`) | `packages/node/api.ts` | Custom Fastify routes on the node's HTTP server |
| Hardhat + Ignition build (`@effectstream/evm-hardhat`) | `packages/contracts-evm/` | Compiling the ERC-721 contract and generating typed deployment addresses |
| Orchestrator launchers (`@effectstream/orchestrator`) | `start.dev.ts` | `launchPglite` / `launchEvm` / `launchCardano` process graph |

## Quick start

**Prerequisites**

- [Bun](https://bun.sh)
- [Foundry](https://www.getfoundry.sh/) — `forge` compiles the Solidity artifacts the
  TypeScript binding generator reads. `launchEvm` checks for it on PATH and refuses to
  start without it. Verify with `forge --version`.

YACI DevKit and Dolos need no extra system tooling; both are pulled in as npm dependencies
of `packages/contracts-cardano/`.

```bash
bun install
bun run dev
```

Inside the Effectstream monorepo, run `./link.sh` instead of `bun install` — it installs
dependencies and then symlinks every `@effectstream/*` package to its local source.

| Service | URL |
| --- | --- |
| Dashboard | http://localhost:10599 |
| Sync node HTTP API | http://localhost:9999 |
| Orchestrator API | http://localhost:4747 |
| Hardhat EVM node | http://localhost:8545 |
| YACI DevKit admin API | http://localhost:10000 |
| Dolos MiniBF (Blockfrost-compatible) | http://localhost:3000 |
| Dolos gRPC (UTxO-RPC) | http://127.0.0.1:50051 |
| YACI Cardano node | `tcp://localhost:3001` |
| PGLite (Postgres wire protocol) | `postgres://localhost:5432` |

The dev stack deliberately drops the `cardano-submit-tx` process that `launchCardano`
provides, so no ADA transfers are seeded on startup:

```ts
// start.dev.ts
...launchCardano("@evm-cardano/contracts-cardano", {
  cwd: path.join(root, "packages/contracts-cardano"),
}).filter((p) => p.name !== CardanoNames.CARDANO_SUBMIT_TX),
```

Everything is driven from the dashboard instead: mint an NFT, top up a Cardano wallet from
the faucet, send ADA. The test launcher (`packages/tests/start.test.ts`) keeps the process,
because the state-machine tests need transactions that exist before the node boots.

## Project structure

```
evm-cardano/
├── start.dev.ts                # Orchestrator process graph for `bun run dev`
├── link.sh                     # Symlink @effectstream/* to monorepo sources
└── packages/
    ├── node/                   # @evm-cardano/node — config, grammar, state machine, API, entrypoint
    ├── database/               # @evm-cardano/database — SQL migrations and pgtyped queries
    ├── contracts-evm/          # @evm-cardano/contracts-evm — Erc721Dev.sol, Hardhat + Ignition deploy
    ├── contracts-cardano/      # @evm-cardano/contracts-cardano — YACI + Dolos config, Lucid tx helpers
    ├── frontend/               # @evm-cardano/frontend — React dashboard and Fastify server/proxy
    └── tests/                  # @evm-cardano/tests — infrastructure, state machine and Playwright phases
```

## How it works

### Grammar

Both inputs reuse builtin grammars, so the template defines no schemas of its own:

```ts
// packages/node/grammar.ts
export const grammar = {
  "nft-transfer": builtinGrammars.evmErc721,
  "cardano-transfer": builtinGrammars.cardanoTransfer,
} as const satisfies GrammarDefinition;
```

The keys match the `stateMachinePrefix` of each primitive in `packages/node/config.dev.ts`
(`nft-transfer` and `cardano-transfer`) — that is what routes a decoded payload to a
transition. `evmErc721` yields `{ to, from, tokenId, isBurn }`; `cardanoTransfer` yields
`{ txId, metadata, inputCredentials, outputs }`, where `inputCredentials` and `outputs` are
JSON strings.

### State machine

The EVM transition classifies the transfer from its endpoints and records one row:

```ts
// packages/node/state-machine.ts
const eventType =
  from === ZERO_ADDRESS ? "nft_mint" : isBurn ? "nft_burn" : "nft_transfer";

yield* World.resolve(insertEvent, {
  chain: "evm",
  event_type: eventType,
  from_address: from,
  to_address: to,
  amount: tokenId,
  tx_hash: `evm-block-${data.blockHeight}`,
  block_height: data.blockHeight,
});
```

Note `tx_hash` is synthesised from the Effectstream block height rather than the EVM
transaction hash — a simplification of the demo, not a framework limitation.

The Cardano transition is shaped by the UTxO model: one transaction fans out into several
outputs, so it parses the JSON payload and inserts one row per output, attributing the
sender to the first input credential:

```ts
// packages/node/state-machine.ts
for (const output of parsedOutputs) {
  yield* World.resolve(insertEvent, {
    chain: "cardano",
    event_type: "ada_transfer",
    from_address: fromCredential,
    to_address: output.address,
    amount: output.coin,
    tx_hash: txId,
    block_height: data.blockHeight,
  });
}
```

Both transitions then call `updateChainStats` for their own chain, which is what keeps the
dashboard's two counters independent while the rows share one table.

### Contracts

The EVM side is one contract — an OpenZeppelin ERC-721 with an unrestricted `mint`, which
is what makes a dev faucet possible from the browser:

```solidity
// packages/contracts-evm/src/contracts/Erc721Dev.sol
contract Erc721Dev is ERC721 {
    constructor() ERC721("Mock ERC721", "MERC") {}

    function mint(address _to, uint256 _tokenId) external {
        _mint(_to, _tokenId);
    }
}
```

It is compiled twice — `build:hardhat` for the node's EDR provider and `build:forge` for
the artifacts the binding generator reads — then deployed with Hardhat Ignition
(`packages/contracts-evm/ignition/modules/erc721dev.ts`). The generated
`contractAddressesEvmMain()` is what the config feeds to the primitive, so the address is
never pasted anywhere.

There is no Cardano contract. `packages/contracts-cardano/` is dev infrastructure:
`packages/contracts-cardano/fill-template.ts` pulls the Byron/Shelley/Alonzo/Conway genesis
files out of the running YACI DevKit and generates the Dolos config from
`packages/contracts-cardano/dolos.template.toml`, and
`packages/contracts-cardano/cardano-tx-helpers.ts` wires Lucid Evolution to Dolos for reads
and to YACI's `/local-cluster/api/tx/submit` for writes.

### API

`packages/node/api.ts` adds five routes to the node's Fastify server on port 9999:

| Route | Returns |
| --- | --- |
| `GET /api/events?limit&offset` | Most recent rows from `events` across both chains |
| `GET /api/events/:chain` | The same, filtered to `evm` or `cardano` |
| `GET /api/stats` | The `chain_stats` rows |
| `GET /api/block-heights` | Per-protocol sync progress from `effectstream.sync_protocol_pagination` |
| `GET /api/contract-address` | The deployed `Erc721Dev` address, or `503` before deploy |

The runtime adds `GET /health` and `GET /block-heights` on the same port.

The frontend is served separately on 10599 by `packages/frontend/server/main.ts`, which
proxies `/api/*` to the node and `/yaci/*` to YACI's `/local-cluster/api`, and adds three
routes of its own — `POST /cardano/connect`, `POST /cardano/faucet` and
`POST /cardano/send` — backed by a server-side Lucid wallet. That is why the dashboard
needs no browser extension: the EVM side signs in the page with a well-known Hardhat dev
key (`packages/frontend/client/src/config.ts`), and the Cardano side signs on the server.

### Database

`packages/database/migrations/000-init.sql` is the entire schema — one append-only event
log with a `chain` discriminator, plus a small per-chain counter table seeded at migration
time:

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  chain TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  amount TEXT,
  tx_hash TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
...
INSERT INTO chain_stats (chain) VALUES ('evm'), ('cardano');
```

Queries live in `packages/database/sql/queries.sql` and are compiled to typed functions by
pgtyped (`bun run build:pgtypes`); `packages/database/mod.ts` re-exports them together with
the `migrationTable` that `packages/node/main.dev.ts` hands to `start()`.

## Configuration

The template targets the local stack only — there is no mainnet config. Everything is
either hard-coded in `packages/node/config.dev.ts` or set by the orchestrator.

| Variable | Set by | Effect |
| --- | --- | --- |
| `PGLITE` | `start.dev.ts` (`"true"`) | Run against embedded PGLite instead of an external Postgres |
| `MQTT_BROKER` | `start.dev.ts` (`"false"`) | Skip the MQTT broker; the dashboard polls HTTP instead |
| `DEBUG_PGLITE` | `start.dev.ts` (`"0"`) | Silence PGLite query logging |
| `NODE_ENV` | `bun run dev` (`development`) | Selects the orchestrator's dev mode |
| `EFFECTSTREAM_API_PORT` | Runtime, default `9999` | Node HTTP API port |
| `VITE_API_URL` | Optional, default `http://localhost:9999` | Upstream the frontend server proxies `/api/*` to |
| `YACI_URL` | Optional, default `http://localhost:10000` | Upstream for `/yaci/*` and the server-side wallet |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PW` / `DB_NAME` | `packages/tests/run-tests.ts` | Postgres connection used by the test suite |

To point the node at a real network, change the network and sync-protocol entries in
`packages/node/config.dev.ts`: swap `addViemNetwork({ ...hardhatClean, name: "evmMain" })`
for the chain you want and raise `confirmationDepth`; replace the Cardano `rpcUrl` with a
hosted UTxO-RPC endpoint, set `startChainPoint` to a recent point instead of `"origin"`,
and drop the `delayMs` probe, which exists only to compensate for the devnet's clock.

## Testing

```bash
bun run test
```

`packages/tests/run-tests.ts` boots its own orchestrator config
(`packages/tests/start.test.ts`, which unlike the dev launcher *does* run
`cardano-submit-tx`), waits on the orchestrator's process API, then runs three phases:

- **A — Infrastructure.** Waits for `generate-evm-mod` to finish, asserts the EVM chain
  answers `eth_chainId` with `0x7a69`, waits for `cardano-submit-tx`, asserts the YACI admin
  API and the Dolos Blockfrost endpoint respond, then waits for the node's `/health`.
- **B — State machine.** Mints token `1001` with viem against the address from
  `/api/contract-address` and asserts an `nft_mint` row appears for that account; asserts
  the seeded topups produced `ada_transfer` rows.
- **C — Playwright.** Installs Chromium and runs `packages/frontend/e2e/app.spec.ts`
  against http://localhost:10599 — dashboard render, EVM and Cardano wallet connect, mint,
  faucet, a real ADA send, the event feed and table, chain stats, and the `/api/stats` and
  `/api/events` endpoints.

Infrastructure is torn down through the orchestrator's `/shutdown` endpoint whether or not
the run passed.

## Where to go next

- [Sync protocols and chain config](https://effectstream.github.io/docs/home/components/sync-service) — main vs parallel protocols, and every protocol type available
- [Primitives](https://effectstream.github.io/docs/home/components/primitives) — how a chain event becomes a typed state-machine input
- [Cardano](https://effectstream.github.io/docs/home/chains/cardano) — YACI DevKit, Dolos and the Cardano primitives in detail
- [EVM](https://effectstream.github.io/docs/home/chains/evm) — the EVM side of the same configuration
- [Private Delegation Voting](https://effectstream.github.io/docs/home/templates/zk-cardano) — the sibling template that pairs Cardano with Midnight instead of an EVM chain

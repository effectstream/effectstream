---
title: "EVM + Midnight Token Metadata"
description: "Multi-chain template that joins public ERC-721 ownership on EVM with metadata disclosed by a Midnight ZK circuit into a single rollup state."
sidebar_label: "EVM + Midnight Token Metadata"
sidebar_position: 3
---

<!-- Generated from templates/evm-midnight-v2/README.md by docs/site/scripts/sync-template-readmes.ts. Do not edit directly. -->

> Template: **[`templates/evm-midnight-v2`](https://github.com/effectstream/effectstream/tree/main/templates/evm-midnight-v2)**

![The EVM + Midnight dApp](./evm-midnight-evm-midnight.png)

A token's *ownership* is a good fit for a public EVM chain: everyone needs to agree on it. A token's *properties* often are not — stats, bids, traits and attributes are frequently better computed privately and revealed only once. This template splits an NFT along exactly that line. The ERC-721 contract on the EVM chain owns transfers; a Compact circuit on Midnight takes private inputs, and discloses only the resulting key/value property to Midnight's public ledger. Effectstream syncs both chains and merges them into one queryable table.

The template ships the whole loop: a local Hardhat chain, a full local Midnight stack (node, indexer, proof server), a sync node with two parallel sync protocols, a Postgres schema, a REST endpoint, a batcher with EVM and Midnight adapters, a React frontend that mints a token and calls the circuit from the browser, and an end-to-end test suite. It is the reference to read when you want to build a dApp whose state lives on more than one chain.

## What this template shows

**The join happens in the rollup, not on a bridge.** Neither chain knows the other exists. There is no message-passing contract, no relayer, no light client. The two chains are correlated by a shared key — `(contract_address, token_id)` — that the user supplies to both sides, and the state machine is what actually merges them. That is the pattern worth copying: when you only need a *consistent view* of two chains rather than *atomic execution* across them, an Effectstream rollup replaces a bridge.

**Compact's `disclose` is the interface between ZK and the sync node.** Effectstream reads Midnight's public ledger, so a Midnight contract has to decide what a sync node is allowed to see. In `packages/contracts-midnight/contract-round-value/src/counter.compact` the `increment` circuit accepts four private arguments and writes each through `disclose(...)` into a public ledger field. The private inputs stay off-chain; the resulting property becomes readable state. Designing the circuit *is* designing the sync surface.

**Two parallel sync protocols under one NTP main protocol.** `packages/node/config.dev.ts` declares an NTP main protocol (`mainNtp`) plus two parallel ones — `mainEvmRPC` and `parallelMidnight`. The NTP clock supplies the canonical block ordering, and each chain is ingested independently against it. Neither chain has to be the "primary" one, and the EVM and Midnight sides can run at completely different block times (500 ms polling vs 1000 ms locally, 1000 ms vs 6000 ms on mainnet).

**Events arrive out of order, and the state machine is written for it.** A user can add a Midnight property before the ERC-721 `Transfer` has been indexed, so the `midnightContractState` transition in `packages/node/state-machine.ts` inserts a placeholder row with `owner: ""` when the token is unknown — required because `evm_midnight_properties` has a foreign key onto `evm_midnight`. Both transitions use `ON CONFLICT … DO UPDATE`, so replays and re-orders converge on the same state.

**Fixed-width byte fields need decoding on the way out.** Compact ledger fields are `Bytes<64>` / `Bytes<32>`, so the frontend right-pads ASCII into fixed-width arrays (`toEncodedString` in `packages/frontend/client/src/increment.ts`) and the state machine's `decodeField` reverses it, tolerating both the hex-string and byte-index-object shapes the primitive can produce.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `@effectstream/sm` state machine (`Stm`) | `packages/node/state-machine.ts` | Two transitions — `transfer-assets` and `midnightContractState` — writing into one schema |
| Builtin grammars (`@effectstream/sm/grammar`) | `packages/node/grammar.ts` | `builtinGrammars.evmErc721` and `builtinGrammars.midnightGeneric` parse each primitive's payload |
| `PrimitiveTypeEVMERC721` | `packages/node/config.dev.ts` | Ingests `Transfer` events from the deployed `Erc721Dev` contract |
| `PrimitiveTypeMidnightGeneric` | `packages/node/config.dev.ts` | Reads the Compact contract's public ledger via the generated `CounterContract.ledger` reader |
| NTP main + parallel sync protocols (`@effectstream/config`) | `packages/node/config.dev.ts`, `packages/node/config.mainnet.ts` | `ConfigBuilder` wires `mainNtp`, `mainEvmRPC` and `parallelMidnight` |
| `@effectstream/runtime` `start()` | `packages/node/main.dev.ts` | Boots the node with state transitions, migrations, grammar and API router |
| Custom Fastify API router | `packages/node/api.ts` | `GET /api/erc721` serving the merged EVM + Midnight view |
| `@effectstream/db` + pgtyped | `packages/database/` | Migration table and typed queries generated from `sql/sm_example.sql` |
| `@effectstream/batcher-sdk` — `EffectstreamL2DefaultAdapter` | `packages/batcher/effectstream-l2.ts` | Submits batched inputs to `MyPaimaL2Contract` on the EVM chain |
| `@effectstream/batcher-sdk` — `MidnightAdapter` | `packages/batcher/midnight-balancing.ts` | Invokes the Compact circuit from the batcher's own funded wallet |
| `@effectstream/orchestrator` launch helpers | `start.dev.ts` | `launchPglite`, `launchEvm`, `launchMidnight` build the local dependency graph |
| `@effectstream/evm-hardhat` | `packages/contracts-evm/` | Compiles with Forge + Hardhat and generates the TypeScript bindings in `build/mod.ts` |
| `@effectstream/midnight-contracts` | `packages/contracts-midnight/deploy.ts`, `packages/node/config.dev.ts` | `deployMidnightContract`, `readMidnightContract`, `midnightNetworkConfig` |
| `@effectstream/wallets` | `packages/frontend/client/src/contexts/WalletContext.tsx` | Browser wallet connection and login |
| `@effectstream/event-client` | `packages/frontend/client/src/hooks/BlockWatcher.ts` | Subscribes to builtin node events for the live block columns |

## Quick start

Prerequisites beyond [Bun](https://bun.sh):

- **[Foundry](https://www.getfoundry.sh/)** — `forge` compiles the Solidity artifacts the binding generator reads. The orchestrator checks for it on PATH and refuses to start without it.
  ```sh
  curl -L https://foundry.paradigm.xyz | bash && foundryup
  ```
- **[Compact](https://github.com/midnightntwrk/compact)** — the Midnight circuit compiler. This template selects `0.33.0-rc.2` and checks that exact selection before any Midnight process launches.
  ```sh
  curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  bun toolchain/compact.ts install
  ```

`toolchain.json` is the template's source of truth for the Compact selection.
The installer downloads the immutable upstream asset for the current platform
and verifies its published checksum. The local build runner, startup preflight,
and Docker build all read the same declaration; the documentation consistency
test keeps the commands above aligned with it.

Then:

```sh
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/evm-midnight-v2

# Inside the monorepo, use link.sh — it installs npm deps and then symlinks
# every @effectstream/* package to its local source. Standalone copies of the
# template use `bun install` instead.
./link.sh

# Compiles the Compact circuit, compiles + deploys the Solidity contracts,
# deploys the Midnight contract, then starts PGLite, the sync node, the
# batcher and the frontend.
bun run dev
```

`bun run dev` is `NODE_ENV=development bunx orchestrator start`, which reads `start.dev.ts`. Open the dApp at [http://localhost:10599](http://localhost:10599).

| Service | URL |
| --- | --- |
| Frontend (dApp) | http://localhost:10599 |
| Sync node API | http://localhost:9999 |
| Sync node OpenAPI docs | http://localhost:9999/documentation |
| Batcher | http://localhost:3334 |
| Orchestrator API | http://localhost:4747 |
| Hardhat EVM (main) | http://localhost:8545 |
| Hardhat EVM (parallel) | http://localhost:8546 |
| Midnight node RPC | http://localhost:9944 |
| Midnight indexer (GraphQL) | http://localhost:8088/api/v3/graphql |
| Midnight proof server | http://localhost:6300 |
| PGLite (Postgres) | `postgres://postgres:postgres@localhost:5432/postgres` |

Individual build steps are also available on their own:

```sh
bun run build:midnight   # compile with the Compact selection in toolchain.json
bun run build:evm        # Forge + Hardhat compile, deploy, generate TS bindings
bun run build:pgtypes    # regenerate pgtyped query types from sql/*.sql
```

### Docker

The `Dockerfile` installs Bun, Node, Foundry and the Compact compiler selection
from `toolchain.json`, pre-warms the solc cache, and starts the same orchestrator
config.

```sh
# On macOS Apple Silicon
export DOCKER_DEFAULT_PLATFORM=linux/amd64

docker build -f ./Dockerfile . -t evm-midnight
docker run -p 10599:10599 -p 9999:9999 -p 8545:8545 -p 8546:8546 \
           -p 8088:8088 -p 6300:6300 -p 9944:9944 -p 4747:4747 evm-midnight

# Run the test suite inside the container
docker run evm-midnight bun run test
```

## Project structure

```
evm-midnight-v2/
├── start.dev.ts                              # Orchestrator process graph for the local stack
├── link.sh                                   # Symlink @effectstream/* to monorepo sources
├── Dockerfile                                # Full stack in one container
└── packages/
    ├── node/                                 # @evm-midnight/node — sync node
    │   ├── main.dev.ts                       #   Dev entry point (Hardhat + local Midnight)
    │   ├── main.mainnet.ts                   #   Mainnet entry point (Arbitrum One + Midnight mainnet)
    │   ├── config.dev.ts                     #   Networks, sync protocols and primitives (dev)
    │   ├── config.mainnet.ts                 #   Same, env-driven, for mainnet
    │   ├── grammar.ts                        #   Prefix -> builtin grammar mapping
    │   ├── state-machine.ts                  #   The two state transition functions
    │   └── api.ts                            #   GET /api/erc721
    ├── database/                             # @evm-midnight/database
    │   ├── migrations/000-init.sql           #   evm_midnight + evm_midnight_properties
    │   ├── migration-order.ts                #   migrationTable consumed by the runtime
    │   └── sql/sm_example.sql                #   pgtyped query definitions
    ├── contracts-evm/                        # @evm-midnight/contracts-evm
    │   ├── src/contracts/ERC721Dev.sol       #   Mintable ERC-721 the node syncs
    │   ├── src/contracts/MyPaimaL2.sol       #   EffectstreamL2Contract the batcher writes to
    │   ├── ignition/modules/                 #   Hardhat Ignition deployment modules
    │   └── deploy.ts                         #   Deploys to the main and parallel Hardhat chains
    ├── contracts-midnight/                   # @evm-midnight/contracts-midnight
    │   ├── deploy.ts                         #   deployMidnightContract("contract-round-value")
    │   ├── package.json                      #   node / indexer / proof-server launch scripts
    │   └── contract-round-value/             # @evm-midnight/midnight-contract
    │       ├── src/counter.compact           #   The Compact circuit
    │       └── src/witnesses.ts              #   Private state type + (empty) witnesses
    ├── batcher/                              # @evm-midnight/batcher
    │   ├── batcher.dev.ts                    #   Local batcher (both adapters)
    │   ├── batcher.mainnet.ts                #   Mainnet batcher
    │   ├── effectstream-l2.ts                #   EVM L2 contract adapter
    │   └── midnight-balancing.ts             #   Midnight circuit adapter
    ├── frontend/                             # @evm-midnight/frontend
    │   ├── client/                           #   React + Vite dApp
    │   ├── server/main.ts                    #   Fastify static server on :10599
    │   └── .env.dev / .env.mainnet           #   VITE_* endpoints per environment
    └── tests/                                # @evm-midnight/tests — end-to-end suite
```

## How it works

### Contracts

The EVM side is deliberately boring — a mintable OpenZeppelin ERC-721 whose `Transfer` events are the only thing the node cares about:

```solidity
// packages/contracts-evm/src/contracts/ERC721Dev.sol
contract Erc721Dev is ERC721 {
    constructor() ERC721("Mock ERC721", "MERC") {}

    function mint(address _to, uint256 _tokenId) external {
        _mint(_to, _tokenId);
    }
}
```

The Midnight side is where the interesting decision lives. The `increment` circuit takes four private inputs and publishes each of them into a ledger field:

```compact
// packages/contracts-midnight/contract-round-value/src/counter.compact
pragma language_version >= 0.17;

import CompactStandardLibrary;

// public state
export ledger round: Counter;
export ledger contract_address: Bytes<64>;
export ledger token_id: Bytes<64>;
export ledger property_name: Bytes<32>;
export ledger value: Bytes<32>;

// transition function changing public state
export circuit increment(
  contract_address_: Bytes<64>,
  token_id_: Bytes<64>,
  property_name_: Bytes<32>,
  value_: Bytes<32>,
): [] {
  round.increment(1);
  contract_address = disclose(contract_address_);
  token_id = disclose(token_id_);
  property_name = disclose(property_name_);
  value = disclose(value_);
}
```

The circuit is named `increment` because it started life as the Midnight counter example; `round` is still incremented on every call, which is what makes each invocation a distinct ledger state the sync node can observe. `packages/contracts-midnight/contract-round-value/src/witnesses.ts` declares an empty witness set — this template's privacy comes from the arguments, not from private witness state.

### Sync configuration and primitives

`packages/node/config.dev.ts` builds the whole ingestion pipeline. Two primitives, one per chain, each pointing at a state machine prefix:

```ts
.addPrimitive(
  (syncProtocols) => syncProtocols.mainEvmRPC,
  (network, deployments, syncProtocol) => ({
    name: "Arbitrum_ERC721",
    type: PrimitiveTypeEVMERC721,
    startBlockHeight: 0,
    contractAddress: contractAddressesEvmMain()
      .chain31337["Erc721DevModule#Erc721Dev"],
    stateMachinePrefix: "transfer-assets",
  }),
)
.addPrimitive(
  (syncProtocols) => syncProtocols.parallelMidnight,
  (network, deployments, syncProtocol) => ({
    name: "MidnightContractState",
    type: PrimitiveTypeMidnightGeneric,
    startBlockHeight: 1,
    contractAddress: readMidnightContract(
      "contract-round-value",
      { networkId: midnightNetworkConfig.id },
    ).contractAddress,
    stateMachinePrefix: "midnightContractState",
    contract: { ledger: CounterContract.ledger },
    networkId: midnightNetworkConfig.id,
  }),
)
```

Note `contract: { ledger: CounterContract.ledger }` — the primitive is handed the `ledger` reader generated by `compact compile`, which is how it turns a raw Midnight contract state into a typed payload. Both contract addresses are read from build output rather than hardcoded: the EVM address from the generated Ignition bindings, the Midnight address from the deployment file written by `deploy.ts`.

The dev config also recovers the NTP start time from `effectstream.sync_protocol_pagination` on boot, so restarting the node does not restart the rollup clock.

### Grammar

Both prefixes use builtin grammars, so the template writes no parser of its own:

```ts
// packages/node/grammar.ts
export const grammar = {
  "transfer-assets": builtinGrammars.evmErc721,
  "midnightContractState": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
```

### State machine

`transfer-assets` records ownership. The contract address comes from the generated bindings, so the key written here matches the one the frontend sends to Midnight:

```ts
// packages/node/state-machine.ts
stm.addStateTransition(
  "transfer-assets",
  function* (data) {
    const { to, tokenId }: any = data.parsedInput;
    const contract_address =
      contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"];
    yield* World.resolve(insertEvmMidnight, {
      contract_address,
      token_id: tokenId,
      owner: to,
      block_height: data.blockHeight,
    });
  },
);
```

`midnightContractState` decodes the disclosed ledger fields, backfills the token row if the EVM event has not landed yet, then upserts the property:

```ts
const contract_address = decodeField(payload.contract_address);
const token_id = decodeField(payload.token_id);
const property_name = decodeField(payload.property_name);
const value = decodeField(payload.value);

if (!token_id) {
  console.log("[STM:midnight] empty token_id, skipping");
  return;
}

const [evmMidnight] = yield* World.resolve(getEvmMidnightByTokenId, {
  contract_address,
  token_id,
});

if (!evmMidnight) {
  yield* World.resolve(insertEvmMidnight, {
    contract_address, token_id, owner: "", block_height: data.blockHeight,
  });
}

yield* World.resolve(insertEvmMidnightProperty, {
  contract_address, token_id, property_name, value, block_height: data.blockHeight,
});
```

### Database

Two tables, joined on the composite key, with the properties table constrained to reference a known token (`packages/database/migrations/000-init.sql`):

```sql
CREATE TABLE evm_midnight (
  id SERIAL PRIMARY KEY,
  token_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  owner TEXT,
  block_height INTEGER NOT NULL
);
CREATE UNIQUE INDEX evm_midnight_contract_address_index ON evm_midnight(contract_address, token_id);

CREATE TABLE evm_midnight_properties (
  id SERIAL PRIMARY KEY,
  property_name TEXT NOT NULL,
  value TEXT NOT NULL,
  token_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  FOREIGN KEY (contract_address, token_id) REFERENCES evm_midnight(contract_address, token_id)
);
```

Both writes are idempotent upserts (`packages/database/sql/sm_example.sql`):

```sql
/* @name insertEvmMidnightProperty */
INSERT INTO evm_midnight_properties
    (contract_address, token_id, property_name, value, block_height)
VALUES
    (:contract_address!, :token_id!, :property_name!, :value!, :block_height!)
ON CONFLICT (contract_address, token_id, property_name)
DO UPDATE SET
    value = EXCLUDED.value,
    block_height = EXCLUDED.block_height
;
```

`bun run build:pgtypes` regenerates the typed wrappers in `sql/sm_example.queries.ts`, and `migration-order.ts` exports the `migrationTable` the runtime applies at startup.

### API

`packages/node/api.ts` adds one endpoint to the node's Fastify server. It guards against being called before migrations have run, then serves the joined view:

```ts
server.get("/api/erc721", async (_request, reply) => {
  const [tableExists] = await runPreparedQuery(
    evmMidnightTableExists.run(undefined, dbConn), "evmMidnightTableExists");
  if (!tableExists?.exists) {
    reply.send([]);
    return;
  }
  const result = await runPreparedQuery(
    getEvmMidnight.run(undefined, dbConn), "/api/erc721");
  reply.send(result);
});
```

Each row carries the token, its owner, one property, and the block heights of both — for example:

```json
[{"token_id":"111","owner":"","block_height":1395,"property_name":"Name","value":"Starlight Bridge Token","property_block_height":1395}]
```

### Frontend flow

`packages/frontend/client/src/components/WalletDemo.tsx` drives the demo end to end. Minting calls the ERC-721 directly on the local Hardhat chain with viem; adding a property goes through `packages/frontend/client/src/increment.ts`, which builds a Midnight wallet in the browser (`WalletFacade.init`), joins the deployed contract with `findDeployedContract`, and invokes the circuit with fixed-width ASCII arguments:

```ts
const toEncodedString = (str: string, length = 32) =>
  Uint8Array.from(str.padEnd(length, " ").split("").map((c) => c.charCodeAt(0)));

const finalizedTxData = await counterContract.callTx.increment(
  toEncodedString(contractAddress, 64),
  toEncodedString(tokenId, 64),
  toEncodedString(propertyName, 32),
  toEncodedString(propertyValue, 32),
);
```

The UI then polls `GET /api/erc721` and shows the merged result. Because the MQTT broker is skipped under Bun, `.env.dev` sets `VITE_IS_BUN=true` and the frontend polls the node's `/block-heights` endpoint for the live block columns instead of subscribing over WebSocket.

## Configuration

The template ships two environments.

| | Dev | Mainnet |
| --- | --- | --- |
| EVM chain | Hardhat (31337) | Arbitrum One (42161) |
| Midnight | Local, `undeployed` network id | Midnight mainnet |
| Node entry | `packages/node/main.dev.ts` | `packages/node/main.mainnet.ts` |
| Node config | `packages/node/config.dev.ts` | `packages/node/config.mainnet.ts` |
| Batcher entry | `packages/batcher/batcher.dev.ts` | `packages/batcher/batcher.mainnet.ts` |
| Frontend env | `packages/frontend/.env.dev` | `packages/frontend/.env.mainnet` |
| Start command | `bun run dev` | `bun run start:mainnet` |

### Dev

Most values are set by `start.dev.ts` and need no attention.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | set by `bun run dev` | Must be `development` for the orchestrator to pick `start.dev.ts` |
| `EVM_PRIVATE_KEY` | Hardhat account #1 key | Signs the batcher's EVM transactions (`packages/batcher/batcher.dev.ts`) |
| `BATCHER_PORT` | `3334` | Batcher HTTP port |
| `PGLITE` | `true` (set for the sync process) | Set `PGLITE=false` to use an external Postgres on `DB_PORT` instead of the embedded PGLite |
| `EFFECTSTREAM_API_PORT` | `9999` | Sync node HTTP API port |
| `MIDNIGHT_STORAGE_PASSWORD` | `YourPasswordMy1!` | Midnight private-state store password; needs 3 of 4 character classes |

### Mainnet

`packages/node/config.mainnet.ts` throws on startup if any required variable is missing, and asserts that `midnightNetworkConfig.id` is `mainnet`.

| Variable | Required | Description |
| --- | --- | --- |
| `EVM_RPC_URL` | Yes | Arbitrum One RPC endpoint |
| `EVM_START_BLOCK` | Yes | EVM block height to start syncing from |
| `MIDNIGHT_START_BLOCK` | Yes | Midnight block height to start syncing from |
| `NTP_START_TIME` | No | NTP epoch in ms; otherwise recovered from the database, then `Date.now()` |
| `EVM_PRIVATE_KEY` | Yes | Signs the batcher's Arbitrum transactions |

### Pointing at another Midnight network

Midnight endpoints come from `@effectstream/midnight-contracts/midnight-env`, which is driven entirely by environment variables. Setting `MIDNIGHT_NETWORK_ID` to anything other than `undeployed` (`testnet`, `preview`, `mainnet`, …) switches the defaults to `https://indexer.<id>.midnight.network` and `https://rpc.<id>.midnight.network`; the proof server stays local unless overridden. Individual URLs can be overridden with `MIDNIGHT_INDEXER_HTTP`, `MIDNIGHT_INDEXER_WS`, `MIDNIGHT_NODE_HTTP` and `MIDNIGHT_PROOF_SERVER_URL`, and the wallet with `MIDNIGHT_WALLET_SEED` or `MIDNIGHT_WALLET_MNEMONIC` (the local genesis seed is only used on `undeployed`).

The frontend reads its endpoints from `VITE_*` variables in `.env.dev` / `.env.mainnet`:

```sh
bun run --filter @evm-midnight/frontend build:dev       # uses .env.dev
bun run --filter @evm-midnight/frontend build:mainnet   # uses .env.mainnet
```

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` starts the orchestrator against `packages/tests/start.test.ts`, waits on the orchestrator's `/health` and `/processes` endpoints, runs the phases below, then shuts the stack down. It exits non-zero if any assertion fails *or* if any infrastructure wait times out.

| Phase | Files | Covers |
| --- | --- | --- |
| A — Infrastructure | `infra/chain-ready.test.ts`, `infra/deploy.test.ts`, `infra/midnight-ready.test.ts`, `infra/midnight-deploy.test.ts` | Hardhat is up, contracts deployed, Midnight node/indexer/proof server ready, Compact contract deployed |
| B — STM / DB / API | `stm/erc721.test.ts`, `stm/api.test.ts`, `stm/api-erc721.test.ts`, `stm/erc721-properties.test.ts` | State transitions write the expected rows; `/api/erc721` returns them |
| C — Cross-chain | `stm/cross-chain.test.ts` | Mints and transfers on Hardhat with viem, then asserts the database and API reflect it |
| D — Midnight property | `stm/midnight-property.test.ts` | Calls the `increment` circuit and asserts the disclosed property lands in the database (non-fatal) |
| E — Frontend | `frontend/build-smoke.test.ts`, `frontend/render.test.ts`, `frontend/wallet-connect.test.ts` | Frontend builds, renders under Playwright, and connects a wallet |

## Where to go next

- [Midnight integration](https://effectstream.github.io/docs/home/chains/midnight) — how Effectstream reads Midnight's public ledger, and what that means for circuit design
- [Primitives](https://effectstream.github.io/docs/home/components/primitives) — the chain-aware listeners behind `PrimitiveTypeEVMERC721` and `PrimitiveTypeMidnightGeneric`
- [State machine](https://effectstream.github.io/docs/home/components/state-machine) — writing and testing state transition functions
- [Batcher overview](https://effectstream.github.io/docs/home/components/batcher/overview) — adapters, batching criteria and confirmation levels
- Sibling templates: [`minimal`](https://github.com/effectstream/effectstream/tree/main/templates/minimal) for the smallest single-chain node, [`night-bitcoin-v2`](https://github.com/effectstream/effectstream/tree/main/templates/night-bitcoin-v2) for a Midnight + Bitcoin intent swap, and [`evm-cardano`](https://github.com/effectstream/effectstream/tree/main/templates/evm-cardano) for another two-chain rollup

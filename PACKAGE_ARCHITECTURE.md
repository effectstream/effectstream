# Package Architecture Plan

Reorganize the monorepo into three public wrapper packages with a minimal set of
shared independent packages. Single-consumer packages are embedded into their
wrapper rather than published separately.

## Wrapper Packages (public API)

### `@effectstream/node-sdk`

Server-side runtime. Embeds the following packages:

| Current package              | Role                                    |
| ---------------------------- | --------------------------------------- |
| `runtime`                    | Fastify HTTP server, RPC endpoints      |
| `sm`                         | Game state machine (DB-heavy)           |
| `sync`                       | Multi-chain synchronization             |
| `db`                         | PostgreSQL abstraction & migrations     |
| `db-emulator`                | PGLite testing helper                   |
| `coroutine`                  | PGTyped SQL codegen                     |
| `event-server`               | MQTT broker (aedes)                     |
| `config`                     | Chain configuration types & utilities   |
| `chain-types`                | Pure chain type definitions             |
| `precompile`                 | Hash utilities (js-sha3)               |

### `@effectstream/frontend-sdk`

Browser-side SDK. Embeds the following packages:

| Current package | Role                                              |
| --------------- | ------------------------------------------------- |
| `wallets`       | Wallet providers (MetaMask, Polkadot, Cardano, …) |

### `@effectstream/batcher-sdk`

Standalone batch processor. Embeds the following packages:

| Current package      | Role                             |
| -------------------- | -------------------------------- |
| `midnight-contracts` | Midnight SDK contract deployment |

## Independent Packages (shared across 2+ wrappers)

| Package                      | Consumers                                       |
| ---------------------------- | ------------------------------------------------ |
| `@effectstream/utils`        | node, frontend, batcher                          |
| `@effectstream/crypto`       | node (sm), frontend (wallets), batcher           |
| `@effectstream/concise`      | node (sm, runtime), frontend (wallets)           |
| `@effectstream/event-client` | node (runtime), frontend (wallets), batcher      |
| `@effectstream/log`          | node (db, sm, sync, runtime), evm-hardhat        |

## Separate Tools (own publish lifecycle)

| Package                                      | Role                                |
| -------------------------------------------- | ----------------------------------- |
| `@effectstream/orchestrator-v2`              | CLI orchestrator v2                  |
| `@effectstream/evm-hardhat`                  | Hardhat plugin / build tool          |
| `@effectstream/evm-contracts`                | Solidity contracts                   |
| `@effectstream/bitcoin-contracts`            | Bitcoin scripts                      |
| `@effectstream/cardano-contracts`            | Plutus contract types                |
| `@effectstream/avail-contracts`              | Avail contract ABIs                  |
| `@effectstream/npm-avail-light-client`       | Avail light client binary            |
| `@effectstream/npm-avail-node`               | Avail node binary                    |
| `@effectstream/bitcoin-core`                 | Bitcoin Core binary                  |
| `@effectstream/celestia`                     | Celestia binary                      |
| `@effectstream/grafana-alloy`                | Grafana Alloy binary                 |
| `@effectstream/grafana-loki`                 | Grafana Loki binary                  |
| `@effectstream/npm-midnight-indexer`         | Midnight indexer binary              |
| `@effectstream/npm-midnight-node`            | Midnight node binary                 |
| `@effectstream/npm-midnight-proof-server`    | Midnight proof server binary         |
| `@effectstream/near-sandbox`                 | NEAR sandbox binary                  |
| `@effectstream/ord`                          | Ordinals (ord) binary                |

## Deprecated

| Package                      | Note                    |
| ---------------------------- | ----------------------- |
| `@effectstream/orchestrator` | Not published — migrating to orchestrator-v2 |
| `@effectstream/explorer`     | Not published — internal dev tool only |

## Dependency Flow

```
Independent (shared)
├── utils                  ← base, no deps
├── crypto                 ← utils
├── concise                ← crypto, utils
├── event-client           ← utils
└── log                    ← utils

@effectstream/frontend-sdk
└── wallets                ← concise, crypto, event-client, utils

@effectstream/node-sdk
├── config                 ← utils
├── chain-types            ← (none)
├── precompile             ← (none)
├── coroutine              ← (none)
├── db-emulator            ← (none)
├── db                     ← coroutine, log, runtime, sync, utils
├── event-server           ← utils
├── sm                     ← concise, config, coroutine, crypto, db, log, utils
├── sync                   ← config, db, log, utils
└── runtime                ← concise, config, coroutine, crypto, db,
                              event-client, event-server, log, sm, sync, utils

@effectstream/batcher-sdk
├── midnight-contracts     ← utils
└── (root)                 ← utils, crypto, event-client, midnight-contracts
```

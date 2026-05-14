# EVM-Midnight Template

Multi-chain template demonstrating EVM + Midnight blockchain integration with Effectstream. Syncs ERC-721 events from an EVM chain and Midnight contract state, with a React frontend and transaction batcher.

## Quick Start

```sh
# Install dependencies
bun install

# Compile Midnight Compact contract (requires Compact compiler)
bun run build:midnight

# Launch full stack (PGLite, Hardhat, Midnight, sync node, batcher, frontend)
bun run dev
```

Open the dApp at [http://localhost:10599](http://localhost:10599).

## Monorepo Development

When developing inside the Effectstream monorepo, use `link.sh` instead of `bun install`. It installs npm dependencies and then symlinks all `@effectstream/*` packages to their local monorepo sources:

```sh
./link.sh
bun run dev
```

## Environments

The template ships with two environments: **dev** (local Hardhat + local Midnight) and **mainnet** (Arbitrum One + Midnight mainnet).

| | Dev | Mainnet |
|---|---|---|
| EVM chain | Hardhat (31337) | Arbitrum One (42161) |
| Midnight | Local (undeployed) | Mainnet |
| Node entry | `packages/node/main.dev.ts` | `packages/node/main.mainnet.ts` |
| Batcher entry | `packages/batcher/batcher.dev.ts` | `packages/batcher/batcher.mainnet.ts` |
| Frontend env | `packages/frontend/.env.dev` | `packages/frontend/.env.mainnet` |
| Start command | `bun run dev` | `bun run start:mainnet` |

### Mainnet environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EVM_RPC_URL` | Yes | Arbitrum One RPC endpoint |
| `EVM_START_BLOCK` | Yes | EVM block height to start syncing from |
| `MIDNIGHT_START_BLOCK` | Yes | Midnight block height to start syncing from |
| `NTP_START_TIME` | No | NTP epoch (ms). Falls back to DB state, then `Date.now()` |
| `EVM_PRIVATE_KEY` | Yes | Private key for batcher EVM transactions |

### Frontend builds

```sh
bun run --filter @evm-midnight/frontend build:dev      # uses .env.dev
bun run --filter @evm-midnight/frontend build:mainnet   # uses .env.mainnet
```

## Testing

```sh
bun run test
```

Runs the test suite in `packages/tests/` which covers infrastructure readiness, state machine transitions, and API endpoints.

## Docker

```sh
# If running on macOS Apple Silicon
export DOCKER_DEFAULT_PLATFORM=linux/amd64

# Build
docker build -f ./Dockerfile . -t evm-midnight

# Run (dev mode — starts full stack)
docker run -p 10599:10599 -p 9999:9999 -p 8545:8545 -p 8546:8546 -p 8088:8088 -p 6300:6300 -p 9944:9944 evm-midnight

# Run tests inside container
docker run evm-midnight bun run test

# Open:
# dApp: http://localhost:10599/
```

## Project Structure

```
evm-midnight-v2/
  packages/
    node/                  # @evm-midnight/node
    database/              # @evm-midnight/database
    contracts-evm/         # @evm-midnight/contracts-evm
    contracts-midnight/    # @evm-midnight/contracts-midnight
      contract-round-value/  # @evm-midnight/midnight-contract
    batcher/               # @evm-midnight/batcher
    frontend/              # @evm-midnight/frontend
    tests/                 # @evm-midnight/tests
  link.sh                  # Symlink monorepo packages for local dev
```

### packages/node

Sync node, state machine, config, API, and orchestrator configs. Key files:

| File | Purpose |
|------|---------|
| `main.dev.ts` | Dev entry point — local Hardhat + Midnight |
| `main.mainnet.ts` | Mainnet entry point — Arbitrum One + Midnight mainnet |
| `config.dev.ts` | Dev network, sync protocol, and primitive configuration |
| `config.mainnet.ts` | Mainnet configuration (env-driven) |
| `state-machine.ts` | `Stm` class with state transitions for ERC-721 and Midnight events |
| `grammar.ts` | Input grammar for the state transition machine |
| `api.ts` | Fastify API routes (e.g. `GET /api/erc721`) |

### packages/database

SQL migrations and pgtyped query definitions. Exports a `migrationTable` used by the sync node.

### packages/contracts-evm

Solidity contracts (`MyPaimaL2Contract`, ERC-721 dev token), Hardhat compilation, Ignition deployment scripts, and generated TypeScript bindings (`build/mod.ts`).

### packages/contracts-midnight

Midnight infrastructure scripts (node, indexer, proof server) and contract deployment. Contains the `contract-round-value/` sub-workspace with the Compact contract source.

### packages/batcher

Transaction batcher with adapters for EVM (L2 contract) and Midnight. Ships with `config.dev.ts` (local) and `config.mainnet.ts` (Arbitrum One).

### packages/frontend

React app with Vite, Midnight wallet integration, and a Fastify static file server. Requires compiled Midnight contract artifacts (`managed/`) to build. Supports `--mode dev` and `--mode mainnet` via `.env.*` files.

### packages/tests

E2E test suite covering infrastructure, state machine, and API.

## Services

| Service | Port | URL |
|---------|------|-----|
| Sync node (HTTP API) | 9999 | http://localhost:9999 |
| Sync node (MQTT-WS) | 8883 | ws://localhost:8883 |
| Batcher | 3334 | http://localhost:3334 |
| Frontend | 10599 | http://localhost:10599 |
| PGLite (Postgres) | 5432 | |
| Hardhat (EVM main) | 8545 | |
| Hardhat (EVM parallel) | 8546 | |
| Midnight node | 9944 | |
| Midnight indexer | 8088 | |
| Midnight proof server | 6300 | |
| Orchestrator API | 4747 | http://localhost:4747 |

## Environment Variables (Dev)

| Variable | Default | Description |
|----------|---------|-------------|
| `EVM_PRIVATE_KEY` | Hardhat account #1 | Private key for batcher EVM transactions |
| `BATCHER_PORT` | `3334` | Batcher HTTP server port |
| `PGLITE` | `true` (in dev) | Use PGLite instead of external Postgres |

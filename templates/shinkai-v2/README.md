# Shinkai Quest Template

AI-powered RPG demonstrating Shinkai AI node integration with Effectstream on EVM. Players navigate animal NPCs at the Panda King's court, each posing challenges evaluated by AI. Features a global token economy and PixiJS frontend.

## Quick Start

```sh
bun install
bun run dev
```

Open the dApp at [http://localhost:10599](http://localhost:10599).

## Environments

| | Dev | Mainnet |
|---|---|---|
| EVM chain | Hardhat (31337) | Arbitrum One (42161) |
| Node entry | `packages/node/main.dev.ts` | `packages/node/main.mainnet.ts` |
| Batcher entry | `packages/batcher/batcher.dev.ts` | `packages/batcher/batcher.mainnet.ts` |
| Start command | `bun run dev` | `bun run start:mainnet` |

### Mainnet environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EVM_RPC_URL` | Yes | Arbitrum One RPC endpoint |
| `EVM_START_BLOCK` | Yes | EVM block height to start syncing from |
| `EFFECTSTREAM_L2_ADDRESS` | Yes | Deployed EffectstreamL2 contract address |
| `EVM_PRIVATE_KEY` | Yes | Private key for batcher EVM transactions |
| `NTP_START_TIME` | No | NTP epoch (ms). Falls back to DB state, then `Date.now()` |
| `SHINKAI_URL` | Yes | Shinkai node API URL |
| `SHINKAI_API_KEY` | Yes | Shinkai node Bearer token |
| `SHINKAI_LLM_PROVIDER` | No | LLM provider (default: `shinkai_free_trial`) |

## Testing

```sh
bun run test
```

Runs the test suite in `packages/tests/` covering infrastructure readiness, state machine transitions, and API endpoints.

## Project Structure

```
shinkai-v2/
  packages/
    node/                  # @shinkai-v2/node
    database/              # @shinkai-v2/database
    contracts-evm/         # @shinkai-v2/contracts-evm
    batcher/               # @shinkai-v2/batcher
    frontend/              # @shinkai-v2/frontend
    tests/                 # @shinkai-v2/tests
```

### packages/node

Sync node, state machine, config, API, Shinkai AI client, and prompt definitions.

| File | Purpose |
|------|---------|
| `main.dev.ts` | Dev entry point — local Hardhat |
| `main.mainnet.ts` | Mainnet entry point — Arbitrum One |
| `config.dev.ts` | Dev network and sync protocol configuration |
| `config.mainnet.ts` | Mainnet configuration (env-driven) |
| `state-machine.ts` | `Stm` class with state transitions for newGame, ai, tick |
| `grammar.ts` | Input grammar for the state transition machine |
| `api.ts` | Fastify API routes (`/api/game`, `/api/game/round`, etc.) |
| `shinkai-client.ts` | Shinkai v2 API client (Bearer token auth) |
| `prompts.ts` | Animal NPC prompt templates |

### packages/database

SQL migrations and pgtyped query definitions.

### packages/contracts-evm

Solidity EffectstreamL2 contract, Hardhat compilation, Ignition deployment.

### packages/batcher

Transaction batcher with EVM adapter factory.

### packages/frontend

PixiJS game with Vite build. Players connect wallet, start a new game, and interact with four animal NPCs (Tiger, Monkey, Bison, Panda King).

### packages/tests

E2E test suite covering infrastructure and state machine.

## Game Mechanics

### Grammar Inputs

| Command | Payload | Description |
|---------|---------|-------------|
| `newGame` | `[]` | Start a new game session |
| `ai` | `[target, id, response]` | Submit answer to an animal NPC |
| `tick` | `[n]` | Scheduled: adds 20 tokens to world pool |

### Animal NPCs

| Animal | Role | Question |
|--------|------|----------|
| Tiger | Master of Arms | "Which is the best Animal of the Entire Kingdom?" |
| Monkey | Master of Whispers | "What is most holy of all?" |
| Bison | Royal Consul | "What should the Kingdom do in case of war?" |
| Panda | The King | "Why should I give you Tokens?" |

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/game?game_id=N` | Get game state by ID |
| `GET /api/game/new?wallet=ADDR` | Get latest new game for wallet |
| `GET /api/game/round?game_id=N&stage=ANIMAL` | Get Q&A for a specific round |
| `GET /api/game/tokens?wallet=ADDR` | Get user + world token counts |

## Services

| Service | Port |
|---------|------|
| Sync node (HTTP API) | 9999 |
| Batcher | 3334 |
| Frontend | 10599 |
| PGLite (Postgres) | 5432 |
| Hardhat (EVM) | 8545 |
| Orchestrator API | 4747 |

# Chess v2 Template

Single-chain EVM template demonstrating a turn-based chess game with Effectstream. Players create lobbies, join games (PvP or vs AI), and play chess with time controls and ELO ratings.

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
| `EVM_RPC_URL` | Yes | EVM RPC endpoint (e.g. Arbitrum One) |
| `EVM_START_BLOCK` | Yes | EVM block height to start syncing from |
| `EFFECTSTREAM_L2_ADDRESS` | Yes | Deployed EffectstreamL2 contract address |
| `EVM_PRIVATE_KEY` | Yes | Private key for batcher transactions |

## Testing

```sh
bun run test
```

Runs the E2E suite in `packages/tests/`: infrastructure readiness, state machine transitions (lobby creation, joining, move submission), API endpoints, and frontend build.

## Project Structure

```
chess-v2/
  packages/
    node/                  # @chess-v2/node — sync engine, STM, API
    database/              # @chess-v2/database — migrations + pgtyped queries
    contracts-evm/         # @chess-v2/contracts-evm — Solidity, Hardhat, Ignition
    batcher/               # @chess-v2/batcher — TX batcher (EffectstreamL2)
    frontend/              # @chess-v2/frontend — React + Vite + MUI
    tests/                 # @chess-v2/tests — E2E test suite
```

### packages/node

| File | Purpose |
|------|---------|
| `grammar.ts` | Input grammar (createdLobby, joinLobby, submitMoves, etc.) |
| `config.dev.ts` | Dev network + sync protocol + primitive configuration |
| `config.mainnet.ts` | Mainnet configuration (env-driven) |
| `state-machine.ts` | STM transitions for lobby, join, move, zombie, bot, stats |
| `api.ts` | Fastify API routes |
| `chess-helpers.ts` | Move validation, timers, rating calculations |
| `chess-ai.ts` | Bot move calculation (difficulty-scaled) |
| `main.dev.ts` | Dev entry point |
| `main.mainnet.ts` | Mainnet entry point |

### packages/batcher

| File | Purpose |
|------|---------|
| `effectstream-l2.ts` | Adapter factory — resolves contract address, creates adapter |
| `batcher.dev.ts` | Dev entry point (Hardhat, local keys) |
| `batcher.mainnet.ts` | Mainnet entry point (validates env vars) |

## Services

| Service | Port |
|---------|------|
| Sync node API | 9999 |
| Batcher | 3334 |
| Frontend | 10599 |
| PGLite (Postgres) | 5432 |
| Hardhat EVM | 8545, 8546 |
| Orchestrator API | 4747 |

## Game Mechanics

### Grammar inputs

| Key | Description |
|-----|-------------|
| `createdLobby` | Create lobby (rounds, time controls, visibility, practice mode, bot difficulty, color) |
| `joinLobby` | Join an open lobby by ID |
| `closeLobby` | Close an open lobby (creator only) |
| `submitMoves` | Submit a PGN move for the current round |
| `z` | Zombie round — auto-triggered when a player's move timer expires |
| `u` | Stats update — scheduled internally after match ends |
| `sb` | Scheduled bot move — AI plays in practice mode |

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/lobby_state?lobbyID=` | Full lobby state with remaining time |
| `GET /api/open_lobbies?wallet=&count=&page=` | Paginated open lobbies |
| `GET /api/search_open_lobbies?wallet=&searchQuery=&count=&page=` | Search open lobbies |
| `GET /api/user_lobbies?wallet=&count=&page=` | User's lobbies (active + finished) |
| `GET /api/user_stats?wallet=` | Player stats + ELO rating rank |
| `GET /api/match_winner?lobbyID=` | Final match result |
| `GET /api/round_status?lobbyID=&round=` | Round data + moves |
| `GET /api/round_executor?lobbyID=&round=` | Lobby + round + moves |
| `GET /api/match_executor?lobbyID=` | Full match replay data |
| `GET /api/random_lobby` | Random open lobby |
| `GET /api/random_active_lobby` | Random active (in-progress) lobby |

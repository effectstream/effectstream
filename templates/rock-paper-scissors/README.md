# Rock Paper Scissors Wars - Effectstream Template

A multiplayer turn-based Rock Paper Scissors game built with the Paima Effectstream framework. Players can create lobbies, challenge opponents, and compete in best-of-N matches with full on-chain game state.

## Game Overview

Rock Paper Scissors Wars features:
- **Lobby System**: Create public/private lobbies with customizable round counts and time limits
- **Turn-Based Gameplay**: Submit moves each round, with automatic execution when both players commit
- **Practice Mode**: Test against yourself without affecting stats
- **Zombie Rounds**: Automatic forfeit system for inactive players
- **Player Statistics**: Track wins, losses, and ties across all matches
- **Full On-Chain State**: All game logic and state stored on-chain

## Architecture

This template uses the Paima Effectstream architecture with:
- **Deno Workspace**: Monorepo structure with shared packages
- **TypeBox Grammar**: Type-safe input validation
- **pgtyped**: Type-safe SQL queries
- **Generator-Based State Machine**: Coroutine pattern with `yield*`
- **PGlite**: In-memory PostgreSQL database
- **Phaser.js**: Game frontend framework

## Quick Start

### Prerequisites

- Deno 2.5.4+
- Node.js 24.x (for frontend build)
- Docker (optional, for containerized deployment)

### Installation

```bash
# Install dependencies
npm install

# Remove lock file to ensure Deno recreates node_modules symlinks
# Note: Required because npm install may clear node_modules, and Deno
# won't recreate symlinks without a fresh lock file
rm -rf deno.lock

deno install --allow-scripts

# Run patch script
./patch.sh

# Build EVM contracts
deno task build:evm

# Build frontend
cd packages/frontend && npm install && node esbuild.js && cd ../..
```

### Development

```bash
# Start development server (backend + frontend)
deno task dev

# Check types
deno task check
```

The game will be available at:
- Frontend: http://localhost:8080
- API: http://localhost:9999
- Explorer: http://localhost:10590
- Blockchain: http://localhost:8545

### Docker

```bash
# Build and run with Docker
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t rock-paper-scissors -f Dockerfile .
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run -p 8080:8080 -p 9999:9999 -p 8545:8545 rock-paper-scissors
```

## Package Structure

```
rock-paper-scissors/
├── packages/
│   ├── client/
│   │   ├── database/          # SQL schema and pgtyped queries
│   │   └── node/              # Backend application
│   │       ├── src/
│   │       │   ├── state-machine/    # Game logic transitions
│   │       │   ├── state-machine.ts  # PaimaSTM setup
│   │       │   ├── api.ts            # REST API endpoints
│   │       │   └── main.ts           # Entry point
│   │       └── scripts/
│   │           └── start.ts          # Development orchestrator
│   ├── frontend/              # Phaser.js game UI
│   └── shared/
│       ├── contracts/         # EVM smart contracts
│       ├── data-types/        # TypeBox grammar & types
│       └── game-logic/        # Core RPS game engine
├── Dockerfile
└── deno.json                  # Workspace configuration
```

## State Machine Transitions

The game implements these input types:

1. **createdLobby**: Initialize a new game lobby
   - Parameters: numOfRounds, roundLength, isHidden, isPractice
   - Creates lobby with unique ID and initial match state

2. **joinedLobby**: Second player joins a lobby
   - Parameters: lobbyID
   - Marks lobby as active, creates first round, initializes stats

3. **submittedMoves**: Player submits move for current round
   - Parameters: lobbyID, roundNumber, move_rps (rock/paper/scissors)
   - Caches move; auto-executes round when both players submit

4. **executeRound**: Process both moves and determine winner
   - Internal function triggered by submittedMoves
   - Updates match state, creates next round or ends game

5. **zombieScheduledData**: Handle inactive player timeout
   - Parameters: lobbyID
   - Forfeits round for missing player

6. **closedLobby**: Creator cancels lobby before second player joins
   - Parameters: lobbyID
   - Closes lobby and prevents further joins

## Database Schema

### Tables

- **lobbies**: Game lobby metadata (creator, rounds, state, timestamps)
- **rounds**: Individual round data (moves, execution, scheduling)
- **match_moves**: Cached player moves before execution
- **final_match_state**: Completed game results and match state strings
- **global_user_state**: Player statistics (wins, losses, ties)

### Key Features

- Automatic current round tracking via trigger
- Lobby states: open, active, finished, closed
- Match results: w (win), l (loss), t (tie)

## API Endpoints

The backend exposes these REST endpoints:

- `GET /lobby/:lobbyId` - Get lobby details
- `GET /lobbies/open` - List open lobbies (paginated)
- `GET /lobbies/active` - List active lobbies (paginated)
- `GET /user/:wallet/stats` - Get player statistics
- `GET /lobby/:lobbyId/rounds` - Get all rounds for a lobby
- `GET /lobby/:lobbyId/round/:roundNumber` - Get specific round
- `GET /lobby/:lobbyId/moves` - Get all moves for a lobby
- `GET /lobby/:lobbyId/result` - Get final match result

## Game Flow

1. Player 1 creates lobby with `createdLobby` input
2. Player 2 joins with `joinedLobby` input
3. For each round:
   - Both players submit moves with `submittedMoves`
   - When both submitted, `executeRound` processes moves
   - Winner determined by RPS rules
   - Next round created or game ends
4. If player times out, `zombieScheduledData` forfeits round
5. Game ends when match limit reached
6. Stats updated with `userScheduledData`

## Development Notes

### Database Query Regeneration

If you modify `.sql` files in `packages/client/database/src/sql/`:

```bash
cd packages/client/database
npx pgtyped -c pgtypedconfig.json
```

### Frontend Development

The Phaser frontend is in `packages/frontend/`. To rebuild:

```bash
cd packages/frontend
npm install
node esbuild.js
```

### Adding New Inputs

1. Add TypeBox schema to `packages/shared/data-types/src/grammar.ts`
2. Add type definition to `packages/shared/data-types/src/types.ts`
3. Create transition function in `packages/client/node/src/state-machine/v1/transition.ts`
4. Register in `packages/client/node/src/state-machine.ts`

## Migration Status

This template has been fully migrated from the V1 Paima architecture to Effectstream. Key improvements:

- ✅ Simplified state transitions (direct SQLUpdate returns)
- ✅ Type-safe database queries with pgtyped
- ✅ Generator-based coroutine pattern
- ✅ Modular package structure
- ✅ Docker support
- ✅ Middleware layer (`paimaMiddleware.src.js`) with wallet integration
- ✅ Frontend Phaser scenes migrated to use Effectstream middleware
- ✅ Frontend build system using esbuild

All components are now fully operational!

## Resources

- [Paima Documentation](https://docs.paimastudios.com)
- [Effectstream Guide](https://docs.paimastudios.com/effectstream)
- [Deno Documentation](https://deno.land/manual)
- [Phaser Documentation](https://phaser.io/docs)

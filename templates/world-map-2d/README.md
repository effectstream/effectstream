# World Map 2D - EffectStream Template

A 2D world map example demonstrating EffectStream's features including user movement, world state tracking, and on-chain interactions.

## Quick Start

```sh
# Install dependencies
deno install --allow-scripts && ./patch.sh

# Build contracts
deno task build:evm

# Start the development server (includes backend and local blockchain)
deno task dev
```

### Frontend Setup

In a separate terminal:

```sh
cd frontend
npm install
node esbuild.js      # Build the frontend bundle
npx http-server .    # Serve on http://127.0.0.1:8080
```

Then open http://127.0.0.1:8080 in your browser.

### Using Test Accounts

For development, you can import Hardhat's test accounts into MetaMask instead of using your personal wallet:

1. Open MetaMask → Click account icon → **Import Account**
2. Select **Private Key** and paste:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
3. This gives you access to Account #0 with **10,000 ETH** on your local network
4. Make sure MetaMask is connected to **Localhost 8545** (Chain ID: 31337)

⚠️ **Never use this private key on a real network** - it's publicly known and only for local development.

## Features

- **Join World**: Users can join a 10x10 grid world
- **Submit Move**: Move to a position (x, y) on the grid
- **Submit Increment**: Increment a counter at a specific world position
- **World State**: Track global world state including position counters and user positions

## Project Structure

```
world-map-2d/
├── deno.json                                    # Root workspace configuration
├── package.json                                 # PGLite dependency
├── patch.sh                                     # Post-install Hardhat patches
├── Dockerfile                                   # Docker configuration
│
├── packages/
│   ├── client/
│   │   ├── database/                           # PostgreSQL database layer
│   │   │   ├── deno.json                       # Database package config
│   │   │   ├── package.json                    # pgtyped dependencies
│   │   │   ├── pgtypedconfig.json              # pgtyped configuration
│   │   │   ├── src/
│   │   │   │   ├── migrations/database.sql     # Schema migrations
│   │   │   │   ├── sql/                        # SQL query files
│   │   │   │   │   ├── select.sql              # Select queries
│   │   │   │   │   ├── insert.sql              # Insert queries
│   │   │   │   │   └── update.sql              # Update queries
│   │   │   │   └── *.queries.ts                # Generated TypeScript types
│   │   │   └── mod.ts                          # Database exports
│   │   │
│   │   └── node/                               # Backend node application
│   │       ├── deno.json                       # Node package config with tasks
│   │       ├── src/
│   │       │   ├── main.ts                     # Application entry point
│   │       │   ├── state-machine.ts            # State transition handlers (PaimaSTM)
│   │       │   └── api.ts                      # Fastify API endpoints
│   │       └── scripts/
│   │           └── start.ts                    # Orchestrator dev script
│   │
│   └── shared/
│       ├── contracts/evm/                      # EVM smart contracts
│       │   ├── hardhat.config.ts               # Hardhat configuration
│       │   ├── foundry.toml                    # Forge configuration
│       │   ├── deploy.ts                       # Contract deployment script
│       │   ├── package.json                    # ESM module config
│       │   └── src/contracts/                  # Solidity contracts
│       │
│       ├── data-types/                         # Shared types and schemas
│       │   ├── src/
│       │   │   ├── grammar.ts                  # TypeBox input grammar
│       │   │   └── localhostConfig.ts          # Local development config
│       │   └── mod.ts
│       │
│       ├── game-logic/                         # Core game logic
│       │   └── src/
│       │       ├── joinWorld.ts                # Join world handler
│       │       ├── submitMove.ts               # Movement handler
│       │       └── submitIncrement.ts          # Increment handler
│       │
│       └── utils/                              # Shared utilities
│           └── src/
│               ├── types.ts                    # Common type definitions
│               └── random.ts                   # Random number utilities
│
└── frontend/                                    # Simple HTML frontend
    ├── .npmrc                                   # JSR registry config
    ├── package.json                             # Frontend dependencies
    ├── esbuild.js                               # Frontend build script
    ├── index.html                               # Main HTML page
    ├── index.js                                 # Frontend application logic
    ├── paimaMiddleware.src.js                   # Wallet/transaction middleware
    └── paimaMiddleware.js                       # Bundled middleware (generated)
```

## Development

### Run with Docker

```sh
docker build . -f Dockerfile -t effectstream-world-map-2d
docker run -p 8545:8545 -p 9999:9999 -p 3334:3334 -p 8080:8080 effectstream-world-map-2d
# Open http://127.0.0.1:8080 in a browser
```

## API Endpoints

The backend server runs on **port 9999** and provides the following REST endpoints:

- `GET /user_stats?wallet=<address>` - Get user position and stats for a wallet address
  - Returns: `{ x: number, y: number }` or `null` if user hasn't joined

- `GET /world_stats` - Get all world cells that can be visited
  - Returns: Array of 100 cells (10x10 grid) with visit counts and coordinates

Example:
```sh
curl http://localhost:9999/user_stats?wallet=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
curl http://localhost:9999/world_stats
```

## State Transitions

The game supports three state transitions defined in [grammar.ts](packages/shared/data-types/src/grammar.ts):

1. **joinWorld** - Join the world at position (0,0)
   - Command: `["joinWorld"]`
   - Creates user state and initializes position

2. **submitMove** - Move to a new position (x,y) on the grid
   - Command: `["submitMove", x, y]`
   - Updates user position

3. **submitIncrement** - Increment visit counter at position (x,y)
   - Command: `["submitIncrement", x, y]`
   - Increments world state counter at that location

### pgtyped query generation
If you modify SQL files, regenerate types:
```sh
cd packages/client/database
npm install
npx pgtyped -c ./pgtypedconfig.json
```

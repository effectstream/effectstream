# World Map 2D - EffectStream Template

A 2D world map example demonstrating EffectStream (formerly Paima Engine) features including user movement, world state tracking, and on-chain interactions.

## Quick Start

```sh
# Install dependencies
deno install --allow-scripts && ./patch.sh

# Build contracts
deno task build:evm

# Start the development server
deno task dev
```

### Frontend Setup

In another terminal:

```sh
cd frontend
npm install
node esbuild.js
npx http-server .
```

Then open http://localhost:8080 in your browser.

## Features

- **Join World**: Users can join a 10x10 grid world
- **Submit Move**: Move to any position (x, y) on the grid
- **Submit Increment**: Increment a counter at a specific world position
- **World State**: Track global world state including position counters and user positions

## Project Structure

```
world-map-2d/
├── deno.json                           # Root workspace configuration
├── package.json                        # PGLite dependency
├── patch.sh                           # Post-install patches
├── Dockerfile                         # Docker configuration
├── packages/
│   ├── client/
│   │   ├── database/                  # Database queries and migrations
│   │   └── node/                      # Backend node application
│   │       ├── src/
│   │       │   ├── main.ts           # Entry point
│   │       │   ├── state-machine.ts  # State transition logic
│   │       │   └── api.ts            # API endpoints
│   │       └── scripts/
│   │           └── start.ts          # Development startup script
│   └── shared/
│       ├── contracts/evm/            # Smart contracts
│       ├── data-types/               # Grammar and configuration
│       ├── game-logic/               # Game logic
│       └── utils/                    # Shared utilities
└── frontend/                          # Simple HTML frontend
    ├── index.html
    ├── index.js
    └── esbuild.js
```

## Development

### Run with Docker

```sh
docker build . -f Dockerfile -t effectstream-world-map-2d
docker run -p 8545:8545 -p 9999:9999 -p 3334:3334 -p 8080:8080 effectstream-world-map-2d
# Open http://127.0.0.1:8080 in a browser
```

### Available Commands

- `deno task build:evm` - Build EVM contracts
- `deno task dev` - Start development environment
- `deno task check` - Type-check the application

## API Endpoints

- `GET /user_stats?wallet=<address>` - Get user position and stats
- `GET /world_stats?x=<x>&y=<y>` - Get world state at position

## State Transitions

The game supports three state transitions:

1. **joinWorld** (`j|`) - Join the world at position (0,0)
2. **submitMove** (`@m||x|y`) - Move to position (x,y)
3. **submitIncrement** (`i|*x|*y`) - Increment counter at position (x,y)

## Technology Stack

- **EffectStream**: On-chain game engine
- **Deno**: JavaScript/TypeScript runtime
- **PostgreSQL**: Database (via PGLite)
- **Viem**: Ethereum library
- **Fastify**: HTTP server
- **TypeBox**: Schema validation

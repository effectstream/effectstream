# Dice Game - Paima Effectstream Template

A blackjack dice game built with the Paima Effectstream framework.

## Game Rules

Players take turns rolling two dice. The goal is to get as close to 21 as possible without going over. After each roll, players can choose to roll again or pass their turn. When both players finish their turns, points are awarded:
- Score exactly 21: 2 points
- Closest to 21 without going over: 1 point
- Tie or over 21: 0 points

The match continues for multiple rounds, and the player with the most points wins.

## Prerequisites

- **Deno 2.5.4+** - For running the game node and tasks
- **Node.js 24.x** - For npm dependencies (frontend only)
- **Foundry** - For smart contract development and testing

## Installation

Simply run:

```bash
deno install --allow-scripts
./patch.sh
deno task build:evm
```

**Note**: The frontend will be automatically installed, built, and served when you run `deno task dev`. No manual installation needed!

## Development

Start the entire development environment (blockchain, game node, API, frontend, explorer):

```bash
deno task dev
```

This command automatically:
1. Starts a local Ethereum node (Hardhat/Anvil)
2. Deploys smart contracts
3. Starts the Paima game node with database
4. Installs and builds the frontend
5. Serves the frontend on http://localhost:8080
6. Launches the block explorer on http://localhost:10590

### Individual Commands

```bash
# Type-check the code
deno task check

# Build EVM contracts
deno task build:evm
```

## Project Structure

```
dice/
├── deno.json                      # Root workspace configuration
├── packages/
│   ├── client/
│   │   ├── database/              # PostgreSQL schema and pgtyped queries
│   │   └── node/                  # Main game node
│   │       ├── src/
│   │       │   ├── state-machine/ # Effectstream state transitions
│   │       │   ├── api.ts         # Fastify API endpoints
│   │       │   ├── main.ts        # Entry point
│   │       │   └── state-machine.ts
│   │       └── scripts/start.ts   # Orchestrator configuration
│   ├── shared/
│   │   ├── contracts/evm/         # Smart contracts (Hardhat/Foundry)
│   │   ├── data-types/            # Grammar, types, config
│   │   └── game-logic/            # Pure game logic functions
│   └── frontend/                  # Game UI
└── README.md
```

## Database

Update SQL schema:

1. Edit migration files in `packages/client/database/src/migrations/`
2. Edit query files in `packages/client/database/src/sql/`
3. Run pgtyped to regenerate TypeScript types:

```bash
deno task -f @dice/db pgtyped:update
```

## Smart Contracts

Build contracts:
```bash
deno task build:evm
```

## Docker

Build:
```bash
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t dice-sample .
```

Run:
```bash
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run -p 8080:8080 -p 9999:9999 dice-sample
```

## Learn More

- [Paima Documentation](https://docs.paimastudios.com)
- [Effectstream Guide](https://docs.paimastudios.com/effectstream)
- [Concise Grammar](https://docs.paimastudios.com/concise)

## License

MIT

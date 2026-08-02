# Hex Battle

A turn-based tactics game on a hex grid, built with Effectstream. Two players
create or join a lobby, submit simultaneous hidden moves each round, and the
state machine resolves them deterministically. Includes a practice mode against
a local AI.

This template is a port of the Paima v1 `hex-battle` game to the current
`@effectstream/*` layout — see [`MIGRATION.md`](./MIGRATION.md) for the
step-by-step record of that migration, which doubles as a worked example of
porting an older Paima project.

## Quick start

```bash
bun i
bun run dev
```

`bun run dev` starts the orchestrator, which brings up a local Hardhat node,
deploys the contracts, starts the development database, and runs the sync node
and frontend.

## Layout

```
packages/
  node/            sync node: config, grammar, state machine, API
  engine/          pure game rules, shared by the node and the frontend AI
  database/        migrations and pgtyped queries
  contracts-evm/   Effectstream L2 contract and deployment
  frontend/        web client, including practice-vs-AI mode
  tests/           integration tests
```

Keeping the rules in a standalone `engine` package is the notable part of this
template: the same module drives both server-side resolution and the client's
practice AI, so the two can never disagree about the rules.

## Grammar

| Command | Purpose |
| --- | --- |
| `createLobby` | Open a new lobby with the chosen parameters. |
| `joinLobby` | Join an existing lobby by ID. |
| `submitMoves` | Submit a round's moves. |
| `surrender` | Concede the match. |
| `zombieScheduledData` | Scheduled input that advances a lobby whose player has timed out. |

## Scripts

```bash
bun run dev             # full local stack via the orchestrator
bun run test            # integration tests
bun run test:practice   # practice-mode AI test
bun run build:evm       # compile contracts and generate TypeScript bindings
bun run build:pgtypes   # regenerate pgtyped query types
bun run check           # typecheck the node package
```

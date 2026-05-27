# Template README

Every template MUST include a `README.md` at its root. Use this canonical structure (reference implementations: `templates/chess-v2/README.md`, `templates/evm-midnight-v2/README.md`).

## Required sections

| Section | Required | Content |
|---|---|---|
| Title + one-liner | Yes | Template name + a single sentence describing purpose and chains |
| Quick Start | Yes | `bun install` + any pre-build steps + `bun run dev` + dApp URL |
| Environments | Yes | Table comparing Dev vs Mainnet: chain, entry points, start commands |
| Mainnet env vars | Yes (if mainnet exists) | Table of required/optional env vars |
| Testing | Yes | `bun run test` + brief description of coverage |
| Project Structure | Yes | ASCII tree of `packages/` with workspace names |
| Package descriptions | Yes | Key-file table for node/batcher, prose for others |
| Services | Yes | Table of all services with ports |
| Game/App Mechanics | Recommended | Grammar inputs table + API endpoints table |
| Docker | Yes | The standard Docker section (see `docker.md`) |

## Guidelines

- **Under 150 lines** for single-chain templates, **under 200** for multi-chain.
- **Tables over prose** for structured information (ports, env vars, grammar keys).
- **Ports and URLs must match** what `start.dev.ts` actually configures.
- **No internal implementation details** — focus on "how to run" and "what's where". Architecture details belong in CLAUDE.md or code comments, not the README.
- Use **second-person imperative** ("Run `bun install`") rather than first-person ("We run `bun install`").

## Skeleton

```markdown
# my-template

A single-line description: what this template does, on which chains.

## Quick Start

```sh
bun install
bun run dev
```

Open http://localhost:10599 to see the dApp.

## Environments

| | Dev | Mainnet |
|---|---|---|
| Chain | Hardhat (local) | Arbitrum |
| Entry point | `start.dev.ts` / `main.dev.ts` | `main.mainnet.ts` |
| Start | `bun run dev` | `bun run start:mainnet` |

## Mainnet env vars

| Variable | Required | Description |
|---|---|---|
| `EVM_RPC_URL` | Yes | HTTPS RPC endpoint |
| `EVM_START_BLOCK` | Yes | Block to start syncing |
| `EVM_PRIVATE_KEY` | Yes | Batcher submitter key |

## Testing

```sh
bun run test
```

Covers Phase A (chain ready, contracts deployed), Phase B (submit tx → DB → API), and Phase C (frontend build + render).

## Project Structure

```
packages/
├── node/                   @my-template/node
├── database/               @my-template/database
├── contracts-evm/          @my-template/contracts-evm
├── batcher/                @my-template/batcher
├── frontend/               @my-template/frontend
└── tests/                  @my-template/tests
```

## Services

| Service | Port |
|---|---|
| Frontend | 10599 |
| Sync API | 9999 |
| Orchestrator | 4747 |
| Batcher | 3334 |
| Hardhat | 8545 |

## Game Mechanics

### Grammar inputs

| Key | Fields | Description |
|---|---|---|
| `createRoom` | `roomName: string`, `maxPlayers: number` | Create a new game room |

### API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/rooms` | List all rooms |
| GET | `/api/rooms/:name` | Get one room by name |

## Docker

(standard Docker section — see `docker.md` for the canonical block)
```

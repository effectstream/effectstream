# CLAUDE.md — shinkai-v2

## What this is

AI-powered RPG Effectstream template: EVM (Hardhat/Arbitrum) + Shinkai AI node. Players interact with four animal NPCs at the Panda King's court. Each NPC poses a challenge evaluated by the Shinkai AI, and the final NPC (Panda King) distributes tokens from a shared world pool based on cumulative scores.

## Commands

```bash
bun install                          # Install deps
bun run dev                          # Full stack: PGLite + Hardhat + sync + batcher + frontend
bun run start:mainnet                # Mainnet: Arbitrum One (requires env vars)
bun run test                         # E2E tests (packages/tests/run-tests.ts)
bun run build:evm                    # Compile Solidity + generate TS bindings
```

## Architecture

Bun monorepo with flat `packages/*` layout. All `@effectstream/*` deps are from npm (or `workspace:*` when inside the monorepo via `link.sh`).

| Package | Name | Purpose |
|---------|------|---------|
| `packages/node/` | `@shinkai-v2/node` | Sync node, state machine, Shinkai client, prompts |
| `packages/database/` | `@shinkai-v2/database` | SQL migrations, pgtyped queries |
| `packages/contracts-evm/` | `@shinkai-v2/contracts-evm` | Solidity contracts, Hardhat, Ignition deploy |
| `packages/batcher/` | `@shinkai-v2/batcher` | TX batcher (EVM adapter) |
| `packages/frontend/` | `@shinkai-v2/frontend` | PixiJS game + Vite + Fastify server |
| `packages/tests/` | `@shinkai-v2/tests` | E2E test suite |

## Key patterns

- **Shinkai v2 API**: Bearer token auth, no encryption. Env vars: `SHINKAI_URL`, `SHINKAI_API_KEY`, `SHINKAI_LLM_PROVIDER`.
- **State machine AI calls**: `yield* World.promise(shinkai.askQuestion(...))` for async AI within STM transitions.
- **Scheduled data**: `tick` command runs every ~60s via `createScheduledData`, adds 20 tokens to global pool.
- **Token economy**: Global world pool starts at 10000. Panda King distributes tokens to players based on cumulative NPC scores.
- **Frontend**: PixiJS 8 with `@pixi/ui` Input widget. Uses `@effectstream/wallets` for wallet connection and `sendTransaction` for game inputs.

## Ports

| Service | Port |
|---------|------|
| Sync node API | 9999 |
| Batcher | 3334 |
| Frontend | 10599 |
| PGLite | 5432 |
| Hardhat EVM | 8545 |

## Shinkai AI configuration

The game requires a running Shinkai node for the `ai` command to work. Without it, `newGame` and `tick` commands still function normally. Set these env vars to enable AI:

```bash
SHINKAI_URL="http://34.60.212.123:9550"
SHINKAI_API_KEY="your-api-key"
SHINKAI_LLM_PROVIDER="shinkai_free_trial"
```

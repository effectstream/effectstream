# paima-dice — Effectstream Template

A two-player dice game built on the Effectstream framework (Bun monorepo, EVM L2 + ERC721 account NFTs).
Ported from the paima-engine-v1 `@paima/dice` template into the `@effectstream/*` 0.100.18 flat layout.

## Game rules

Each round, players take turns rolling two dice, trying to get their accumulated
score as close to 21 as possible. After each roll a player can **roll again** or
**pass**. Once both players pass, the round resolves: the player closest to 21
(lowest `abs(21 - score)`) wins **1 point**; a tie awards 0 to both. Scores reset
each round. After the configured number of rounds, the player with the most
points wins the match; win/loss/tie tallies are recorded per account NFT.

## Architecture

Flat Bun monorepo (`packages/*`):

| Package | Name | Purpose |
|---------|------|---------|
| `packages/node/` | `@paima-dice/node` | Sync node, grammar, state machine, dice game helpers, API |
| `packages/database/` | `@paima-dice/database` | SQL migrations + pgtyped queries |
| `packages/contracts-evm/` | `@paima-dice/contracts-evm` | EffectstreamL2 + AnnotatedMintNft (ERC721) contracts |
| `packages/frontend/` | `@paima-dice/frontend` | Vanilla-JS dice UI + Fastify static server, `@effectstream/wallets` |
| `packages/tests/` | `@paima-dice/tests` | E2E test suite (Phase A infra, B STM/DB/API, C frontend) |

## Commands

```bash
bun install            # install deps
bun run dev            # full stack: PGLite + Hardhat + sync + frontend
bun run build:evm      # compile Solidity + generate TS bindings
bun run build:pgtypes  # regenerate pgtyped .queries.ts
bun run test           # E2E tests (packages/tests/run-tests.ts)
```

## Grammar actions

`nftMint` (built-in ERC721 primitive), `createdLobby`, `joinedLobby`,
`closedLobby`, `submittedMoves`, `practiceMoves`, `zombieScheduledData`,
`userScheduledData`. Game logic lives directly in each STM transition (no
round/match/tick executor abstraction) — see `packages/node/state-machine.ts`
and `packages/node/game-helpers.ts`.

## Ports

| Service | Port |
|---------|------|
| Sync node API | 9999 |
| Frontend | 10599 |
| PGLite | 5432 |
| Hardhat EVM | 8545 |

## Wallets

The frontend exposes **both** an injected browser wallet (`WalletMode.EvmInjected`,
e.g. MetaMask) and a local-JS dev wallet (`WalletMode.EvmViem`) so headless e2e
tests can drive the full flow without a browser extension.

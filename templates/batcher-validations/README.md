# Batcher Validations

Demonstrates custom batcher validation with a gate mechanism that accepts or rejects inputs via an off-chain toggle.

## Quick Start

```bash
bun install
bun run dev       # Starts PGLite, Hardhat, sync node, batcher, frontend
```

Open http://localhost:10599

## Testing

```bash
bun run test
```

## Project Structure

```
packages/
├── node/              @batcher-validations/node         Sync node, STM, API
├── database/          @batcher-validations/database     SQL migrations, typed queries
├── contracts-evm/     @batcher-validations/contracts-evm  Solidity + Hardhat
├── batcher/           @batcher-validations/batcher      Batcher with gate validation
├── frontend/          @batcher-validations/frontend     React UI
└── tests/             @batcher-validations/tests        E2E test suite
```

## Key Files

| Package | File | Purpose |
|---------|------|---------|
| node | `grammar.ts` | `sendMessage` input definition |
| node | `state-machine.ts` | Inserts commands into DB |
| node | `api.ts` | Gate toggle + commands list |
| batcher | `gated-adapter.ts` | Custom validation decorator |
| batcher | `batcher.dev.ts` | Batcher entry with GatedAdapter |

## Grammar

| Action | Fields | Description |
|--------|--------|-------------|
| `sendMessage` | `message` (string, max 280) | Submit a message through the batcher |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gate` | Returns `{ accepting: boolean }` |
| POST | `/api/gate` | Toggle gate: body `{ accepting: boolean }` |
| GET | `/api/commands` | List all processed commands |

## Services

| Service | Port |
|---------|------|
| Sync node API | 9999 |
| Batcher | 3334 |
| Frontend | 10599 |
| PGLite | 5432 |
| Hardhat EVM | 8545 |
| Orchestrator | 4747 |

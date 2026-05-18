# Private Delegation Voting — Cardano + Midnight

Cross-chain template: Delegate ADA on Cardano to become eligible, then cast private ZK votes on Midnight.

## Quick Start

```bash
bun install
bun run dev           # Full stack: PGLite + YACI + Dolos + Midnight + sync + batcher + frontend
bun run test          # E2E tests (4 phases)
```

## How It Works

1. **Cardano**: User delegates ADA to a configured stake pool (YACI genesis pool)
2. **Sync**: `PoolDelegation` primitive detects the event, STM writes to `eligible_voters` table
3. **Midnight**: Admin creates a proposal on the ballot Compact contract
4. **Vote**: Eligible user connects Midnight wallet, casts a private ZK vote (nullifier-based anonymity)
5. **Sync**: `MidnightGeneric` primitive detects ledger update, STM syncs proposals + tallies to DB
6. **Frontend**: React app shows live proposals, tallies, and eligibility checks

## Environments

| Environment | Config | Command |
|-------------|--------|---------|
| Local dev | `config.dev.ts` | `bun run dev` |

## Architecture

```
Cardano (YACI + Dolos)  ──> PoolDelegation Primitive ──> eligible_voters table
                                                              │
Midnight (ballot.compact) ──> MidnightGeneric Primitive ──> proposals + vote_tallies
                                                              │
                         Frontend (React + Midnight Wallet) <──┘
```

## Project Structure

| Package | Purpose |
|---------|---------|
| `packages/node/` | Sync engine: config, grammar, STM, API |
| `packages/database/` | SQL migrations + pgtyped queries |
| `packages/contracts-cardano/` | YACI DevKit + Dolos + delegation TX |
| `packages/contracts-midnight/` | Midnight node/indexer/prover + contract deploy |
| `packages/contracts-midnight/contract-ballot/` | Compact ballot contract |
| `packages/batcher/` | Midnight-only TX batcher |
| `packages/frontend/` | React + Vite + Midnight wallet |
| `packages/tests/` | 4-phase E2E test suite |

## Services

| Service | Port |
|---------|------|
| Sync node API | 9999 |
| Batcher | 3334 |
| Frontend | 10599 |
| PGLite | 5432 |
| YACI DevKit admin | 10000 |
| YACI Cardano node | 3001 |
| Dolos gRPC | 50051 |
| Dolos MiniBF (Blockfrost) | 3000 |
| Midnight node | 9944 |
| Midnight indexer | 8088 |
| Midnight proof server | 6300 |

## Compact Contract

`ballot.compact` provides 3 circuits:

- **`create_proposal()`** — Admin creates a new proposal (deployer-only)
- **`cast_vote(proposal_id, vote_yes)`** — Vote with ZK privacy (nullifier prevents double-voting)
- **`close_proposal(proposal_id)`** — Admin closes a proposal (deployer-only)

Voter anonymity: identity hidden behind `voter_nullifier()` derived from `persistentHash`. The on-chain `Set<Bytes<32>>` tracks nullifiers per proposal to prevent double-voting without revealing who voted.

## API Endpoints

- `GET /api/eligible/:credential` — Check if a staking credential is eligible (200 or 404)
- `GET /api/proposals` — List all proposals with vote tallies

## Testing

```bash
bun run test
```

Test phases:
- **A: Infrastructure** — Verify YACI, Dolos, Midnight node/indexer, sync node
- **B: State Machine** — Verify delegation syncs to `eligible_voters`, Midnight primitive active
- **C: API** — Verify eligibility + proposals endpoints
- **D: Frontend** — Verify Vite build succeeds


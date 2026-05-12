# Cardano Stake Pool Delegation Explorer

Demonstrates the `PrimitiveTypeCardanoPoolDelegation` primitive — a Cardano-only template that indexes stake pool delegation certificates and displays them in a real-time dashboard.

## Quick Start

```bash
bun install
bun run dev
```

## Link against local packages
```
./link.sh
```


Open [http://localhost:10599](http://localhost:10599)

## Architecture

```
Browser (Lucid Evolution)
  │ .registerAndDelegate.ToPool(rewardAddress, poolId)
  ▼
YACI DevKit (:10000) → Dolos UTxORPC (:50051)
  ▼
PrimitiveTypeCardanoPoolDelegation
  │ { address, pool, epoch }
  ▼
State Machine → delegations table
  ▼
API (GET /api/delegations, GET /api/pool-stats)
  ▼
React Dashboard (polls every 2s)
```

Wallets are 100% browser-managed via Lucid Evolution. All state changes happen through blockchain transactions — the node API is read-only.

## Services

| Service | Port | Description |
|---------|------|-------------|
| YACI DevKit | 10000 | Cardano devnet |
| Dolos gRPC | 50051 | UTxO-RPC sync |
| Dolos MiniBF | 3000 | Blockfrost-compatible API |
| Sync Node API | 9999 | Indexed data (GET only) |
| Frontend | 10599 | React dashboard |
| PGLite | embedded | PostgreSQL (in-process) |

## Project Structure

```
packages/
├── contracts-cardano/    @cardano-delegation/contracts-cardano
├── database/             @cardano-delegation/database
├── node/                 @cardano-delegation/node
├── frontend/             @cardano-delegation/frontend
└── tests/                @cardano-delegation/tests
```

### Node (`packages/node/`)

| File | Description |
|------|-------------|
| `grammar.ts` | `cardanoPoolDelegation` built-in grammar |
| `config.dev.ts` | NTP + Cardano UTXORPC + PoolDelegation primitive |
| `state-machine.ts` | Indexes delegation events into `delegations` table |
| `api.ts` | GET endpoints for delegations and pool stats |
| `main.dev.ts` | Entry point |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/delegations` | All delegations (limit/offset) |
| GET | `/api/delegations/:pool` | Filter by pool hash |
| GET | `/api/pool-stats` | Pool statistics |
| GET | `/api/block-heights` | Sync protocol status |

## Testing

```bash
bun run test
```

Runs three phases:
- **Phase A**: Infrastructure (YACI, Dolos health checks)
- **Phase B**: State machine (DB schema verification)
- **Phase C**: Playwright E2E (create wallet, fund, delegate, verify indexed data)


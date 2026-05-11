# ZSwap-DA: Atomic Token Swaps on Midnight + Celestia DA

A decentralized token swap platform that combines **Midnight Network** (privacy-preserving ZK contracts) with **Celestia** (data availability layer). Users create atomic swap offers that are published to Celestia, indexed by the sync node, and completed on Midnight.

## Architecture

```
Frontend (React + Vite)
    │
    ▼
Backend API (Fastify on port 9999)
    │
    ├── Midnight Network ──── ZK contract (mint, swap)
    │       │
    │       └── Indexer ──── Nullifier tracking, ledger state
    │
    ├── Celestia DA ──── Blob submission (swap offers)
    │       │
    │       └── Bridge RPC ──── Blob fetching
    │
    └── PostgreSQL (PGLite) ──── Offer storage, token registry, history
```

### Swap Flow

1. **Mint tokens** — Call `mint_shielded` on the Midnight contract to create tokens
2. **Create swap offer** — `wallet.initSwap()` builds an unproven ZK transaction
3. **Submit to Celestia** — Offer blob is posted to Celestia DA namespace
4. **Sync indexes offer** — Celestia parallel sync detects the blob, STM stores offer + nullifiers in DB
5. **Complete swap** — Another wallet deserializes the offer, balances it, signs, and submits to Midnight
6. **Nullifier archival** — Midnight sync detects spent nullifiers, archives the consumed offer

## Prerequisites

- [Bun](https://bun.sh/) (v1.3+)
- The parent monorepo (`pe-bun`) must be set up with `bun install` at root level
- Midnight binaries (node, indexer, proof-server) — included in `packages/binaries/`
- Celestia binaries — included in `packages/binaries/`
- [Compact compiler](https://docs.midnight.network/) (`compact` CLI) — for contract compilation

## Quick Start

From the **monorepo root** (`pe-bun/`):

```bash
# 1. Install dependencies
bun install

# 2. Start all infrastructure + backend
bun run packages/build-tools/orchestrator-v2/src/cli.ts start \
  --config bun-zswap-da/e2e/launcher.cli.ts

# 3. Wait ~2 minutes for everything to start, then verify:
curl http://localhost:9999/health
# → {"status":"ok"}

# 4. Start the frontend (in a separate terminal)
cd bun-zswap-da/packages/frontend
npx vite --host
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:9999
- **Orchestrator**: http://localhost:4747

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/zswaps?limit=N&offset=N&token=X&direction=GIVING\|WANTING` | List active swap offers |
| `GET` | `/api/known-tokens` | List registered token colors |
| `POST` | `/api/token/mint-shielded` | Mint a shielded token |
| `POST` | `/api/token/mint-unshielded` | Mint an unshielded token |
| `POST` | `/api/zswap/create` | Create a swap offer transaction |
| `POST` | `/api/zswap/submit` | Submit offer blob to Celestia DA |
| `POST` | `/api/zswap/:id/complete` | Complete (accept) an existing swap |

### Example: Mint a shielded token

```bash
curl -X POST http://localhost:9999/api/token/mint-shielded \
  -H "Content-Type: application/json" \
  -d '{"domainSep": "01", "amount": "100", "nonce": "1"}'
```

### Example: Create and submit a swap

```bash
# Create the offer transaction
curl -X POST http://localhost:9999/api/zswap/create \
  -H "Content-Type: application/json" \
  -d '{
    "gives": [{"type": "shielded", "token": "0000...0000", "amount": "10"}],
    "wants": [{"type": "shielded", "token": "0101...0101", "amount": "5"}]
  }'
# → {"success": true, "transaction": "<base64>"}

# Submit to Celestia
curl -X POST http://localhost:9999/api/zswap/submit \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": "<base64 from above>",
    "gives": [{"token": "0000...0000", "amount": "10"}],
    "wants": [{"token": "0101...0101", "amount": "5"}]
  }'
# → {"success": true, "result": {"txhash": "...", "height": "..."}}
```

## Running E2E Tests

```bash
# From monorepo root — runs all 18 tests (infra + SDK flow + API flow)
bun run bun-zswap-da/e2e/run-tests.ts
```

The test suite covers:

- **Phase 1** — Infrastructure: Celestia consensus/bridge, Midnight node/indexer
- **Phase 2** — SDK flow: Wallet funding, token minting, swap creation, Celestia submission, offer indexing, swap completion, nullifier archival
- **Phase 3** — API flow: `mint-shielded`, `known-tokens`, `zswap/create`, `zswap/submit`, `GET /api/zswaps`, `zswap/:id/complete`

## Project Structure

```
bun-zswap-da/
├── packages/
│   ├── node/                    # Backend application
│   │   ├── main.ts              # Entry point (Effection + EffectStream runtime)
│   │   ├── config.ts            # Network config (NTP + Midnight + Celestia)
│   │   ├── state-machine.ts     # STM handlers (celestia-zswap, midnight-nullifier, TTL cleanup)
│   │   ├── api.ts               # REST API (Fastify)
│   │   ├── celestia-api.ts      # Celestia blob.Submit RPC
│   │   ├── midnight-api.ts      # Midnight wallet/contract singleton
│   │   └── zswap-logic.ts       # Utility functions
│   ├── database/                # PostgreSQL schema + pgtyped queries
│   │   └── src/
│   │       ├── migrations/database.sql  # 7 tables (offers, tokens, nullifiers, history)
│   │       └── sql/example-queries.sql  # Named queries
│   ├── midnight-contracts/      # Midnight ZK contract
│   │   ├── deploy.ts            # Deployment script
│   │   └── contract-offer-files/
│   │       └── src/offer-files.compact  # 3 circuits: mint_shielded, mint_unshielded, incrementNoun
│   └── frontend/                # React + Vite + Three.js UI
│       └── src/
│           ├── components/      # SwapInterface, ZSwapList, MintModal, Header, Logo3D
│           ├── hooks/           # useTokens, useZSwapAPI, useWallet, useContract
│           └── services/api.ts  # API client
└── e2e/                         # End-to-end tests
    ├── launcher.cli.ts          # Orchestrator config (PGLite + Celestia + Midnight)
    ├── run-tests.ts             # 18 test assertions
    ├── config.ts                # Sync protocol config
    ├── grammar.ts               # STM grammar definitions
    └── node.ts                  # Simplified STM for e2e (used when running tests standalone)
```

## Infrastructure Ports

| Service | Port |
|---------|------|
| Backend API | 9999 |
| Orchestrator API | 4747 |
| Frontend (Vite) | 5173 |
| PostgreSQL (PGLite) | 5432 |
| Celestia consensus | 26657 |
| Celestia bridge RPC | 26658 |
| Midnight node | 9944 |
| Midnight indexer (GraphQL) | 8088 |
| Midnight proof server | 6300 |

## Stopping

```bash
# Stop all infrastructure
curl -X POST http://localhost:4747/shutdown

# Or kill the orchestrator process (Ctrl+C in the terminal)
```

# EVM-Cardano Explorer

Cross-chain activity dashboard built on Effectstream. Demonstrates a minimal EVM + Cardano integration using:

- **EVM**: ERC721 NFT minting on Hardhat (port 8545)
- **Cardano**: ADA transfers on YACI DevKit (port 10000) + Dolos relay (port 50051)
- **Frontend**: React dashboard polling a unified event feed (port 10599)

## Quick Start

```bash
bun install
bun run dev
```

Open [http://localhost:10599](http://localhost:10599) — the dashboard shows live chain status, and you can mint NFTs or send ADA directly from the browser using dev wallets (no browser extensions needed).

## Architecture

```
EVM (Hardhat :8545)                     Cardano (YACI :10000 + Dolos :50051)
  │ ERC721.mint()                          │ ADA transfer via YACI topup
  ▼                                        ▼
PrimitiveTypeEVMERC721              PrimitiveTypeCardanoTransfer
  │                                        │
  ▼                                        ▼
         Sync Node → State Machine → PGLite
                    ▼
              API (:9999) → /api/events, /api/stats
                    ▼
              React Dashboard (:10599)
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Hardhat | 8545 | Local EVM devnet |
| YACI DevKit | 10000 | Local Cardano devnet |
| Dolos gRPC | 50051 | UTxORPC sync protocol |
| Dolos MiniBF | 3000 | Blockfrost-compatible REST API |
| Sync Node API | 9999 | Effectstream API (events, stats) |
| Frontend | 10599 | React dashboard |

## Packages

- **contracts-evm** — Minimal ERC721 contract (`Erc721Dev.sol`) + Hardhat deployment
- **contracts-cardano** — YACI DevKit + Dolos configuration, ADA topup script
- **database** — PGLite schema (events + chain_stats tables), pgtyped queries
- **node** — Grammar, config, state machine, and API routes
- **frontend** — React dashboard with Vite, Fastify proxy server
- **tests** — Infrastructure checks, state machine tests, Playwright E2E

## Testing

```bash
bun run test
```

Runs all test phases:
1. **Infrastructure** — EVM chain responds, YACI + Dolos respond
2. **State Machine** — Mint NFT → events table, Cardano topup → events table
3. **Playwright E2E** — Headless Chromium tests: dashboard renders, mint/send flows, event feed, chain stats, API endpoints


# Projected NFT Pre-Order — Cardano

Effectstream template demonstrating the full NFT pre-order lifecycle on Cardano using the Hololocker (Projected NFT) protocol.

## Quick Start

```bash
bun install
bun run dev           # Full stack: PGLite + YACI + Dolos + sync + frontend
bun run test          # E2E tests
```

## How It Works

1. **Lock**: User sends an NFT to the Hololocker Plutus script. The NFT is "projected" into the app while remaining provably owned.
2. **Sync**: The `CardanoProjectedNFT` primitive detects Lock/Unlock/Claim events via Dolos UTxORPC and writes them to `nft_locks`.
3. **Campaigns**: Users create pre-order campaigns. Contributors must lock an NFT to participate.
4. **Marketplace**: Locked NFTs can be listed for sale. Ownership is verified on-chain.
5. **Unlock**: When done, users request an unlock (time-locked), then claim their NFT back.

## Architecture

```
Cardano (YACI + Dolos)  ──> CardanoProjectedNFT Primitive ──> nft_locks table
                                                                    │
                            State Machine (campaigns,       <───────┘
                            contributions, marketplace)
                                      │
                            Frontend (React + Vite)         <───────┘
```

## Project Structure

| Package | Purpose |
|---------|---------|
| `packages/node/` | Sync engine: config, grammar, STM, API |
| `packages/database/` | SQL migrations + pgtyped queries |
| `packages/contracts-cardano/` | Hololocker validator + YACI DevKit + Dolos + Lucid tx helpers |
| `packages/frontend/` | React + Vite UI (lock/unlock, campaigns, marketplace) |
| `packages/tests/` | E2E test suite |

## Services

| Service | Port |
|---------|------|
| Sync node API | 9999 |
| Frontend | 10599 |
| PGLite | 5432 |
| YACI DevKit admin | 10000 |
| YACI Cardano node | 3001 |
| Dolos gRPC | 50051 |
| Dolos MiniBF | 3000 |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/locks` | All NFT lock events |
| GET | `/api/locks/:address` | Lock events by owner |
| GET | `/api/campaigns` | All campaigns with totals |
| GET | `/api/campaigns/:id` | Single campaign |
| GET | `/api/campaigns/:id/contributions` | Campaign contributions |
| GET | `/api/marketplace` | Active marketplace listings |
| GET | `/api/verify/:policyId/:assetName` | Verify NFT participation |
| POST | `/api/cardano/connect` | Connect dev wallet |
| POST | `/api/cardano/mint-nft` | Mint test NFT |
| POST | `/api/cardano/lock` | Lock NFT at script |
| POST | `/api/cardano/unlock` | Request unlock |
| POST | `/api/cardano/claim` | Claim NFT back |
| GET | `/api/cardano/script-hash` | Get Hololocker script hash |

## Grammar

| Key | Type | Description |
|-----|------|-------------|
| `cardano-projected-nft` | Built-in | Lock/Unlock/Claim lifecycle events |
| `createCampaign` | Custom | Create a pre-order campaign |
| `endCampaign` | Custom | End a campaign |
| `contribute` | Custom | Contribute to a campaign |
| `listOnMarketplace` | Custom | List a locked NFT for sale |
| `cancelListing` | Custom | Cancel a marketplace listing |

## Testing

```bash
bun run test
```

Phases: **A** (YACI + Dolos + sync health) → **B** (Lock→Unlock→Claim in DB + API endpoints)


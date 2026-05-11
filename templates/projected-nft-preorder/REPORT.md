# Projected NFT Pre-Order — Catalyst Project Report

**Project**: [1000085 - Extend NFT sale & drop tools](https://milestones.projectcatalyst.io/projects/1000085)

## Overview

This template demonstrates the complete lifecycle of the Projected NFT (Hololocker) protocol integrated with Effectstream (formerly Paima Engine). It covers all six Catalyst milestones in a single, runnable Bun monorepo.

The Hololocker is a cross-chain NFT custody protocol that enables "projecting" NFTs into off-chain applications while maintaining provable on-chain ownership. Users lock NFTs at a Plutus script, the Effectstream sync engine detects these events via the built-in `CardanoProjectedNFT` primitive, and the application layer manages pre-order campaigns, contributions, and a marketplace.

---

## Milestone Mapping

### Milestone 1: Core Smart Contract

**Deliverable**: Hololocker Plutus V2 validator + deployment + simple UI

| Component | Location |
|-----------|----------|
| Aiken smart contract (compiled) | `packages/contracts-cardano/plutus.json` |
| Contract source (reference) | [projected-nft-whirlpool/cardano/validators/hololocker.ak](https://github.com/dcSpark/projected-nft-whirlpool) |
| Deployment script | `packages/contracts-cardano/submit-tx.ts` |
| Lucid transaction helpers | `packages/contracts-cardano/cardano-tx-helpers.ts` |
| YACI DevKit + Dolos setup | `packages/contracts-cardano/fill-template.ts` |
| Simple Lock/Unlock UI | `packages/frontend/client/src/pages/LockPage.tsx` |

**How to deploy**:
```bash
bun install
bun run dev   # Automatically deploys via YACI DevKit + runs Lock→Unlock→Claim
```

The Hololocker contract implements:
- **Lock**: Send NFT to script with inline datum `State { owner: PKH(hash), status: Locked }`
- **Request Unlock**: Consume locked UTXO, produce output with `Unlocking { out_ref, for_how_long }`
- **Claim**: After time-lock expires, spend the unlocking UTXO back to owner's wallet

### Milestone 2: Paima App with Core Stateful Functionality

**Deliverable**: Effectstream application with campaigns, contributions, ongoing views

| Component | Location |
|-----------|----------|
| Grammar definition | `packages/node/grammar.ts` |
| State machine (all transitions) | `packages/node/state-machine.ts` |
| Config with ProjectedNFT primitive | `packages/node/config.dev.ts` |
| Database schema | `packages/database/migrations/000-init.sql` |
| Typed queries | `packages/database/sql/queries.sql` |
| API routes | `packages/node/api.ts` |

**Features**:
- `createCampaign`: Create a pre-order campaign with target amount and optional NFT policy requirement
- `endCampaign`: End a campaign (creator-only)
- `contribute`: Contribute to a campaign (can require locked NFT proof)
- Real-time sync of Lock/Unlock/Claim events from Cardano via the `CardanoProjectedNFT` primitive
- API endpoints for querying all campaigns, contributions, and lock states

### Milestone 3: Fuller UI/UX

**Deliverable**: React frontend covering all core functionality

| Component | Location |
|-----------|----------|
| App shell with navigation | `packages/frontend/client/src/App.tsx` |
| Lock/Unlock page | `packages/frontend/client/src/pages/LockPage.tsx` |
| Campaigns page with progress bars | `packages/frontend/client/src/pages/CampaignsPage.tsx` |
| Marketplace + verification page | `packages/frontend/client/src/pages/MarketplacePage.tsx` |
| Fastify static server | `packages/frontend/server/main.ts` |

### Milestone 4: Extra Features

**Deliverable**: Wrapped smart contract support + NFT ownership verification

| Feature | Implementation |
|---------|---------------|
| Direct Cardano L1 wallet interaction | `packages/node/api.ts` — `/api/cardano/lock`, `/api/cardano/unlock`, `/api/cardano/claim` |
| NFT participation verification | `packages/node/api.ts` — `GET /api/verify/:policyId/:assetName` |
| Verification UI | `packages/frontend/client/src/pages/MarketplacePage.tsx` |

**Wrapped Smart Contract Support**: The Cardano Hololocker inherently supports direct L1 wallet interaction — users pay-to-script and spend-from-script directly from their Cardano wallets without going through an intermediate EVM contract. The API exposes endpoints for the complete Lock→Unlock→Claim lifecycle via direct Lucid transactions.

**NFT Verification**: The `/api/verify/:policyId/:assetName` endpoint checks whether an NFT has participated in any pre-order campaign by querying the contributions table. The frontend provides a verification form on the marketplace page.

### Milestone 5: Marketplace Integration

**Deliverable**: Marketplace for locked NFTs

| Component | Location |
|-----------|----------|
| Marketplace listings table | `packages/database/migrations/000-init.sql` |
| List/cancel actions | `packages/node/state-machine.ts` — `listOnMarketplace`, `cancelListing` |
| Marketplace API | `packages/node/api.ts` — `GET /api/marketplace` |
| Marketplace UI | `packages/frontend/client/src/pages/MarketplacePage.tsx` |

Users with locked NFTs can list them on the marketplace. Listings are application-level (tracked in the Effectstream database). The Hololocker's `Receipt` owner type enables transferable ownership of locked assets.

### Milestone 6: Project Close

**Deliverables**:

| Item | Location |
|------|----------|
| This report | `REPORT.md` |
| README with full documentation | `README.md` |
| Simple UI | `packages/frontend/` |
| E2E test suite | `packages/tests/` |
| All features from previous milestones | See above |

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cardano (YACI DevKit)                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Hololocker Plutus V2 Validator                  │   │
│  │  Lock → Unlocking → Claim lifecycle              │   │
│  │  Owner types: PKH | NFT | Receipt                │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ UTxORPC (Dolos gRPC)
                     ▼
┌─────────────────────────────────────────────────────────┐
│               Effectstream Sync Engine                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  CardanoProjectedNFT Primitive                   │   │
│  │  Parses inline datum, detects Lock/Unlock/Claim  │   │
│  │  Maintains IVM (materialized view of NFT state)  │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       ▼                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  State Machine                                   │   │
│  │  cardano-projected-nft → nft_locks table         │   │
│  │  createCampaign → campaigns table                │   │
│  │  contribute → contributions table                │   │
│  │  listOnMarketplace → marketplace_listings table  │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       ▼                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  PostgreSQL (PGLite in dev)                      │   │
│  │  nft_locks | campaigns | contributions |         │   │
│  │  marketplace_listings                            │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ REST API (port 9999)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                 React Frontend (Vite)                     │
│  Lock/Unlock NFTs | Campaigns | Marketplace | Verify    │
└─────────────────────────────────────────────────────────┘
```

---

## Running the Template

```bash
# Install dependencies
bun install

# Start full stack (dev mode)
bun run dev

# Run E2E tests
bun run test
```

The orchestrator boots: PGLite → YACI DevKit → Dolos → submit-tx (Lock→Unlock→Claim) → sync node → frontend.

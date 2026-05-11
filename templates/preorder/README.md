# Preorder Launchpad Template

Multi-chain preorder/launchpad system built with Effectstream. Supports EVM (native + ERC20) and Cardano ADA payments.

## Quick Start

```bash
bun install
bun run dev    # Starts: PGLite + Hardhat + YACI DevKit + Dolos + sync node + frontend
```

## Environments

| Component | Dev Tool | Port |
|-----------|----------|------|
| Database | PGLite | 5432 |
| EVM Chain | Hardhat | 8545 |
| Cardano Node | YACI DevKit | 10000 (admin), 3001 (node) |
| Cardano Indexer | Dolos | 50051 (gRPC), 3000 (Blockfrost) |
| Sync Node API | Effectstream Runtime | 9999 |
| Frontend | Vite + Fastify | 10599 |

## Testing

```bash
bun run test   # Runs 5-phase E2E test suite
```

Test phases:
- **A: Infrastructure** — EVM chain ready, Cardano DevKit + Dolos ready
- **B: STM / DB** — Native ETH purchase, ERC20 purchase, validation (supply limits, underpayment), Cardano ADA payment
- **C: API** — Launchpad list/detail, user data, participations, marketplace endpoints
- **D: Cross-chain** — EVM + Cardano data in same launchpad
- **E: Frontend** — Vite build smoke test

## Project Structure

```
templates/preorder/
├── start.dev.ts            # Orchestrator config
├── packages/
│   ├── contracts-evm/      # PaimaLaunchpad + Factory + MockERC20 (Hardhat + Ignition)
│   ├── contracts-cardano/  # YACI DevKit config, Dolos, Lucid Evolution helpers
│   ├── database/           # SQL migrations, pgtyped queries
│   ├── node/               # Sync node: grammar, primitives, config, STM, API
│   ├── frontend/           # React + Vite launchpad UI
│   └── tests/              # 5-phase E2E test suite
```

## Packages

| Package | Name | Purpose |
|---------|------|---------|
| `contracts-evm/` | `@preorder/contracts-evm` | Solidity contracts (UUPS launchpad + factory + MockERC20), Hardhat + Ignition |
| `contracts-cardano/` | `@preorder/contracts-cardano` | YACI DevKit, Dolos UTxORPC, Lucid Evolution wallet/tx helpers |
| `database/` | `@preorder/database` | SQL schema (4 tables), pgtyped queries, migration table |
| `node/` | `@preorder/node` | Effectstream sync node: custom BuyItemsPrimitive, STM validation, Fastify API |
| `frontend/` | `@preorder/frontend` | React UI: launchpad list, item browser, purchase flow |
| `tests/` | `@preorder/tests` | E2E test suite with assertSQL polling pattern |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/launchpads` | List all launchpads |
| GET | `/api/launchpad/:slug` | Launchpad detail with purchased counts |
| GET | `/api/userData/:slug?wallet=` | User stats + items |
| GET | `/api/participations/:slug?wallet=` | Participation history |
| GET | `/api/refunds/:slug?wallet=` | Refund-eligible participations |
| GET | `/api/cardano-payments/:slug` | Cardano ADA payment records |
| GET | `/api/marketplace/items/:slug` | Marketplace-formatted item metadata |
| GET | `/api/marketplace/ownership/:slug?wallet=` | Item ownership records |

## Smart Contract: BuyItems Event

The launchpad contract emits `BuyItems` for every purchase. The Effectstream sync node captures this via a custom `BuyItemsPrimitive` and runs backend validation (sale phase, supply limits, referral discounts, payment amounts).

```solidity
event BuyItems(
    address indexed receiver,
    address indexed buyer,
    address indexed paymentToken,
    uint256 amount,
    address referrer,
    uint256[] itemsIds,
    uint256[] itemsQuantities
);
```

## Cardano Integration

ADA payments are tracked via the built-in `CardanoTransfer` primitive, which watches a specific payment address using UTxORPC server-side filtering. Payments are recorded in `cardano_payments` and surfaced through the API.

## Marketplace Integration (M5)

The `/api/marketplace/*` endpoints provide structured item and ownership data for external marketplace partners:

- **`/api/marketplace/items/:slug`** — Item metadata, prices, supply, and current purchased counts
- **`/api/marketplace/ownership/:slug?wallet=`** — Per-wallet item ownership for a launchpad

Partners can poll these endpoints to sync item availability and ownership state.

## Catalyst Milestone Coverage

| Milestone | Deliverable |
|-----------|-------------|
| M1: NFT Presale/Preorder Tool | `contracts-evm/` + `node/state-machine.ts` |
| M2: Sale Exploration Module | `node/api.ts` + `frontend/` |
| M3: Multi-Currency Payment | Native ETH + ERC20 + Cardano ADA |
| M4: Extra Features (Cardano) | `contracts-cardano/` + CardanoTransfer primitive |
| M5: Marketplace Integration | `/api/marketplace/*` endpoints |
| M6: Open Source & Documentation | This README + full template source |

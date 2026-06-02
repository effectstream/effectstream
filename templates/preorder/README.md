# Preorder Launchpad Template

A multi-chain **presale / launchpad** built with Effectstream. Buyers preorder catalog items by paying on-chain (EVM: native ETH + an ERC-20; Cardano: ADA); the sync node turns those payments into queryable application state. All catalog/pricing config is written **on-chain** through an `EffectstreamL2` admin contract and applied deterministically by the state machine, so the system stays replayable.

## Prerequisites

- **[Bun](https://bun.sh)** ≥ 1.x (the monorepo runtime).
- **[Aiken](https://aiken-lang.org)** — only if you want to recompile the Cardano validator. The compiled `packages/contracts-cardano/plutus.json` is committed, so you don't need Aiken just to run the template.
  ```bash
  curl -sSfL https://install.aiken-lang.org | bash && aikup install v1.1.19
  ```
- **No Docker required.** YACI DevKit + Dolos (the Cardano devnet + indexer) run as local native binaries, downloaded on first use.

## Setup

```bash
cd templates/preorder
bun install            # installs all workspace packages
bun run dev            # boots the whole local stack (see below)
```

`bun run dev` starts the orchestrator, which brings up — in dependency order:

| Component                 | Tool                    | Port(s)                        |
|---------------------------|-------------------------|--------------------------------|
| Database                  | PGLite                  | 5432                           |
| EVM chain + deploy        | Hardhat + Ignition      | 8545                           |
| Cardano node + indexer    | YACI DevKit / Dolos     | 10000 (admin), 50051 (gRPC), 3000 (Blockfrost) |
| Cardano validator params  | `build-validator.ts`    | — (one-shot; computes the receipt policy id) |
| Sync node + API           | Effectstream runtime    | 9999                           |
| Campaign seed             | `seed-campaign.ts`      | — (one-shot create-campaign)   |
| Frontend                  | Vite + Fastify          | 10599                          |

When it's up, open **http://localhost:10599**.

> Re-running: the orchestrator owns the ports above. Stop a previous run (Ctrl-C, or kill the processes / free the ports) before `bun run dev` or `bun run test` again.

### Regenerating the Cardano validator (optional)

Only needed if you edit `packages/contracts-cardano/aiken/validators/launchpad_receipt.ak`:

```bash
cd packages/contracts-cardano/aiken
aiken check && aiken build
cp plutus.json ../plutus.json          # commit the compiled blueprint
```
`bun run dev` then re-applies its parameters (`validator:apply`) and recomputes the receipt policy id.

### Regenerating DB query types

After editing `packages/database/sql/queries.sql` or a migration, regenerate the pgtyped types (never hand-edit `*.queries.ts`):

```bash
bun run build:pgtypes
```

## Using it

- **Launchpad** (`/`): connect a wallet (EVM Local Dev Wallet, or Cardano Dev), pick a currency (ETH / USDC / ADA), add items, and buy. Purchases land in the unified `payments` ledger with a `valid`/`invalid` status and show under your wallet.
- **Admin console** (`/admin`): create/end the campaign, add/update products, and edit coin rates — every action is an on-chain `EffectstreamL2` command signed by the admin key (hardhat account #0), surfaced through a "Sign Transaction" modal. The page shows live status, the products list, contracts/wallets, and the payments table.
- **Referral links**: `?type=evm&ref=0xReferrer` or `?type=cardano&ref=<referrerKeyHash>`. `type` filters the wallet selector to that chain; `ref` is passed as the on-chain `referrer` (the referrer is paid `referrerRewardBps`, and the buyer can get a `referralDiscountBps` discount).

## Pricing model

Item prices are **unitless integers** `P` (think "≈ USD"). Each accepted coin has a rate `(x, n)` in `offchain_coins`, and the on-chain amount in that coin's smallest unit is exactly:

```
amount = P · x · 10^n          // pure integer/BigInt math — no float rounding
```

Seeded rates (1 unit ≈ 1 USD): `eth → x=5, n=14` · `usdc → x=1, n=6` · `ada → x=435, n=4`. Rates are updated on-chain via the EffectstreamL2 `set-coin` command (admin console → **Coins & rates**).

## Architecture

- **`packages/contracts-evm/`** — `PaimaLaunchpad` (UUPS, emits `BuyItems` + `ReferrerReward`) + factory + `MockERC20`, and the **`EffectstreamL2Contract`** admin inbox.
- **`packages/contracts-cardano/`** — an **Aiken minting-policy validator** that issues a purchase *receipt* only if the buyer signed, paid the price, was in the sale window, and (if referred) paid the referrer; plus YACI/Dolos/Lucid helpers (`buyItemsCardano`) and `build-validator.ts`.
- **`packages/database/`** — migrations + pgtyped queries: `offchain_campaigns/products/coins/curated_*` (deterministic config), `launchpad_*` (participations/users/items), `cardano_payments`, and the unified **`payments`** ledger.
- **`packages/node/`** — the sync node: grammar, the `BuyItemsPrimitive`, the builtin `EVM:EffectstreamL2` + `Utxorpc:Generic` primitives, the state machine (admin commands + buy validation against `P·x·10^n`, receiver filter, referral), and the Fastify API.
- **`packages/frontend/`** — React/Vite launchpad UI + admin console.
- **`packages/tests/`** — 5-phase E2E suite (`bun run test`).

### Deterministic config flow

Admin commands (`create-campaign` / `set-product` / `end-campaign` / `set-coin`) are submitted on-chain to `EffectstreamL2`, ingested by the builtin primitive, and authorized in the STM by checking the signer == admin. Because config changes are sequenced on-chain just like purchases, replay is deterministic. A new campaign = a new node deployment (1 campaign = 1 node = 2 contracts: the launchpad + the L2 inbox).

## Testing

```bash
bun run test     # 5-phase E2E suite (always stop a prior run first)
```

- **A: Infrastructure** — EVM deploy + mod, Cardano DevKit + Dolos ready, validator policy id, sync caught up.
- **B: STM / DB** — native ETH + ERC-20 purchases, validation (supply, underpayment), EVM revert negatives, Cardano receipt purchase (happy + on-chain underpay rejection).
- **C: API** — campaigns, launchpad detail, user data, marketplace.
- **D: Cross-chain** — EVM + Cardano in the same campaign.
- **E: Frontend** — Vite build + Playwright browser e2e.

> The Playwright browser test resolves `localhost` to IPv6 (`::1`) on macOS while the dev servers bind `127.0.0.1`, so it fails locally on macOS; it passes on Linux CI.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Contract addresses + admin + coins/rates |
| GET | `/api/launchpads` | List campaigns |
| GET | `/api/launchpad/:slug` | Campaign detail: items (unitless price + per-coin amounts), purchased counts, coins |
| GET | `/api/userData/:slug?wallet=` | User stats + owned items |
| GET | `/api/participations/:slug?wallet=` | Participation history |
| GET | `/api/refunds/:slug?wallet=` | Refund-eligible participations |
| GET | `/api/payments/:slug?wallet=&status=` | Unified payments ledger (EVM + Cardano) |
| GET | `/api/admin/status/:slug` | Full campaign status (config + products + payments + counts) |
| GET | `/api/cardano-payments/:slug` | Cardano ADA payment records |
| GET | `/api/marketplace/items/:slug` · `/api/marketplace/ownership/:slug?wallet=` | Marketplace integration |

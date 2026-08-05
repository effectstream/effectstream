---
title: "Preorder Launchpad"
description: "A multi-chain presale where one product catalog is sold for EVM ETH, an ERC-20, or Cardano ADA, and every payment lands in one order book."
sidebar_label: "Preorder Launchpad"
sidebar_position: 17
---

<!-- Generated from templates/preorder/README.md by docs/site/scripts/sync-template-readmes.ts. Do not edit directly. -->

> Template: **[`templates/preorder`](https://github.com/effectstream/effectstream/tree/main/templates/preorder)**

A launchpad has an awkward shape: the catalog and the order book are a single business object, but the money arrives on whatever chain the buyer already holds funds on. This template sells one catalog — items, supply limits, free-reward thresholds, referral terms — and accepts payment on two unrelated chains, an EVM chain (native ETH or an ERC-20) and Cardano (ADA). Both payment paths are validated against the same configuration and reconciled into a single `payments` ledger with a `valid` / `invalid` status and a machine-readable reason.

The catalog itself is not a constant in the source. Every campaign, product, coin rate and end-of-sale is written on-chain as an admin command through an `EffectstreamL2` contract and applied by the state machine, so a full replay from genesis reproduces both the configuration and the orders that were validated against it. Read this template when you are building commerce rather than a game: catalog config, price validation, refunds, referrals, and a post-sale NFT distribution that a batcher signs and pays for.

## What this template shows

**Two chains, one order book, no bridge.** The EVM side emits a `BuyItems` event from `PaimaLaunchpad`; the Cardano side mints a *purchase receipt* token under an Aiken minting policy in the same transaction that pays the launchpad address. Two different primitives ingest those two facts (`packages/node/primitives.ts` and the builtin `Utxorpc:Generic`), and two state transitions in `packages/node/state-machine.ts` write rows into the same `payments`, `launchpad_participations` and `launchpad_user_items` tables. Nothing bridges, nothing relays: the rollup is where the two chains meet.

**The trust model differs per chain, and the template is explicit about it.** On EVM the contract has already moved the funds when it emits the event, so the state machine only has to decide whether the payment covers the cart. On Cardano there is no contract holding the catalog, so the Aiken validator in `packages/contracts-cardano/aiken/validators/launchpad_receipt.ak` enforces buyer signature, sale window, payment to the launchpad address and the referrer's cut *atomically with the mint* — and the state machine then recomputes the price from config anyway (`defense in depth`, as the code comment puts it) before marking the payment valid.

**Prices are unitless integers; coins carry a rate.** An item's price `P` is a plain integer (≈ USD). Each accepted coin has `(x, n)` in `offchain_coins`, and the amount owed in that coin's smallest unit is exactly `P * x * 10^n` — pure `BigInt`, so ETH wei, USDC micro-units and lovelace all derive from one catalog number without floating-point drift. This is what makes "one catalog, many chains" tractable, and it is why the state machine can validate a Cardano payment with the same arithmetic it uses for an ERC-20 one.

**Configuration is an on-chain input, not a config file.** `adminGrammar` in `packages/node/grammar.ts` defines `create-campaign`, `set-product`, `end-campaign`, `set-coin` and `mint-nfts`. They are submitted to the `EffectstreamL2` contract, ingested by the builtin `EVM:EffectstreamL2` primitive, and authorized in the state machine by comparing the input's signer to the deployed admin address. Because config changes are sequenced on-chain alongside purchases, a replay applies them in the same order and reaches the same state.

**It is the repo's reference use of `genEvent` for custom typed events.** `packages/shared/app-events.ts` declares a `PreorderPlaced` event with indexed and body fields; the state machine emits it from both the EVM and Cardano transitions, and the frontend subscribes with a filter on `buyer` + `launchpad`. Delivery is post-commit, which makes the event — not the transaction submission — the correct trigger for refetching.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `@effectstream/sm` state machine (`Stm`) | `packages/node/state-machine.ts` | Eight transitions: five admin/config commands, `buy-items`, `referrer-reward` and `cardano-payment` |
| Custom `Primitive` subclasses | `packages/node/primitives.ts` | `BuyItemsPrimitive` and `ReferrerRewardPrimitive` decode the launchpad's two events into grammar payloads |
| `userDefinedPrimitives` registration | `packages/node/main.dev.ts` | Registers `EVM:BUY-ITEMS` and `EVM:REFERRER-REWARD` with the runtime |
| `PrimitiveTypeEVMEffectstreamL2` + `effectstreamL2Grammar` | `packages/node/config.dev.ts` | The admin/config inbox, parsed with `adminGrammar` |
| `PrimitiveTypeUtxorpcGeneric` with a predicate | `packages/node/config.dev.ts` | Matches only transactions minting the receipt policy id (`mints_asset`) |
| NTP main + two parallel sync protocols | `packages/node/config.dev.ts` | `mainNtp` orders the rollup; `parallelEvmRpc` and `parallelUtxoRpc` ingest each chain |
| `@effectstream/event-client` `genEvent` / `registerEvents` | `packages/shared/app-events.ts` | The custom `PreorderPlaced` event, emitted with `data.emit(...)` and consumed in the UI |
| `@effectstream/db` + pgtyped | `packages/database/` | Five migrations and the typed queries in `packages/database/sql/queries.sql` |
| Custom Fastify API router | `packages/node/api.ts` | 14 read endpoints over campaigns, users, payments, refunds, NFTs and the admin console |
| `@effectstream/batcher-sdk` — `EvmContractAdapter` | `packages/batcher/batcher.dev.ts` | Calls `PreorderItemNft.mint(to)` from the batcher's own funded account |
| `@effectstream/batcher-sdk` — custom adapter | `packages/batcher/cardano-mint-adapter.ts` | A minimal `BlockchainAdapter` that mints a Cardano item NFT with Lucid |
| Adapter decorator (`verifySignature` override) | `packages/batcher/trusted-adapter.ts` | Lets the batcher accept unsigned, node-originated internal jobs |
| Effection task alongside the runtime | `packages/node/nft-dispatch.ts` | Drains `nft_mints` into the batcher, spawned before `start()` |
| `@effectstream/orchestrator` launch helpers | `start.dev.ts` | `launchPglite`, `launchEvm`, `launchCardano` plus four template-specific processes |
| `@effectstream/evm-hardhat` | `packages/contracts-evm/` | Forge + Hardhat compile, Ignition deploy, generated TypeScript bindings |
| `@effectstream/wallets` | `packages/frontend/client/src/wallet/` | EVM and Cardano wallet connection in the browser |

## Quick start

Prerequisites beyond [Bun](https://bun.sh):

- **[Foundry](https://www.getfoundry.sh/)** — `launchEvm` checks for `forge` on PATH before starting anything and stops with an install message if it is missing.
  ```sh
  curl -L https://foundry.paradigm.xyz | bash && foundryup
  ```
- **[Aiken](https://aiken-lang.org) `v1.1.19`** — only needed to *recompile* the Cardano validator. The compiled blueprint `packages/contracts-cardano/plutus.json` is committed, and `packages/contracts-cardano/build-validator.ts` applies its parameters at startup, so a normal run needs no Aiken toolchain.

The Cardano devnet itself needs no manual setup: `packages/contracts-cardano` pulls YACI DevKit and Dolos in as npm dependencies and the orchestrator starts them (`devkit:start`, `dolos:start`).

```sh
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/preorder

bun install          # standalone; inside the monorepo run ./link.sh instead
bun run dev          # boots the whole local stack
```

`bun run dev` is `NODE_ENV=development bunx orchestrator start`, which reads `start.dev.ts` and brings processes up in dependency order: PGLite, Hardhat + contract deploy, YACI DevKit + Dolos, the `cardano-validator` step that computes the receipt policy id, the sync node, a one-shot `seed-campaign` that submits the initial `create-campaign` input, the NFT-mint batcher, and the frontend. Open the launchpad at [http://localhost:10599](http://localhost:10599) and the admin console at [http://localhost:10599/admin](http://localhost:10599/admin).

| Service | URL |
| --- | --- |
| Frontend (launchpad + `/admin`) | http://localhost:10599 |
| Sync node API | http://localhost:9999 |
| Batcher | http://localhost:3334 |
| Orchestrator API | http://localhost:4747 |
| Hardhat EVM | http://localhost:8545 |
| YACI DevKit admin API | http://localhost:10000 |
| YACI Cardano node | localhost:3001 |
| Dolos Blockfrost API | http://localhost:3000 |
| Dolos UTxORPC (gRPC) | http://localhost:50051 |
| cardano-submit-api | http://localhost:8090 |
| PGLite (Postgres) | `postgres://postgres:postgres@localhost:5432/postgres` |

The frontend server also proxies `/api/*` to the sync node and `/yaci/*` to the YACI admin API (`packages/frontend/server/main.ts`), so the browser only ever talks to port 10599.

Individual build steps:

```sh
bun run build:evm        # Forge + Hardhat compile, deploy, regenerate TS bindings
bun run build:pgtypes    # regenerate pgtyped types after editing packages/database/sql/queries.sql
```

To rebuild the Cardano validator after editing `packages/contracts-cardano/aiken/validators/launchpad_receipt.ak`, run `aiken check && aiken build` in `packages/contracts-cardano/aiken` and copy the produced `plutus.json` to `packages/contracts-cardano/plutus.json` — that file is what `packages/contracts-cardano/build-validator.ts` reads to recompute the policy id on the next `bun run dev`.

> The orchestrator owns every port above. Stop a previous run before starting `bun run dev` or `bun run test` again.

## Project structure

```
preorder/
├── start.dev.ts                                   # Orchestrator process graph for the local stack
├── link.sh                                        # Link monorepo sources into the template
├── CARDANO_CONTRACT.md                            # Walkthrough of the Aiken receipt validator design
└── packages/
    ├── node/                                      # @preorder/node — sync node
    │   ├── main.dev.ts                            #   Entry point; registers the custom primitives
    │   ├── config.dev.ts                          #   Networks, sync protocols, primitives
    │   ├── grammar.ts                             #   adminGrammar + buy/referral/cardano prefixes
    │   ├── primitives.ts                          #   BuyItemsPrimitive, ReferrerRewardPrimitive
    │   ├── state-machine.ts                       #   Admin commands + both purchase paths
    │   ├── api.ts                                 #   The read API
    │   ├── addresses.ts                           #   Deployed addresses from build/extra-addresses.json
    │   ├── cardano-receipt.ts                     #   Receipt policy id + applied script
    │   ├── decode-utxorpc-tx.ts                   #   Protobuf tx decoder for the generic primitive
    │   ├── launchpad-config.ts                    #   Types + the campaign used by the seed step
    │   ├── seed-campaign.ts                       #   One-shot create-campaign submission
    │   └── nft-dispatch.ts                        #   Drains nft_mints into the batcher
    ├── shared/app-events.ts                       # @preorder/shared — the PreorderPlaced event
    ├── database/                                  # @preorder/database
    │   ├── migrations/000-init.sql                #   Participations, user items, cardano_payments
    │   ├── migrations/001-config-and-payments.sql #   offchain_* config tables + payments ledger
    │   ├── migrations/002-coins.sql               #   offchain_coins + unitless price column
    │   ├── migrations/003-referral-rewards.sql    #   referral_rewards
    │   ├── migrations/004-nft-mints.sql           #   nft_mints + minted_nfts
    │   └── sql/queries.sql                        #   pgtyped query definitions
    ├── contracts-evm/                             # @preorder/contracts-evm
    │   ├── src/contracts/PaimaLaunchpad.sol       #   UUPS launchpad; emits BuyItems + ReferrerReward
    │   ├── src/contracts/PaimaLaunchpadFactory.sol
    │   ├── src/contracts/EffectstreamL2Contract.sol  # Admin/config inbox
    │   ├── src/contracts/PreorderItemNft.sol      #   Post-sale item NFT
    │   ├── src/contracts/MockERC20.sol            #   The dev "USDC"
    │   └── deploy.ts                              #   Deploy + write build/extra-addresses.json
    ├── contracts-cardano/                         # @preorder/contracts-cardano
    │   ├── aiken/validators/launchpad_receipt.ak  #   The receipt minting policy
    │   ├── plutus.json                            #   Committed compiled blueprint
    │   ├── build-validator.ts                     #   Applies params, writes the policy id
    │   ├── cardano-helpers.ts                     #   Lucid helpers incl. buyItemsCardano
    │   ├── constants.ts                           #   CARDANO_PAYMENT_ADDRESS
    │   ├── fill-template.ts                       #   Generates dolos.toml from devnet state
    │   └── submit-tx.ts                           #   Funds dev wallets from the YACI faucet
    ├── batcher/                                   # @preorder/batcher — post-sale NFT minting
    │   ├── batcher.dev.ts                         #   Two adapters: evmNft, cardanoNft
    │   ├── trusted-adapter.ts                     #   Accepts unsigned internal jobs
    │   └── cardano-mint-adapter.ts                #   Native-policy mint via Lucid
    ├── frontend/                                  # @preorder/frontend — React + Vite
    │   ├── client/src/pages/LaunchpadDetail.tsx   #   The storefront
    │   ├── client/src/pages/AdminPanel.tsx        #   Admin console (on-chain commands)
    │   ├── server/main.ts                         #   Fastify static server + API/YACI proxy
    │   └── e2e/app.spec.ts                        #   Playwright browser test
    └── tests/                                     # @preorder/tests — six-phase suite
```

## How it works

### Grammar

Three ingestion prefixes plus the admin command set, in `packages/node/grammar.ts`:

```ts
export const grammar = {
  "buy-items": buyItemsGrammar,
  "referrer-reward": referrerRewardGrammar,
  "cardano-payment": utxorpcGenericGrammar,
  ...adminGrammar,
} as const satisfies GrammarDefinition;
```

Complex payloads travel as JSON strings — `create-campaign` carries the whole campaign as `configJson`, and `buy-items` stringifies its item arrays — which keeps the grammar flat while still letting one command describe an entire catalog.

### Contracts

`PaimaLaunchpad` exposes `buyItemsNative` and `buyItemsErc20`, pays the referrer inline, and emits the event the node listens to:

```solidity
// packages/contracts-evm/src/contracts/PaimaLaunchpad.sol
emit BuyItems(receiver, msg.sender, address(0), msg.value, referrer, itemsIds, itemsQuantities);
```

`receiver` is the campaign's routing key and `msg.sender` is the buyer the node credits — the same contract can therefore serve several campaigns, and the state machine filters events by matching `receiver` against `offchain_campaigns.receiver`.

The Cardano purchase has no such contract, so the guarantees are pushed into the minting policy. `packages/contracts-cardano/aiken/validators/launchpad_receipt.ak` is parameterised with the launchpad's payment credential, the referrer reward in basis points, and the sale window, and mints exactly one receipt token whose asset name is the buyer's key hash:

```rust
// packages/contracts-cardano/aiken/validators/launchpad_receipt.ak
and {
  buyer_signed?,
  within_window?,
  paid_enough?,
  referral_ok?,
  mint_ok?,
}
```

`packages/contracts-cardano/build-validator.ts` applies those parameters with Lucid and writes `temp/receipt-policy-id.txt` and `temp/receipt-applied-script.txt`. Both the sync config and the state machine read the policy id from that file (`packages/node/cardano-receipt.ts`), and the applied script is served to the browser through `GET /api/config` so the frontend can build the same minting transaction.

### Sync configuration

`packages/node/config.dev.ts` declares an NTP main protocol plus one parallel protocol per chain, then four primitives. The Cardano one is the interesting declaration — a generic UTxORPC primitive narrowed by a predicate so the node only sees receipt mints:

```ts
.addPrimitive(
  (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
  () => ({
    name: "CardanoReceipt",
    type: PrimitiveTypeUtxorpcGeneric,
    startBlockHeight: 1,
    stateMachinePrefix: "cardano-payment",
    predicate: RECEIPT_POLICY_ID
      ? { match: { cardano: { mints_asset: { policy_id: RECEIPT_POLICY_ID } } } }
      : {},
  }),
)
```

The generic primitive forwards the raw protobuf transaction as `{ hash, bytes }`, so the state machine deserializes it itself with `decodeUtxorpcTx` (`packages/node/decode-utxorpc-tx.ts`, built on `@utxorpc/spec`), recovering outputs, native assets and transaction metadata.

### State machine

Admin commands are authorized by comparing the on-chain signer to the deployed admin address:

```ts
// packages/node/state-machine.ts
function isAdmin(data: BaseStfInput): boolean {
  const signer = String(data.signerAddress ?? "").toLowerCase();
  if (signer !== ADMIN_ADDRESS) {
    console.log(`[STM:admin] unauthorized signer=${signer} (admin=${ADMIN_ADDRESS})`);
    return false;
  }
  return true;
}
```

The price rule both purchase paths share is one line:

```ts
function coinAmount(price: bigint, coin: LoadedCoin): bigint {
  return price * coin.x * (10n ** BigInt(coin.n));
}
```

**The EVM path** (`buy-items`) resolves the campaign by `receiver`, loads the catalog and coins from the config tables, matches the coin by on-chain payment token address, then runs `validateItems`: array lengths, duplicate item ids, per-item supply (excluding the buyer's own prior purchases), the referral discount, the total cost against the buyer's cumulative contribution, and the spend threshold for free reward items. An event with no matching campaign still produces a `payments` row — with `status: "invalid"` and `reason: "no-active-campaign"` — so nothing is silently dropped.

**The Cardano path** (`cardano-payment`) decodes the transaction, finds the receipt token to recover the buyer's key hash, sums the lovelace paid to the campaign's payment address, and parses label-42 metadata for the item list, sender and referrer. It then recomputes the cost from config with the same `coinAmount` and marks the payment valid only if the on-chain payment covers it:

```ts
const participationValid = itemsValid && !!adaCoin && paidLovelace >= totalCostLovelace;
```

Both paths end the same way: `upsertUser`, `insertParticipation`, `insertPayment`, a rewrite of `launchpad_user_items` when valid, and an emitted `PreorderPlaced` event.

**Post-sale distribution** is a two-stage design. `mint-nfts` is an admin command that refuses to run unless the campaign is `ended`, and inserts one deterministic row per (campaign, chain, buyer, item) into `nft_mints`. The actual minting is *not* in the state machine — `packages/node/nft-dispatch.ts` runs as an effection task spawned before `start()`, polls for pending rows and POSTs each job to the batcher's `/send-input`, which holds the funds and signs. The dispatcher holds no keys, and the state machine stays deterministic.

### Events

`packages/shared/app-events.ts` is the template's custom event definition:

```ts
export const AppEvents = registerEvents({
  PreorderPlaced: genEvent({
    name: "PreorderPlaced",
    fields: [
      { name: "buyer", type: Type.String(), indexed: true },
      { name: "launchpad", type: Type.String(), indexed: true },
      { name: "itemIds", type: Type.Array(Type.Number()) },
      // ...
    ],
  }),
});
```

`blockHeight` is prepended automatically as the first indexed field. Indexed fields become the topic path, so the frontend can subscribe to exactly its own purchases on one launchpad and wildcard the block:

```ts
// packages/frontend/client/src/pages/LaunchpadDetail.tsx
EventManager.Instance.subscribe(
  {
    topic: AppEvents.PreorderPlaced,
    filter: {
      buyer: walletAddress.toLowerCase(),
      launchpad: data.address.toLowerCase(),
      blockHeight: undefined,
    },
  },
  (event: any) => { /* refetch /api/launchpad/:slug */ },
);
```

Because delivery is post-commit, the callback is the authoritative refresh trigger: a fetch made from it is guaranteed to see the rows the transition wrote. Refreshing on transaction submission instead is racy, and the comment in that file says so.

### Database

`packages/database/migrations/000-init.sql` holds the chain-derived participation tables (`launchpad_users`, `launchpad_participations`, `launchpad_user_items`, `cardano_payments`). `packages/database/migrations/001-config-and-payments.sql` adds the deterministic `offchain_*` config tables plus the unified ledger:

```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL DEFAULT '',
  chain TEXT NOT NULL, -- 'evm' | 'cardano'
  wallet TEXT NOT NULL,
  payment_token TEXT NOT NULL,
  amount TEXT NOT NULL,
  ...
  status TEXT NOT NULL, -- 'valid' | 'invalid'
  reason TEXT NOT NULL DEFAULT ''
);
```

`packages/database/migrations/002-coins.sql` introduces `offchain_coins` and seeds the three rates used in dev — `eth: x=5, n=14` (wei), `usdc: x=1, n=6` (micro-USDC), `ada: x=435, n=4` (lovelace) — and replaces the old per-token price table with the single unitless `price` column on `offchain_products`.

### API

`packages/node/api.ts` registers the read side. Everything is derived from the tables above; there is no write endpoint, because every mutation is an on-chain input.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/config` | Contract addresses, admin, chain id, receipt policy id + applied script, coins |
| GET | `/api/launchpads` | All campaigns |
| GET | `/api/launchpad/:slug` | Campaign detail: items, per-coin amounts, purchased counts |
| GET | `/api/first-block` | NTP epoch recovered from `effectstream.sync_protocol_pagination` |
| GET | `/api/userData/:slug` | A wallet's totals and owned items |
| GET | `/api/participations/:slug` | Participation history |
| GET | `/api/refunds/:slug` | Refund-eligible participations |
| GET | `/api/payments/:slug` | The unified ledger, filterable by wallet or status |
| GET | `/api/cardano-payments/:slug` | Raw Cardano payment records |
| GET | `/api/nfts/:slug` | Minted NFTs |
| GET | `/api/admin/status/:slug` | Campaign status, products, payments, referrals |
| GET | `/api/admin/mint-preview/:slug` | What `mint-nfts` would enqueue |
| GET | `/api/marketplace/items/:slug` | Marketplace item view |
| GET | `/api/marketplace/ownership/:slug` | Marketplace ownership view |

## Configuration

The template targets the local stack only; there is no mainnet entry point. Everything is defaulted, and each variable below is read directly by the file named.

| Variable | Default | Where | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | set by `bun run dev` | `package.json` | Must be `development` for the orchestrator to use `start.dev.ts` |
| `PGLITE` | `true` for the sync process | `start.dev.ts` | `false` uses an external Postgres instead of embedded PGLite |
| `EVM_RPC` | `http://localhost:8545` | `packages/node/nft-dispatch.ts`, `packages/batcher/batcher.dev.ts`, `packages/node/seed-campaign.ts` | EVM RPC endpoint |
| `EVM_PRIVATE_KEY` | Hardhat account #9 | `packages/batcher/batcher.dev.ts` | Signs the batcher's NFT mints, kept apart from the admin account to avoid nonce contention |
| `BATCHER_PORT` | `3334` | `packages/batcher/batcher.dev.ts` | Batcher HTTP port |
| `BATCHER_URL` | `http://localhost:3334` | `packages/node/nft-dispatch.ts` | Where mint jobs are POSTed |
| `EFFECTSTREAM_API_PORT` | `9999` | runtime (`@effectstream/utils` ENV), `packages/tests/run-tests.ts` | Sync node HTTP API port |
| `VITE_API_URL` / `YACI_URL` | `http://localhost:9999` / `http://localhost:10000` | `packages/frontend/server/main.ts` | Proxy upstreams |

Campaign parameters are *not* environment variables. The dev campaign lives in `seedCampaignConfig` (`packages/node/launchpad-config.ts`) and is submitted once by `packages/node/seed-campaign.ts`; after that, the admin console at `/admin` issues `set-product`, `set-coin` and `end-campaign` as on-chain commands. Pointing the template at a different campaign means deploying a new node: one campaign, one node, two contracts (the launchpad and the L2 inbox). The Cardano validator's sale window and referrer basis points are compile-time parameters in `packages/contracts-cardano/build-validator.ts` (`SALE_START`, `SALE_END`, `REFERRER_REWARD_BPS`) and must match the campaign's EVM terms.

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` starts the orchestrator against `packages/tests/start.test.ts`, waits for the EVM deploy, the Cardano transaction submitter, sync-node health and — importantly — for the sync node to catch up to the EVM chain tip and for the seeded campaign to appear, then runs six phases and shuts the stack down. File names below are relative to `packages/tests/`.

| Phase | Files | Covers |
| --- | --- | --- |
| A — Infrastructure | `infra/evm-ready.test.ts`, `infra/cardano-ready.test.ts` | Hardhat and the deployed contracts, YACI + Dolos, sync caught up |
| B — STM / DB | `stm/buy-items-native.test.ts`, `stm/buy-items-erc20.test.ts`, `stm/validation.test.ts`, `stm/evm-negative.test.ts`, `stm/referral-evm.test.ts`, `stm/cardano-payment.test.ts`, `stm/cardano-receipt-purchase.test.ts` | Both EVM payment methods, supply and underpayment rejection, EVM reverts, referrals, and the Cardano receipt purchase including on-chain rejection of an underpayment |
| C — API | `api/launchpads.test.ts`, `api/user-data.test.ts`, `api/marketplace.test.ts` | The read endpoints |
| D — Cross-chain | `cross-chain/multi-payment.test.ts` | EVM and Cardano payments in the same campaign |
| E — Frontend | `frontend/build-smoke.test.ts`, `frontend/e2e.test.ts` | Vite build and the Playwright browser run |
| F — Admin minting | `stm/admin-mint.test.ts` | `end-campaign` + `mint-nfts`, dispatched through the batcher — deliberately last, since it ends the campaign |

## Where to go next

- [Primitives](https://effectstream.io/home/components/primitives) — how `Primitive` subclasses and the builtin generic primitives turn chain events into state-machine inputs
- [Cardano integration](https://effectstream.io/home/chains/cardano) — UTxORPC sync, predicates, and the local YACI + Dolos stack
- [The L2 contract](https://effectstream.io/home/components/l2-contract) — the `EffectstreamL2` inbox used here for deterministic admin config
- [`@effectstream/event-client`](https://effectstream.io/home/packages/sdk/event-client) — `genEvent`, indexed fields and subscription filters
- [Batcher adapters](https://effectstream.io/home/components/batcher/adapter) — the `BlockchainAdapter` interface behind `TrustedAdapter` and `CardanoMintAdapter`
- Sibling templates: [`evm-cardano`](https://github.com/effectstream/effectstream/tree/main/templates/evm-cardano) for the same two chains without the commerce layer, [`projected-nft-preorder`](https://github.com/effectstream/effectstream/tree/main/templates/projected-nft-preorder) for a Cardano-native preorder, and [`batcher-validations`](https://github.com/effectstream/effectstream/tree/main/templates/batcher-validations) for gating inputs before they are batched

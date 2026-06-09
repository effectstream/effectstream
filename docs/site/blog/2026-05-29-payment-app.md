---
slug: payment-app
title: "Card Payments for On-Chain Games: The Effectstream payment-app Template"
authors: [effectstream]
tags: [payments, fiat-onramp, transak, game-monetization, cardano, evm]
---

![The Effectstream payment-app store: an in-game item catalogue with a wallet-or-fiat checkout](/img/blog/payment-app-hero.png)

A fiat-to-crypto payment rail lets a player buy an in-game item with a card — no wallet to install, no tokens to acquire first, no bridge to cross — while the purchase still settles on-chain as verifiable ownership. [Effectstream payment-app](https://github.com/effectstream/payment-app) is a small but complete template that wires one of these rails (Transak) into an Effectstream app: a fiat-or-crypto in-game item store backed by an on-chain contract and an off-chain indexer. This post introduces the technology, explains what it unlocks and why we built it, and then walks through how the repo is wired — the short version of the latter being that almost all your work lives in three small files inside the node.

<!-- truncate -->

## What new use-cases does fiat-to-crypto payment integration enable?

The single biggest drop-off in on-chain games is the wallet wall: a new player is asked to install a wallet, fund it from an exchange, and maybe bridge to the right chain — all before they have bought anything. Most mainstream players leave at that step. A fiat rail removes the wall.

Concretely, this template makes the following possible:

- **Card-funded item stores, season passes, and consumables.** A player who has never touched crypto taps *Buy*, pays with a card through the Transak widget, and the item lands in their inventory once the on-chain transaction confirms. Pricing and checkout are in fiat; ownership and settlement stay on-chain and auditable.
- **First-purchase onboarding.** The fiat checkout can double as the player's entry into the chain — the purchase flow provisions on-chain state on their behalf, so "buying my first item" and "getting on-chain" become one action instead of two unrelated chores.
- **Mixed economies, one input.** Crypto-native players sign directly with their own wallet; newcomers pay by card. Both paths converge on the *same* on-chain submission, so the game logic never has to know — or care — how a given purchase was funded. A studio gets both audiences without maintaining two economies.
- **Rail-agnostic monetization.** The fiat rail is just one boundary in the app. Transak is wired today; the proposal also named Mirror World, and any onramp optimized for gaming plugs in at the same point without touching game logic. Studios are not locked to a single payment provider.

The net effect: the on-chain part of a game stops being a barrier to entry and becomes an implementation detail the player never has to think about.

## Why did we prioritize payment rails?

We prioritized payment rails because payment friction — not throughput, not tooling, not contract complexity — is what keeps on-chain games from reaching a mainstream audience. The engine side of that problem is already mature: Effectstream gives you a deterministic state machine and a chain indexer out of the box. The missing piece for adoption was letting people pay the way they already pay everywhere else.

Three reasons it rose to the top of the list:

1. **It is the highest-leverage onboarding fix available.** Every other improvement (faster sync, cleaner grammars, better templates) helps developers; a fiat rail helps the *player who has never used crypto*, which is the population that actually limits a game's reach.
2. **The integration risk was low and the partners were willing.** Mirror World and Transak both build payment rails specifically optimized for gaming and signalled willingness to support our requirements, so we could ship a real end-to-end flow rather than a proof of concept.
3. **It is a reusable primitive, not a one-off.** Once one Effectstream template proves the fiat-purchase path, every other template in the ecosystem inherits the pattern. This milestone completes the *buy* half of the loop that the rest of this Catalyst project builds out (wallets, game templates, achievements, NFTs).

## A Cardano-rooted, multi-chain template

This is, first and foremost, a Cardano deliverable. Effectstream is a Cardano-rooted multi-chain engine, and the template's app logic carries zero chain-specific code: the `purchaseItem` grammar, the state-machine transition, the `user_items` table, and the `/api/items` endpoint are all chain-neutral. Retargeting the template at Cardano (or Midnight, Bitcoin, Avail, Celestia, NEAR) is a config + contract-package change, not an app-logic change — you swap the contract package, point the config at that chain's network and grammar, choose the matching batcher adapter, and the three node files stay untouched. On the wallet side it is compatible with the standard Cardano browser-wallet ecosystem (Lace, Eternl, Nami, NuFi, and others).

The concrete build in this post wires the fiat rail on an EVM testnet because Transak settles fiat onto EVM chains today; a Cardano build pairs the identical app logic with a Cardano-appropriate payment rail. The point of the template is that the payment integration is a thin, swappable boundary — the durable, reusable work is everything around it, and that part is the same regardless of which chain settles the purchase.

## The five moving pieces

Concretely, the running system is:

1. **`PaymentEffectstreamL2`**, a Solidity contract at [packages/contracts-evm/src/contracts/PaymentEffectstreamL2.sol](https://github.com/effectstream/payment-app/tree/main/packages/contracts-evm/src/contracts/PaymentEffectstreamL2.sol). It extends `EffectstreamL2Contract` and adds *zero* custom logic. There are no item prices on-chain, no allow-lists, no per-item checks. It's the base contract, deployed.
2. **The batcher** at [packages/batcher/batcher.dev.ts](https://github.com/effectstream/payment-app/tree/main/packages/batcher/batcher.dev.ts), using `@effectstream/batcher`. It collects signed inputs from wallet-connected users and submits them on a tight cadence (~1000ms).
3. **The effectstream node** in [packages/node/](https://github.com/effectstream/payment-app/tree/main/packages/node/) — the focus of this post.
4. **Postgres**, with a single table defined in [packages/database/migrations/000-init.sql](https://github.com/effectstream/payment-app/tree/main/packages/database/migrations/000-init.sql): `user_items(wallet, item_id, amount)` — the entire schema.
5. **A React frontend** that talks to the node's REST API, never to the chain or Postgres directly.

Three environments share this code:

| Env | EVM | Database | Entry point |
| --- | --- | --- | --- |
| `dev` | Hardhat | PGLite (in-process) | [packages/node/main.dev.ts](https://github.com/effectstream/payment-app/tree/main/packages/node/main.dev.ts) |
| `staging` | Ethereum Sepolia | Local Postgres | [packages/node/main.staging.ts](https://github.com/effectstream/payment-app/tree/main/packages/node/main.staging.ts) |
| `mainnet`* | Arbitrum Sepolia | Managed Postgres | [packages/node/main.mainnet.ts](https://github.com/effectstream/payment-app/tree/main/packages/node/main.mainnet.ts) |

\* The real `mainnet` chain hasn't been finalized yet. The table lists Arbitrum Sepolia because that's the placeholder the code and frontend currently use (chain id `421614`); the actual target chain is still an open decision. Transak doesn't constrain it — it supports any EVM chain — so whatever you deploy the contract to, you just point `TRANSAK_NETWORK` at the matching network.

A top-level orchestrator (`start.dev.ts`, `start.staging.ts`, `start.mainnet.ts`) boots the right combination of services for each env. Locally that means PGLite + Hardhat + node + batcher + frontend in one process; in production only the node and the batcher need to run.

## Two payment paths, one input

The frontend can route a purchase two ways:

- **Wallet path.** The user signs a transaction directly using `@effectstream/wallets`. The signed input goes to the local batcher, which packs it into a batched submission to the contract. This is the default path in dev and the natural path for users who already hold crypto.
- **Transak path.** The user opens a Transak widget and pays with a card. Transak's relayer is the one that ultimately submits the on-chain transaction. The widget URL has to be signed with Transak's API secret, which can't live in the browser — so the node exposes `POST /api/transak/widget-url` and the frontend asks for a fresh signed URL on demand.

Both paths converge on the same calldata: `effectstreamSubmitGameInput(["purchaseItem", itemId, amount])`. The contract doesn't know — or care — which path it came from. From the indexer's point of view, the two flows are identical once the event hits the log.

## What the node actually contains

If you cloned the repo right now and opened `packages/node/`, you'd find a surprisingly small surface. Three files do almost all of the work.

### `grammar.ts` — the app's vocabulary

[packages/node/grammar.ts](https://github.com/effectstream/payment-app/tree/main/packages/node/grammar.ts) defines the entire set of valid inputs this app understands. There is exactly one:

```
purchaseItem(itemId: 1..18, amount: 1..1000)
```

The TypeBox schema bounds `itemId` to the 18 items currently in the store and caps `amount` at 1000 per call. The grammar gets reused in three places: the contract uses it to validate calldata, the frontend uses it to construct inputs, and the node uses it to parse events back into typed values. One schema, three consumers, no drift.

### `state-machine.ts` — the entire business logic

[packages/node/state-machine.ts](https://github.com/effectstream/payment-app/tree/main/packages/node/state-machine.ts) is the only place where game rules live, and the rules are about as simple as they get:

```ts
stm.addStateTransition("purchaseItem", function* (data) {
  const wallet = data.signerAddress.toLowerCase();
  const { itemId, amount } = data.parsedInput;
  yield* World.resolve(upsertUserItem, { wallet, item_id: itemId, amount });
});
```

When a confirmed `purchaseItem` event arrives, lowercase the signer address, pull the typed fields out of the parsed input, and upsert a row into `user_items`. There's no balance check, no debit, no "did this user actually pay" branch. The transition runs *only* on confirmed inputs from the chain, so the question of "did this purchase happen" is already settled by the time the state machine sees it. The node's job here is purely to project chain state into a relational shape that the frontend can query cheaply.

This is also where adding a new action would happen. Want refunds? Add a `refundItem` entry to the grammar, add a transition here that decrements the row. The contract doesn't change. The frontend gets a new input it can submit. That's the whole development loop for new app behavior.

### `api.ts` — the only thing the frontend talks to

[packages/node/api.ts](https://github.com/effectstream/payment-app/tree/main/packages/node/api.ts) is a Fastify server with three endpoints:

- `GET /api/items?wallet=0x…` — returns the user's inventory as a flat array of `{wallet, item_id, amount}` rows. The frontend polls this to update the *Owned: N* badges.
- `GET /api/health` — a liveness check used by the orchestrator and any deploy probes.
- `POST /api/transak/widget-url` — server-signed Transak widget URL, described above. This is the only endpoint that exists because of an external integration constraint rather than because of the app's own logic.

There is deliberately no "submit purchase" endpoint on the node. Submissions go to the chain via the batcher or via Transak's relayer. The node is read-only from the frontend's perspective, with the single exception of the Transak URL signer — which itself isn't writing app state, just minting an opaque token.

## Why the implementation is shaped this way

A few specific decisions are worth calling out:

**The contract is empty on purpose.** `PaymentEffectstreamL2.sol` adds nothing to the base. All meaning lives off-chain in the grammar and state machine. That means changing game rules doesn't require a contract upgrade, an audit, or a migration — it's a pull request against `state-machine.ts`.

**Inventory is a projection, not a source of truth.** Postgres is rebuildable. If you blew away the database and re-synced from block zero, you'd get the same `user_items` table back. That's a useful invariant: it means the node can be redeployed, reindexed, or replaced without any data-migration drama.

**The grammar is tiny and stays tiny.** One input type for the entire app. This isn't a limitation — it's a design statement. Effectstream apps tend to land well when each grammar entry corresponds to a single, well-defined user intent, and "buy an item" is one intent. Resist the urge to overload it.

## Watch a card-to-crypto purchase

The clip below walks through the full flow on a testnet deployment: a player buys an item in the store with a credit card through Transak, the Effectstream sync engine confirms the purchase on-chain, and the item lands in their inventory. The build runs on an EVM testnet here, but the template is multi-chain and Cardano-compatible — the wallet on screen is just one of the supported options.

<iframe width="100%" height="415" src="https://www.youtube.com/embed/64fY35Sgu6E" title="payment-app: buying an in-game item with a credit card via Transak" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>

## The shape of the whole thing

End-to-end, a single purchase looks like this:

1. Frontend calls `purchase.ts`, which either signs via `@effectstream/wallets` or asks the node for a Transak URL and opens the widget.
2. The contract receives `effectstreamSubmitGameInput(["purchaseItem", itemId, 1])` — from the batcher or from Transak's relayer — and emits an event.
3. The node, polling the RPC every 500ms, picks up the event after confirmation, parses it through the grammar, and runs the `purchaseItem` transition.
4. Postgres gets a new row in `user_items`.
5. The frontend's next `GET /api/items` poll picks it up and the UI updates.

That's the whole app. Five moving pieces, three small files of node logic, one Postgres table, and a contract that does the minimum work required to give you an immutable, ordered log to index against. If you're using this repo as a template for your own Effectstream app, those three files are where almost all of your work will happen.

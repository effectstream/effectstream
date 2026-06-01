# Inside payment-app: How This Effectstream App Is Wired

[Effectstream payment-app](https://github.com/effectstream/payment-app) is a small but complete example of an Effectstream application: a fiat-or-crypto in-game item store backed by an on-chain contract and an off-chain indexer. This post is for anyone using the repo as a template — or just curious how the pieces fit. The short version: almost all your work lives in three small files inside the node. The rest of this post explains why.

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

## The shape of the whole thing

End-to-end, a single purchase looks like this:

1. Frontend calls `purchase.ts`, which either signs via `@effectstream/wallets` or asks the node for a Transak URL and opens the widget.
2. The contract receives `effectstreamSubmitGameInput(["purchaseItem", itemId, 1])` — from the batcher or from Transak's relayer — and emits an event.
3. The node, polling the RPC every 500ms, picks up the event after confirmation, parses it through the grammar, and runs the `purchaseItem` transition.
4. Postgres gets a new row in `user_items`.
5. The frontend's next `GET /api/items` poll picks it up and the UI updates.

That's the whole app. Five moving pieces, three small files of node logic, one Postgres table, and a contract that does the minimum work required to give you an immutable, ordered log to index against. If you're using this repo as a template for your own Effectstream app, those three files are where almost all of your work will happen.

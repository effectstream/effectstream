# Night Bitcoin — Intent-Based Cross-Chain Swaps

> Trustless BTC ↔ Midnight swaps with no bridge: users publish ERC-7683 intents, competing fillers settle both legs, and the node arbitrates.

Bridges are the standard way to move value between chains, and they are also the
standard way to lose it: a bridge is a contract holding both sides' funds, and its
security is the security of whoever controls it. This template shows the alternative.
A user publishes an *intent* — a declaration of what they will give and what they want
— to an [ERC-7683](https://eips.ethereum.org/EIPS/eip-7683) contract on Midnight. A
market of competing **fillers** (solvers) quotes the trade, and the winner delivers the
counter-asset out of its own inventory. No pooled custody, no wrapped assets, no
canonical bridge contract.

What makes that safe is the arbiter. An Effectstream node syncs Bitcoin and Midnight
into one ordered stream, records the intent and the payment as they land, and
only pairs them once both are on-chain. If you are building anything that has to settle
against two chains that cannot talk to each other — swaps, cross-chain payments,
solver networks — this is the pattern to copy.

![The dApp](./docs/ui.png)

## What this template shows

**The intent/filler model, and why it needs no bridge.** A swap here is three
independent facts, each observable on its own chain:

1. The user's intent, written to the ERC-7683 contract on Midnight
   (`packages/contracts-midnight/erc7683/src/erc7683.compact`).
2. The user's payment — BTC to a watched address, or an M20 unshielded UTXO spend on
   Midnight.
3. The filler's payout to the user, submitted through the filler's own batcher.

Nobody holds a shared pool. The user pays, the filler pays, and the only thing that
connects the two is a node that has *independently indexed both chains* and can
therefore assert "the payment for this order id exists". A filler that takes a payment
without delivering is simply never credited; a user who declares an intent and never
pays never triggers a payout. The trust assumption shrinks from "the bridge is honest"
to "the indexed chain state is what it says it is".

**Where the filler lives.** `packages/filler/index.ts` is one filler process. The
orchestrator launches three of them (`Alpha Liquidity`, `Omega Swap`, `Quantum Pools`
— see `fillerDefinitions` in `start.dev.ts`), each with its own port and its own
Bitcoin + Midnight wallets, so the local stack behaves like a competitive market rather
than a single privileged relayer. Each filler is an *active agent*, not a price feed:
it embeds its own `@effectstream/batcher-sdk` batcher with a `BitcoinAdapter` and a
`MidnightAdapter`, so when it wins an order it signs and submits the payout itself.

```ts
// packages/filler/index.ts
server.post("/api/quote", async (request, reply) => {
  const { orderId, fromToken, toToken, fromAmount } = request.body;

  const basisPoints = 10; // 0.01% * 10 = 0.1% => 10 basis points
  const conversionRate = getConversion(fromAmount, fromToken, toToken);
  const fee = (basisPoints * conversionRate) / 10000;
  ...
```

**Two ways of observing a payment.** BTC arrives as a transaction to a watched address,
picked up by `PrimitiveTypeBitcoinAddress`. M20 does *not* arrive as a contract event —
the user's transfer goes through the balancing batcher as a native unshielded UTXO
move, which fires no contract state change at all. The template therefore also runs
`PrimitiveTypeMidnightUnshieldedSpend`, which observes raw unshielded spends on
Midnight's ledger, and synthesises a matching `transfers` row. Both paths converge on
the same `checkAndTransferFunds` matcher in `packages/node/state-machine.ts`.

> This is a demo settlement, deliberately simplified. `erc7683.compact` defines
> `validate_initialize`, `resolve` and `validate_resolve` circuits, but the flow here
> only calls `initialize`: the state machine plays escrow-and-arbiter and drives the
> payout directly. A production build would have the filler call `resolve` and the node
> act purely as the settler.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `@effectstream/sm` state machine | `packages/node/state-machine.ts` | Matching intents to payments and driving settlement |
| Grammar (`@effectstream/concise`, `builtinGrammars`) | `packages/node/grammar.ts` | Typed inputs for the four primitives |
| NTP main sync protocol (`ConfigSyncProtocolType.NTP_MAIN`) | `packages/node/config.dev.ts` | A single ordered timeline for two chains that share no clock |
| Midnight contract state via `PrimitiveTypeMidnightGeneric` | `packages/node/config.dev.ts` | Reading the ERC-7683 and M20 ledgers |
| Midnight unshielded spends via `PrimitiveTypeMidnightUnshieldedSpend` | `packages/node/config.dev.ts` | Observing native UTXO moves that fire no contract event |
| Bitcoin RPC sync via `PrimitiveTypeBitcoinAddress` | `packages/node/config.dev.ts` | Watching the system deposit address on regtest |
| Custom API routes (`StartConfigApiRouter`) | `packages/node/api.ts` | Quote fan-out, intent lookup, readiness, dev faucet |
| Batcher `MidnightBalancingAdapter` (`@effectstream/batcher-sdk`) | `packages/batcher/batcher.dev.ts` | Fee-sponsored ("dust-free") Midnight transfers for users |
| Batcher `BitcoinAdapter` + `MidnightAdapter` | `packages/filler/index.ts` | Each filler submits its own payouts on either chain |
| Migrations + pgtyped queries (`@effectstream/db`) | `packages/database/` | The `intents` / `transfers` / `quotes` clearinghouse |
| Wallet connect (`@effectstream/wallets`) | `packages/frontend/client/src/interface.ts` | Midnight (Lace) login for signing intents |
| Orchestrator (`@effectstream/orchestrator`) | `start.dev.ts` | Bringing up both chains, three fillers, batcher and frontend |

## Quick start

**Prerequisites**

- [Bun](https://bun.sh).
- The **Compact compiler**, on your `PATH`. The contract packages compile with
  `compact compile +0.33.0-rc.2` (see `packages/contracts-midnight/erc7683/package.json`),
  so install the toolchain and pin that release:

  ```sh
  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  compact update 0.33.0-rc.2
  ```

- `openssl`, used by the indexer launch script to generate a secret.
- A **Midnight wallet that supports the `undeployed` network** (Lace Midnight preview)
  to sign intents in the dApp.
- No Docker, and no manually installed chain binaries: Bitcoin Core and the Midnight
  node, indexer and proof server are pulled in as npm packages
  (`@effectstream/bitcoin-core`, `@effectstream/npm-midnight-node`,
  `@effectstream/npm-midnight-indexer`, `@effectstream/npm-midnight-proof-server`).

**Run it**

```sh
bun i
bun run dev
```

> [!NOTE]
> The first `bun run dev` compiles the two Compact contracts before anything else can
> start, which takes several minutes with no visible progress. That is not a hang —
> watch the `midnight-contract` process in the orchestrator output.

![Orchestrator output](./docs/terminal.png)

Once the `sync` process is up, open <http://localhost:10599>.

| Service | URL |
| --- | --- |
| Frontend (dApp) | http://localhost:10599 |
| Sync node HTTP API | http://localhost:9999 |
| Balancing batcher | http://localhost:3334 |
| Filler — Alpha Liquidity | http://localhost:16101 |
| Filler — Omega Swap | http://localhost:16102 |
| Filler — Quantum Pools | http://localhost:16103 |
| Orchestrator API | http://localhost:4747 |
| Midnight node RPC | http://127.0.0.1:9944 |
| Midnight indexer | http://127.0.0.1:8088 |
| Midnight proof server | http://127.0.0.1:6300 |
| Bitcoin Core RPC (regtest) | http://127.0.0.1:18443 |
| PGlite (Postgres) | `localhost:5432` |

Other scripts:

```sh
bun run test             # full test suite (boots its own stack)
bun run build:midnight   # compile the Compact contracts only
bun run build:pgtypes    # regenerate pgtyped query types
bun run start:frontend   # Vite dev server for the frontend alone
bun run start:mainnet    # packages/node/main.mainnet.ts (see Configuration)
```

When working inside the Effectstream monorepo, run `./link.sh` instead of `bun i` — it
installs dependencies and then symlinks every `@effectstream/*` package to its local
source.

## Project structure

```
packages/
  batcher/               Balancing batcher — MidnightBalancingAdapter on :3334
  contracts-bitcoin/     Regtest helpers: wallet creation, faucet, transfers, block waits
  contracts-midnight/    Midnight node/indexer/proof-server scripts and contract deployment
    erc7683/             ERC-7683 intent contract (Compact source + generated bindings)
    unshielded-erc20/    "M20" unshielded fungible token (Compact source + bindings)
    indexer-standalone/  Standalone indexer config
  database/              000-init.sql migration and pgtyped queries
  filler/                One solver process: quote API, payout webhook, embedded batcher
  frontend/              React dApp (client/) served by a Fastify static server (server/)
  node/                  Sync node: config, grammar, state machine, API
  tests/                 infra / stm / frontend test phases
```

## How it works

A BTC → M20 swap, end to end:

1. **Quote.** The dApp posts to `POST /api/get-quotes` on the sync node. That route
   fans the request out to all three fillers' `POST /api/quote` endpoints, writes every
   returned quote to the `quotes` table, and hands the array back. The user picks one.
2. **Intent declared.** The dApp calls `initialize` on the ERC-7683 contract via the
   user's Midnight wallet (`packages/frontend/client/src/contracts/intents.ts`),
   recording `maxSpent_*` (what the user gives), `minReceived_*` (what they want), the
   deadlines, and the chain ids. Nothing has moved yet.
3. **Payment.** The user sends BTC to the watched system address
   `bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03`. (In the M20 → BTC direction, the
   dApp instead calls `m20_transferFrom`, routed through the balancing batcher so the
   user pays no Midnight fees.)
4. **Both chains observed.** `parallelMidnight` picks up the contract state change and
   `parallelBitcoin` picks up the transaction; both are ordered onto the `mainNtp`
   timeline. The state machine writes an `intents` row and a `transfers` row.
5. **Match.** Whichever arrives second triggers `checkAndTransferFunds`, which looks up
   the counterpart by order id / amount / token / chain id. If either half is missing,
   it logs and returns — a half-finished swap is simply not settled.
6. **Filler picks it up.** On a match, the node marks the transfer used and the intent
   resolved, then POSTs to the winning filler's
   `/api/notify-filler-intent-payment`. The filler queues the payout on its embedded
   batcher: a Bitcoin transfer, or a `mint_unshielded` circuit call for M20.
7. **Filler is made whole.** The node releases the user's side to the filler's wallet
   (`transferFunds` on Bitcoin, `transferFunds` on Midnight).

### Grammar

Four inputs, one per primitive. Two use `builtinGrammars`; the unshielded-spend payload
is passed through as-is because its shape comes from the indexer.

```ts
// packages/node/grammar.ts
export const grammar = {
  "bitcoin-transaction": builtinGrammars.bitcoinAddress,
  "midnightContractStateERC20": builtinGrammars.midnightGeneric,
  "midnightContractStateERC7683": builtinGrammars.midnightGeneric,
  "midnight-unshielded-spend": [["payload", Type.Any()]],
} as const satisfies GrammarDefinition;
```

Each key matches a `stateMachinePrefix` in `packages/node/config.dev.ts`, which is what
binds a primitive to its transition.

### State machine

`packages/node/state-machine.ts` registers one transition per grammar key. The
ERC-7683 handler decodes the intent out of the Compact ledger — Compact stores
`Bytes<N>` fields NUL-padded, and older payloads arrive as an object-of-bytes rather
than hex, so `decodePaddedString` handles both — inserts it, and immediately tries to
match:

```ts
// packages/node/state-machine.ts
yield* World.resolve(insertIntent, { ... });

yield* checkAndTransferFunds({
  type: "intent-received",
  orderId: parsedPayload.lastIntentEvent.orderId as string,
});
```

The Bitcoin handler is the mirror image: insert the transfer, then call
`checkAndTransferFunds({ type: "transfer-received", ... })`. Settlement is symmetric,
so the swap completes regardless of which leg lands first.

The unshielded-spend handler is the interesting one. A spend event carries only
`{ owner, intentHash, outputIndex, txHash }` — no amount, no recipient — so it is used
as a *signal* rather than a record: find the latest open M20 intent, look up the
winning filler's unshielded address, and synthesise the `transfers` row the matcher
expects. The template documents this simplification in place (it assumes at most one
outstanding M20 intent at a time).

Payouts run outside the state machine, in `setTimeout(..., 0)`, so that network I/O to
the fillers never sits inside a deterministic transition.

### API

`packages/node/api.ts` registers the routes the dApp uses. `GET /health` comes from the
runtime itself.

| Route | Purpose |
| --- | --- |
| `GET /health` | Runtime liveness (`{ status: "ok" }`) |
| `GET /api/intents?orderId=…` | One intent by order id, or `404` |
| `POST /api/get-quotes` | Fan out to all fillers, persist quotes, return the array |
| `GET /api/check-processes` | `LOADING` / `FILLERS-NOT-READY` / `READY` |
| `GET /api/faucet/btc?address=…` | **Development only.** Fund a regtest address |

`/api/check-processes` is worth a look: it does not just ask the orchestrator whether
the filler processes exist, it probes each filler's `/api/health` directly, because a
running process does not mean `listen()` has resolved while the wallet is still
syncing.

`POST /api/get-quotes` also rejects BTC amounts at or below the 546-sat dust limit up
front, so a doomed swap fails with a readable message instead of a chain-level error.

The fillers expose their own small API: `GET /api/health`, `POST /api/quote`, and
`POST /api/notify-filler-intent-payment`.

### Database

`packages/database/migrations/000-init.sql` creates three tables and
`packages/database/sql/queries.sql` holds the pgtyped queries over them.

| Table | Role |
| --- | --- |
| `intents` | The authoritative ERC-7683 order state, unique on `order_id`, with `resolved_by` naming the winning filler |
| `transfers` | A unified ledger of raw movements on both chains, with a `used` flag that stops one deposit satisfying two orders |
| `quotes` | Audit trail of the off-chain quoting round, unique on `(order_id, filler)` |

The `used` boolean is the whole double-spend defence on the app side: matching sets it
in the same transition that marks the intent resolved.

## Configuration

Dev defaults live in code and need no environment setup. The variables that exist:

| Variable | Default | Read by |
| --- | --- | --- |
| `EFFECTSTREAM_API_PORT` | `9999` | Sync node HTTP API |
| `PGLITE` | set to `true` for the `sync` process | Use embedded PGlite instead of external Postgres |
| `ORCHESTRATOR_PORT` | `4747` | `/api/check-processes` proxy target |
| `BATCHER_PORT` | `3334` | `packages/batcher/config.ts` |
| `BATCHER_WALLET_SEED` | built-in dev seeds | `packages/batcher/config.ts` |
| `BATCHER_POLLING_INTERVAL_MS` | `250` | `packages/batcher/config.ts` |
| `BATCHER_STORAGE_DIR` | `packages/batcher-data` | `packages/batcher/config.ts` |
| `MIDNIGHT_STORAGE_PASSWORD` | set by `start.dev.ts` | Midnight node storage |

Frontend endpoints are Vite variables in `packages/frontend/.env.dev`
(`VITE_API_URL`, `VITE_BATCHER_URL`, `VITE_MIDNIGHT_*`), consumed at build time by
`--mode dev`.

**Mainnet is not wired up.** `packages/node/config.mainnet.ts` and `main.mainnet.ts`
are stubs, and both say so at the top of the file. The mainnet config already validates
the variables it will need — `BITCOIN_RPC_URL`, `BITCOIN_RPC_USER`,
`BITCOIN_RPC_PASS`, `BITCOIN_START_BLOCK`, `MIDNIGHT_START_BLOCK`, `SYSTEM_WALLET_BTC`,
optional `NTP_START_TIME` — and throws if they are missing, but the Midnight network id
is still the local one and the deposit-address flow is regtest-shaped. Treat
`bun run start:mainnet` as a skeleton, not a deployment path.

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` boots its own orchestrator stack from
`packages/tests/start.test.ts`, runs three phases, prints a summary and tears the stack
down again:

- **Phase A — infrastructure.** Bitcoin regtest reaches block > 100, the Midnight node
  and indexer answer, the Compact contracts deploy, and the filler wallets are created
  on both chains.
- **Phase B — state machine, database, API.** The migration has applied and the three
  tables accept inserts (`stm/intents.test.ts`); `getLatestOpenIntentByToken` picks the
  right row (`stm/queries.test.ts`); the `midnight-unshielded-spend` transition is
  driven through the real `gameStateTransitions` generator with a fabricated input and
  must produce the synthetic transfer and resolve the intent
  (`stm/unshielded-spend.test.ts`); and every API route returns the right shape and
  status, including the sub-dust rejection (`stm/api.test.ts`).
- **Phase C — frontend.** The Vite build succeeds and the app renders under
  `playwright-core`.

Driving a full cross-chain intent end to end needs live wallets, so it is out of scope
for this suite; Phase B verifies the schema and API contract the flow depends on.

## Where to go next

- [Primitives](https://effectstream.github.io/docs/home/components/primitives) — how
  the four listeners in `config.dev.ts` turn chain events into typed inputs.
- [State machine](https://effectstream.github.io/docs/home/components/state-machine) —
  the determinism rules that dictate why payouts run outside the transitions here.
- [Bitcoin](https://effectstream.github.io/docs/home/chains/bitcoin) — regtest setup,
  address watching, and the Bitcoin batcher adapter.
- [Midnight](https://effectstream.github.io/docs/home/chains/midnight) — Compact
  contracts, the indexer, and shielded vs unshielded addresses.
- [Batcher overview](https://effectstream.github.io/docs/home/components/batcher/overview)
  — adapters, batching criteria, and the balancing adapter this template uses twice.
- [EVM-Midnight template](https://effectstream.github.io/docs/home/templates/evm-midnight)
  — the sibling template for a simpler two-chain sync without the solver market.

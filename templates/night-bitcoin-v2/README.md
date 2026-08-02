# Night Bitcoin — Intent-Based Cross-Chain Swaps

Trustless swaps between Bitcoin (UTXO) and Midnight (ZK privacy) without a
bridge. Instead of locking funds in a bridge contract, a user publishes a signed
**intent** describing the trade they want; a network of competing **fillers**
(solvers) quotes it, and the winner settles both legs. Effectstream indexes both
chains and arbitrates settlement.

The intent format follows [ERC-7683](https://eips.ethereum.org/EIPS/eip-7683).

## Quick start

```bash
bun i
bun run dev
```

The orchestrator brings up a Bitcoin regtest node, the Midnight stack (node,
indexer and proof server), the development database, the sync node, the batcher,
a filler, and the frontend. The first run compiles the Compact contracts, which
takes a few minutes.

## Layout

```
packages/
  node/                 sync node: config, grammar, state machine, API
  filler/               solver that quotes and settles intents
  contracts-midnight/   Compact contracts (ERC-7683 intents, unshielded ERC-20)
  contracts-bitcoin/    Bitcoin-side helpers for regtest
  batcher/              gasless input submission
  database/             migrations and pgtyped queries
  frontend/             React client (in `frontend/client`)
  tests/                integration tests
```

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check. |
| `GET /api/intents` | List open and settled intents. |
| `GET /api/quote`, `GET /api/get-quotes` | Quote a prospective swap. |
| `GET /api/check-processes` | Report which stack processes are up. |
| `GET /api/faucet/btc` | Fund a test wallet with regtest BTC. **Development only.** |
| `GET /api/faucet/nights` | Fund a test wallet with NIGHT. **Development only.** |

## How a swap flows

1. A user signs an intent describing what they will give and what they want.
2. Fillers watch for open intents and return quotes.
3. The user accepts a quote; the filler settles the counter-leg.
4. The sync node observes both chains and the state machine records settlement,
   releasing the user's side only once the filler's leg is confirmed.

Because settlement is arbitrated from indexed on-chain state rather than by a
custodian, neither party has to trust the other — a filler that takes payment
without delivering is simply never credited.

## Scripts

```bash
bun run dev              # full local stack via the orchestrator
bun run test             # integration tests
bun run build:midnight   # compile the Compact contracts
bun run build:pgtypes    # regenerate pgtyped query types
bun run start:frontend   # run the frontend on its own
bun run start:mainnet    # run the node against mainnet config
```

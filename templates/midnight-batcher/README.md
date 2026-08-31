# midnight-batcher

Batcher-only Effectstream template for the Midnight chain: a
`MidnightBalancingAdapter` exposed as target **`midnight-balancer`**, running
against a full local Midnight stack **entirely on Docker** (host ports
18400–18500), plus funding scripts, workload generators (zswap + contract
calls) and an adversarial test suite (see [TESTING.md](TESTING.md)).

There is intentionally **no sync node and no frontend** — this template is a
harness for hardening the batcher's dust-balancing pipeline and measuring its
throughput.

## Stack

| service | image | host port |
|---|---|---|
| `node` | `midnightntwrk/midnight-node:1.0.0` (CFG_PRESET=dev) | 18444 |
| `indexer` | `midnightntwrk/indexer-standalone:4.3.2` | 18488 |
| `proof-server` ×3 | `midnightnetwork/proof-server:8.1.0` | — |
| `proof-lb` | nginx `least_conn` over the 3 provers | 18463 |
| `app` | `oven/bun:1` + bind-mounted monorepo — deploy → fund → batcher | 18434 |

The `app` container bind-mounts the effectstream monorepo at the same absolute
path as on the host, so host `node_modules` and `link.sh` symlinks resolve
unchanged, and **edits to `packages/batcher` go live with
`docker compose restart app`** — no image rebuild.

## Bring-up

```bash
./link.sh                    # template deps + link monorepo @effectstream packages; writes .env
bun run compile:contract     # Compact compile (needs `compact` on PATH)
docker compose up -d
docker compose logs -f app   # watch: deploy → fund (~20 dust lanes) → batcher on :18434
```

The funding bootstrap (`packages/scripts/fund.ts`) uses the genesis wallet
**once**: one seed UTXO → register the batcher's night address for dust →
one large transfer → the batcher **self-splits into 20 large NIGHT UTXOs**
(each backing its own dust stream = 20 parallel fee lanes) → shielded coins
for the zswap maker. It then waits for 20 *spendable* dust coins (count AND
per-coin generated value) and writes `batcher-data/funding-ready.json`.

## Workloads

```bash
bun run workload:zswap -- --count 10 --concurrency 4 --verify
bun run workload:calls -- --count 10 --concurrency 4 --verify
```

- **zswap**: shielded transfers built with `payFees: false` (proven + bound,
  not dust-balanced) → batcher pays the fee. Ground truth: sink wallet balance.
- **calls**: `counter.increment()` call txs captured at `balanceTx` (proven
  via the proof LB, unbound) → batcher balances + submits. Ground truth: the
  on-chain commutative counter.

## Adversarial suite

```bash
bun run test:adversarial -- --phase 1    # reproduce known defects (current batcher)
bun run test:adversarial -- --phase 3    # assert fixed behavior
```

See [TESTING.md](TESTING.md) for the T1–T13 checklist and
`TESTING-RESULTS.md` for recorded runs.

## Env knobs (docker-compose)

| var | default | meaning |
|---|---|---|
| `TARGET_UTXOS` | 20 | NIGHT UTXOs (= dust lanes) the batcher self-splits into |
| `FUND_TOTAL_STARS` | 1e13 (10M NIGHT) | total NIGHT backing the dust lanes |
| `BATCHER_MAX_SLOTS_PER_WALLET` | 10 | concurrent worker slots (keep ≤ TARGET_UTXOS/2) |
| `BATCHER_MAX_BATCH_SIZE` | 5 | inputs pulled per batch |
| `BATCHER_WALLET_SEED` | …0042 | batcher wallet (NOT genesis) |
| `SKIP_DEPLOY` / `SKIP_FUND` | — | force-skip bootstrap stages |

## ⚠️ Chain state is ephemeral

The dev node keeps its chain inside the container filesystem. **Any compose
config change followed by `docker compose up -d` RECREATES changed services —
recreating `node` wipes the chain**, orphaning the deployed contract, the
batcher funding and the dust registration. Use `docker compose restart <svc>`
for restarts; after an intentional chain reset, run the Reset steps below so
the bootstrap re-runs from scratch.

## Reset

```bash
docker compose down -v
rm -rf batcher-data packages/contracts-midnight/contract-counter.*.json packages/contracts-midnight/midnight-level-db*
```

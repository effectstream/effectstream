# multi-batcher

**One batcher serving many products.** A single Midnight balancing batcher
process hosts several independent products, each with its own fee wallet, its
own worker pool and its own rules about which transactions it will pay for.

Replaces the "one batcher process per product" pattern: one port, one queue,
one thing to operate — without letting products spend each other's dust or
submit each other's transactions.

## How it works

A **product** is a target + an adapter instance + a wallet + a policy:

| product | target | needs a backend? | policy |
|---|---|---|---|
| product-a | `product-a` | yes — Compact counter contract | `allowedCircuits`: only `increment()` on its own contract |
| product-b | `product-b` | no | `allowZswapTransfers`: shielded transfers only |
| product-c | `product-c` | no | transfers **plus a custom final filter**: only matched-delta swaps (+X tokenA / −X tokenB) |

### What a policy can actually see

Shielded amounts are hidden — that is the point of the chain — so a policy
**cannot** cap value. What it can read is *structure* and *deltas*:

- **Contract actions** — address and entry point, so contract/circuit
  allowlists are exact.
- **Zswap deltas** — net inputs − outputs per token type. A *balanced* transfer
  reports no deltas at all; a swap **offer** is unbalanced by construction and
  that imbalance is precisely its `+X tokenA / −X tokenB` signature.
- **Nullifiers** — `zswapNullifiers(tx)` returns the spend tags. They reveal
  nothing about a coin, but a nullifier already on chain means the coin is
  spent and the transaction can never apply. That is the one chain-state check
  worth a sponsor's time: a doomed transaction still costs it proving and dust
  to discover. Safe to run at intake and again pre-batch, because "spent" only
  ever becomes more true.

product-c trades against a **second token type**. A bare dev chain ships only
the native shielded token, so the other side is a contract-issued color:
`rawTokenType(domainSep, contractAddress)` is deterministic, so the color is
well-defined as soon as the contract exists — no mint needed to *reference* it.
product-a's counter also exposes `mint_shielded` if you want real coins of it
in a wallet; note the recipient is `ownPublicKey()`, because contract sends
create no coin ciphertexts and only the calling wallet would discover the coin.

A matched-delta offer is **half a trade**: it settles only once a counterparty
or a solver supplies the other side. product-c therefore demonstrates the
authorization path, not delivery.

Everything lives in [`shared-batcher/registry.ts`](shared-batcher/registry.ts) —
add a product by adding an entry.

### Safety model

Authorization is **content-based**: the operator declares what each product may
submit, and the batcher inspects the transaction itself. There are no tokens
and clients need no changes.

- **Fee isolation.** Each product has its own wallet, so its own dust lanes and
  worker pool. A product that runs dry parks its own queue; the others keep
  running. Two products can never share a seed — the SDK throws at startup,
  because two adapters on one wallet book dust independently and double-spend it.
- **Routing.** Inputs must name their target (`requireExplicitTarget`). An
  unaddressed input is refused rather than charged to whichever product happens
  to be registered first.
- **Policy is enforced twice**: at intake (`/send-input` → 400) and again
  before any dust is spent (storage rows are untrusted and policy can be
  tightened across a restart).
- **Shared queue, separate rows.** All products share one JSONL queue; rows are
  keyed by target, so an identical payload sent to two products is two
  independent rows.

⚠️ **Residual risk, by design:** anyone who can reach the port may submit a
*policy-conforming* transaction and have its fee sponsored. Policies are the
budget control (narrow the circuits, add a custom filter); put network ACLs in
front for anything public.

Note that `allowedTokenTypes` is *not* a general budget control, and it
constrains **unshielded offers only**. Shielded token types are visible just
through an offer's deltas, which are net sums — a token that balances inside
the offer cancels to zero and is invisible. That is true of a swap as much as
of a plain transfer: a swap's two visible deltas say nothing about a third
token riding along. Any transaction carrying shielded coins is therefore
rejected under this rule rather than checked against an allowlist that cannot
see its contents. For real per-token control, gate on a circuit whose proof
binds the token type.

### Writing a custom filter

Custom filters get the deserialized transaction and the declarative verdict,
run **after** the declarative rules, and decide finally. Use the same helpers
the built-in rules use:

```ts
import { isMatchedDeltaSwap, zswapTokenDeltas } from "@effectstream/batcher-sdk/midnight-policy";

policy: {
  allowZswapTransfers: true,
  allowCustomFinalFilter: ({ tx, declarativeVerdict }) => {
    if (!declarativeVerdict.valid) return false;
    return isMatchedDeltaSwap(tx) || { valid: false, error: "not a matched swap" };
  },
}
```

Filters must be deterministic and side-effect free — they run at intake and
again pre-spend. A throw rejects (fail closed).

## Stack

Host ports live in the **12800 block**, bound to loopback — clear of the
default Midnight ports, of `templates/midnight-batcher` (18400 block) and of
the e2e guard's own stack:

| service | host port |
|---|---|
| shared batcher | **12835** |
| midnight node | 12845 |
| proof load-balancer (3 provers) | 12864 |
| indexer | 12889 |

## Bring-up

```bash
./link.sh                 # deps + monorepo links; writes .env for compose
bun run compile:contract  # product-a's Compact contract (needs `compact`)
docker compose up -d
docker compose logs -f app    # deploy → fund all products → batcher ready
```

The funding step gives every product wallet its own lanes: seed UTXO →
register the address for dust → one transfer → **one** self-split into N large
UTXOs (register-first matters: registering later consolidates existing UTXOs
into ≤2 and destroys the lanes).

> **Reading dust readiness.** A dust coin's `generatedNow` is a snapshot the
> wallet refreshes on events, **not** a live accrual — on a quiet chain it can
> read `0` while the UTXO is generating normally. The SDK's own coin picker
> reads the same field, so a healthy lane can be invisible to it and surface as
> `could not balance dust`. Funding therefore projects the value
> (`rate × elapsed`, capped at `maxCap`) and re-opens the wallet before the
> final check, since a fresh instance re-syncs and recomputes. If you are
> debugging a "funded but can't pay" wallet, use `tests/diagnose-dust.ts` and look at
> `rate` / `maxCap` / `dtime` / `ctime` rather than the balance.

## Workloads

```bash
bun run workload:a -- --count 5 --verify     # counter calls
bun run workload:b -- --count 5 --verify     # shielded transfers
bun run workload:c -- --count 3              # matched-delta swaps
bun run workload:c -- --kind unmatched       # refused by the custom filter
bun run workload:c -- --inspect              # print the deltas the filter decides on
```

## Tests

- **Fast CI guard** lives in [`e2e/multi-batcher`](../../e2e/multi-batcher)
  (`bun run e2e/runner.ts multi-batcher`) — every product accepts its own shape
  and refuses the others, routing errors are refused, accepted work lands.
- **Deep suite** here: `bun run test:deep` — the exhaustive rule matrix,
  timeouts, tampered storage, restarts, cross-product interference and floods.
  See [TESTING.md](TESTING.md); results append to `TESTING-RESULTS.md`.

## Env knobs

| var | default | meaning |
|---|---|---|
| `LANES_PER_PRODUCT` | 10 | fee lanes (dust streams) per product |
| `FUND_STARS_PER_PRODUCT` | 5e12 | NIGHT backing those lanes |
| `PRODUCT_{A,B,C}_SLOTS` | 5 | concurrent balances per product (keep ≤ lanes/2) |
| `SKIP_DEPLOY` / `SKIP_FUND` | — | force-skip bootstrap stages |

## ⚠️ Chain state is ephemeral

A compose **config** change plus `up -d` recreates changed services —
recreating `node` wipes the chain (contract, funding, dust registration). Use
`docker compose restart <svc>`; after an intentional reset run:

```bash
docker compose down -v
rm -rf batcher-data product-a/contract-counter.*.json product-a/midnight-level-db*
```

### Funding is a one-shot, not a retry loop

`docker compose restart app` re-runs `entry.ts`, which re-runs funding. That is
fine on a **fully** funded chain — each product's balance check makes it a
no-op — but **not** on a partially funded one.

If funding dies partway (a transfer fails, the container is killed mid-split),
genesis is left holding UTXO and dust state the script did not expect. Retrying
against that chain does not recover: the already-funded products skip, and the
next unfunded one fails its seed transfer with a node-level rejection such as

```
RpcError: 1010: Invalid Transaction: Custom error: 170
```

which reads like a code bug but is really "genesis is not in the state this
transfer assumed". **A failed funding run means wipe the chain and start over**,
using the reset commands above — do not restart `app` and hope. Deleting the
stale `contract-counter.*.json` matters as much as the volumes: keeping it makes
`entry.ts` skip the deploy and point every product at a contract address that no
longer exists on the new chain.

# Testing the shared multi-product batcher

Two tiers, deliberately split by location:

| tier | where | purpose | budget |
|---|---|---|---|
| **fast guard** | [`e2e/multi-batcher`](../../e2e/multi-batcher) | "nothing broke" — runs in CI on every change | one cheap tx per assertion |
| **deep suite** | `templates/multi-batcher/tests` (here) | exhaustive rules, timeouts, and deliberate attempts to break the shared batcher | manual / nightly |

## Fast guard (CI) — `bun run e2e/runner.ts multi-batcher`

Extensive in *coverage*, minimal in *cost*: every product, both an accept and a
reject per policy kind, plus the routing errors.

1. all three products registered on one batcher
2. product-a accepts its counter call — and it lands on chain (counter +1)
3. product-a refuses a transfer (circuit allowlist)
4. product-b accepts a shielded transfer — and it lands (sink balance)
5. product-b refuses a contract call
6. product-c accepts a matched-delta swap (+native / −contract-issued token)
7. product-c refuses a balanced transfer — it nets to zero deltas, so it is no swap (**custom filter**)
8. a real finalized transaction with its serialized network id rewritten is
   admitted under option B, then gets typed permanent 400 at pre-spend
9. unaddressed input → 400; unknown target → 404
10. every queue drains

## Deep suite — `bun run test:deep [-- --only M3,M7]`

Requires the Docker stack (`docker compose up -d`). Results append to
`TESTING-RESULTS.md` with per-run memory tables.

| # | Test | What it proves |
|---|---|---|
| M1 | Policy matrix | All 8 (shape × product) combinations decide correctly: each product accepts only its own shape. Covers the custom filter refusing a *valid* zswap. |
| M2 | Cross-product dust isolation | Flooding product-a (30 calls) does not stall product-b or product-c; every accepted input still lands; zero drops. |
| M3 | Shared-queue dedup | A byte-identical payload sent to two products is two independent rows: one accepted, one refused, delivered exactly once. Guards the target-scoped storage key. |
| M4 | Strict routing | Unaddressed input → 400, unknown target → 404, nothing queued. |
| M5 | Tampered storage | A policy-violating row appended straight to the JSONL (bypassing intake) is refused by the **pre-spend gate** — typed `POLICY_REJECTED`, permanently rejected and removed, with **zero proving, zero dust and zero retry charge** (no `DROPPING`), all scoped to the row's own trace hash — other products unaffected. |
| M6 | Garbage intake | Non-JSON, empty, bad stage, garbage hex and a 1 MB blob are all refused at the door; queue stays clean. |
| M7 | Per-product observability | `/queue-stats` reports each product's queue depth plus adapter health (workers busy/total, dust lanes, policy shape). |
| M8 | Node outage | A 60s outage costs no work: every accepted input is delivered **exactly once** (a loss makes the delta short, a double-submit makes it long), and nothing is judged permanently invalid — an unreachable node says nothing about validity. Drops are reported, not forbidden: when the pause straddles an in-flight submission the batcher never sees the receipt for a transaction the node already accepted, retries it, and reaps the stale row. See the note below. |
| M9 | Restart with a mixed queue | Restarting the batcher mid-flight delivers each product's work exactly once — no loss, no double-submit. |
| M10 | Mixed soak | All three products under concurrent load: zero dust errors, zero drops, everything delivered; TPS, batcher event-loop p99, container memory and per-validation-child RSS recorded. |
| M11 | Corrupted proof | A real finalized transfer first round-trips the child/WASM boundary with `verifySignatures: true`; a parseable corrupted zswap proof then gets intake 200, permanent pre-spend rejection, zero proving, unchanged dust lanes, zero retry charge, and typed late 400. |
| M12 | TTL after dust wait | A real intent-bearing contract call passes before an injected dust wait, expires during that wait under a deterministic clock, and is rejected by the exact adapter spend-boundary seam. A transfer is never substituted because it has zero intents. |
| M13 | Request tracking end-to-end | On the embedded dev rung (`BATCHER_PGLITE=true`, own data directory): every 200 carries a 64-hex `requestId`, every id resolves *before* a restart, survives `docker compose restart app` (exercising the batcher's own `pglite.lock` reclamation) with zero 404s, and polls to `complete` with a transaction hash — cross-checked against the on-chain counter delta. **Currently `observed`, not `pass` — blocked by an SDK defect, see below.** |
| M14 | Replay / dedup | A byte-identical resubmission (ONE clock read, reused) returns the **original** `requestId` with `duplicate: true` and queues nothing; the same spend addressed to a **different product** does too, because the replay key is the transaction's own identity rather than the target — one signed spend is one paid request, and the id returned is not the one that payload's own content key hashes to. **Currently `observed` — same blocker.** |
| M15 | Freshness window | A timestamp older than `maxInputAgeMs` is refused 400 `INPUT_TIMESTAMP_EXPIRED`; a future-dated one past the 5-minute skew allowance is 400 `INPUT_TIMESTAMP_IN_FUTURE`; an unparseable one is 400 `INPUT_TIMESTAMP_UNREADABLE` — all `retryable: false`, none queued. A timestamp just *inside* the window is accepted: the far edge is inclusive by design. |
| M16 | Queue-only posture | The shipped default (explicit `FileStorage`) still delivers end-to-end and still returns a `requestId` on every 200 — and never claims a dedup it cannot do. `GET /input-status/:id` answers **501** with `reason: request-tracking-disabled` and `enableWith: BATCHER_DB_SCHEMA`, *before* the id is parsed (a malformed id gets the same 501, not a 400); `/queue-stats` agrees; the startup banner names what is switched off. |

### The two storage postures

The template ships **queue-only**: `shared-batcher/batcher.ts` constructs an
explicit `FileStorage`, which by SDK contract means the environment is never
consulted. M1–M12, M15 and M16 run on that.

Setting `BATCHER_PGLITE=true` (or `BATCHER_DB_SCHEMA`) makes the template hand
the choice to the SDK's storage ladder instead — passing a storage object would
override the very key the operator just set.
[`docker-compose.tracking.yml`](docker-compose.tracking.yml) is that deployment;
M13 and M14 switch the `app` service onto it and back, and **read** the posture
from `/queue-stats` rather than assuming it, so `--only M13` behaves like a full
run. The suite restores queue-only when it finishes.

Only one batcher process ever exists: the products' fee wallets are the same
wallets either way, and two adapters booking dust on one wallet would
double-spend it. The postures are isolated by DATA DIRECTORY, not by port — the
embedded engine is in-process WASM and binds no socket.

### Known SDK blocker: tracking cannot accept a real Midnight transaction

M13 and M14 report **`observed`**, not `pass`, and the reason is in the SDK
rather than the template. `DatabaseStorage` makes the FULL content key the btree
primary key of `pending_inputs` (`PRIMARY KEY (content_key, seq)`), and that key
embeds the entire submitted payload. A Midnight contract call is ~3.3 KB, so the
key reaches ~6.7 KB against PostgreSQL's 2704-byte btree tuple ceiling:

```
Failed to record accepted request: error: index row size 6712 exceeds
btree version 4 maximum 2704 for index "pending_inputs_pkey"
```

Acceptance rolls back and the caller gets a 500 — so on this rung there is no
200, and therefore no "a 200 means durably tracked". The DDL is shared, so the
connected production rung (`BATCHER_DB_SCHEMA`) fails identically; this is not a
PgLite quirk. `FileStorage` is unaffected, which is why everything else is green.

The two scenarios detect exactly this error signature and report it rather than
failing, so the suite states the blocker instead of going permanently red over a
defect it does not own. **Any other failure still fails**, and once the SDK
indexes a fixed-width id instead of the payload they become ordinary tests with
no edit required — which is what makes them the regression test for that fix.

### Border cases covered at unit level

`bun test packages/batcher` — no chain required:

- **Rule matching**: allowed contract + *disallowed* second call in another
  intent ⇒ reject; wrong/miscased entry point ⇒ reject; a deploy (no entry
  point) never satisfies a circuit allowlist; empty transaction matches
  nothing; entry points as raw bytes and as strings resolve identically (all
  three tx stages agree).
- **`allowedTokenTypes` observability**: it rejects foreign tokens on unshielded
  offers, where types are carried directly, and rejects *any* shielded
  coin-bearing transaction outright — including swaps. Deltas are net sums, so a
  token balancing inside an offer is invisible, and a swap's two visible deltas
  prove nothing about a third token riding along. A regression test pins the
  mixed case (one allowlisted delta plus a hidden balanced one), which an
  earlier version of the guard accepted.
- **Fail closed**: introspection that throws ⇒ reject, never accept.
- **Custom filter semantics**: runs strictly *after* the declarative rules and
  receives their verdict; can tighten; can override; throwing rejects; async
  filters are awaited; a filter alone (no declarative rules) still gates — at
  intake *and* at the pre-spend gate.
- **Enforcement guard**: a filter-only policy is declaratively empty by design
  (so the filter receives an allow-all verdict it can override), which makes
  `isEmptyPolicy` the wrong guard for an enforcement point — it would skip such
  a policy entirely. `isPolicyEnforced` is the guard, and the contract is
  asserted directly: every policy shape the guard skips must be incapable of
  rejecting anything.
- **Nullifier pre-check**: a tx whose input nullifier is already on chain is
  refused before any dust is spent; the verdict is monotone across the intake
  and pre-batch evaluations.
- **Matched-delta borders**: +X/−X accepted; mismatched magnitudes, same-sign,
  three-token baskets, single-token transfers and zero-value deltas rejected;
  dust fees do not pollute the delta map (they live outside zswap offers, so a
  matched swap stays matched after the batcher balances it).
- **Multi-tenant core**: target-scoped dedup key (remove/retry one product's
  row leaves its twin), legacy target-less rows still resolve, wallet-seed
  exclusivity (including partial-claim rollback and release/re-claim), and
  per-target retry-policy resolution.

## Judgement notes

- Ground truth is always on-chain (counter delta, sink balance) or the
  batcher's own queue accounting — never a workload's self-report.
- M2/M8/M10 assert **delivered == accepted** per product, which is the property
  that actually matters to a product owner.
- Container memory is sampled from `docker stats` every ~5s for the whole run;
  the `app` total is an upper bound on the batcher itself. The same sampler uses
  `docker top` to record RSS for every `validation-worker.ts` child separately,
  because each child owns an independent ledger WASM heap.
- M10 reads event-loop-delay histograms emitted by the batcher process itself;
  host-driver latency is not used as a proxy for the server's event loop.

## Known host-level hazard: docker's pause state can diverge from the freezer

M8 pauses the `node` service. `docker compose pause`/`unpause` can report
success while the daemon's metadata and the container's freezer cgroup
disagree: the daemon then refuses both `pause` ("container not running") and
`unpause` ("is not paused") while the process stays frozen and `docker exec`
answers "cannot exec in a paused container". The node's 2-second healthcheck
exec makes the race easy to hit, since an exec is nearly always in flight when
the pause lands.

M8 therefore VERIFIES both transitions against the daemon and then waits for the
node to answer RPC again, failing immediately and by name if it does not —
rather than spending its 15-minute drain budget on a chain that will never
produce another block and reporting that as a batcher fault. **Recovery:**
`docker restart multi-batcher-node-1`. The chain survives a restart (it lives in
the container's writable layer); only a recreate — a compose *config* change
plus `up -d` — wipes it.

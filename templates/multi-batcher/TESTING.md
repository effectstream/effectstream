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
| M8 | Node outage | A 60s outage parks every product (infra failure, no retry charged), then all recover with zero drops. |
| M9 | Restart with a mixed queue | Restarting the batcher mid-flight delivers each product's work exactly once — no loss, no double-submit. |
| M10 | Mixed soak | All three products under concurrent load: zero dust errors, zero drops, everything delivered; TPS, batcher event-loop p99, container memory and per-validation-child RSS recorded. |
| M11 | Corrupted proof | A real finalized transfer first round-trips the child/WASM boundary with `verifySignatures: true`; a parseable corrupted zswap proof then gets intake 200, permanent pre-spend rejection, zero proving, unchanged dust lanes, zero retry charge, and typed late 400. |
| M12 | TTL after dust wait | A real intent-bearing contract call passes before an injected dust wait, expires during that wait under a deterministic clock, and is rejected by the exact adapter spend-boundary seam. A transfer is never substituted because it has zero intents. |

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

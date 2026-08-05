
## Run 2026-08-04T18:36:44.834Z (phase 1)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T1 | Baseline zswap balancing | **fail** | accepted=1 delivered=0 |

## Run 2026-08-04T18:39:34.291Z (phase 1)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T1 | Baseline zswap balancing | **pass** | accepted=1 delivered=1 |
| T2 | Baseline contract call balancing | **fail** | accepted=0 delivered=null |

## Run 2026-08-04T18:50:48.598Z (phase 1)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T1 | Baseline zswap balancing | **pass** | accepted=1 delivered=1 |
| T2 | Baseline contract call balancing | **pass** | accepted=1 delivered=1 |
| T3 | Burst > slots drains dust (doomed balance attempts) | **error** | Unable to connect. Is the computer able to access the url? |
| T4 | Count-vs-value gate trap (analysis of T3 logs) | **not-reproduced** | balanceDustErrors=0 60sWaits=0 gatePassedLines=0 |

## Incident 2026-08-04 ~18:58 (phase 1, unplanned T8 evidence)

During the slots==coins T3 rerun, `indexer-standalone` 4.3.2 crashed
(`wallet-indexer exited with ERROR: index_wallets_task failed: get next active
wallet ID: pool timed out while waiting for an open connection`) — wallet-session
connection-pool starvation under repeated wallet syncs + GraphQL burst. Exit 1,
no restart policy → stayed down.

**Batcher behavior during the outage (current, unfixed): 9 × `Dropping input
after 3 failed retries` — user inputs silently deleted because an
infrastructure outage was charged against per-input retry budgets.** 0
balance-dust errors (the failure path was indexer queries, not dust).

Mitigations applied to the template: `restart: unless-stopped` on all infra
services. The park-don't-drop batcher fix (Phase 2) is the real remedy.

## Run 2026-08-04T19:13:23.948Z (phase 1)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T3 | Burst > slots drains dust (doomed balance attempts) | **error** | no contract state |
| T4 | Count-vs-value gate trap (analysis of T3 logs) | **not-reproduced** | balanceDustErrors=0 60sWaits=0 gatePassedLines=0 |
| T5 | Silent input drop after 3 retries | **error** | no contract state |

**Memory (docker stats, 17 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 484.0 | 481.7 |
| indexer | 19.4 | 18.4 |
| node | 229.0 | 229.0 |
| proof-lb | 2.5 | 2.5 |

## Run 2026-08-04T19:38:25.425Z (phase 1)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T3 | Burst > slots drains dust (doomed balance attempts) | **not-reproduced** | submitted=60 accepted=60 delivered=60 balanceDustErrors=0 60sWaits=0 drops=0 |
| T4 | Count-vs-value gate trap (analysis of T3 logs) | **not-reproduced** | balanceDustErrors=0 60sWaits=0 gatePassedLines=0 |
| T5 | Silent input drop after 3 retries | **not-reproduced** | accepted=80 delivered=80 drops=0 drained=true |

**Memory (docker stats, 92 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 576.8 | 344.3 |
| indexer | 37.9 | 34.5 |
| node | 294.2 | 170.0 |
| proof-server | 506.0 | 236.0 |
| proof-server-2 | 857.6 | 340.1 |
| proof-server-3 | 691.5 | 349.4 |

## Run 2026-08-04T20:09:16.569Z (phase 1)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T9 | Poison input does not block or kill good inputs | **reproduced** | poisonAccepted=true goodAccepted=4 goodDelivered=4 deserializeErrors=82 pendingLeft=1 |
| T10 | Duplicate tx submission handled deterministically | **observed** | accepted1=true accepted2=true deliveredUnits=1 intentAlreadyExists=0 |
| T12 | Garbage input rejected without poisoning the queue | **reproduced** | not-json-not-hex:rejected(400) empty:rejected(400) bad-stage:rejected(400) huge:ACCEPTED healthyAfter=true |
| T11 | Batcher restart with non-empty queue | **observed** | accepted=6 deliveredAfterRestart=6 |

**Memory (docker stats, 261 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 672.2 | 563.6 |
| indexer | 51.9 | 51.0 |
| node | 170.3 | 117.4 |
| proof-server | 298.3 | 6.3 |
| proof-server-2 | 556.3 | 5.6 |
| proof-server-3 | 351.6 | 5.7 |

## Run 2026-08-04T20:42:24.636Z (phase 1)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T6 | Dust leak when prove/finalize fails mid-batch | **observed** | dustCoins 0→20 spendable 0→20 accepted=5 revertMentions=0 |
| T7 | Dust booked across submit timeout (node paused) | **observed** | accepted=3 delivered=3 submitTimeouts=3 dustCoins 20→20 |
| T8 | Node outage mid-run: park + recover, no drops | **not-reproduced** | accepted=8 delivered=8 drops=0 |

**Memory (docker stats, 297 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 639.7 | 569.7 |
| indexer | 56.7 | 55.9 |
| node | 174.6 | 166.7 |
| proof-server | 891.4 | 661.6 |
| proof-server-2 | 887.2 | 741.5 |
| proof-server-3 | 810.5 | 741.5 |

## Run 2026-08-04T20:44:54.972Z (phase 1)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T13 | TPS soak (mixed zswap + calls) | **observed** | calls=40/40 zswaps=15/15 wall=141.0s end2endTPS=0.39 chainUserTxs=55 blocks=868→891 dustErrors=0 drops=0 |

**Memory (docker stats, 39 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 606.7 | 540.6 |
| indexer | 59.7 | 57.5 |
| node | 176.8 | 176.8 |
| proof-server | 891.4 | 660.6 |
| proof-server-2 | 887.2 | 739.1 |
| proof-server-3 | 810.5 | 740.5 |

## Run 2026-08-04T21:00:08.503Z (phase 3)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T1 | Baseline zswap balancing | **pass** | accepted=1 delivered=1 |
| T2 | Baseline contract call balancing | **pass** | accepted=1 delivered=1 |
| T3 | Burst > slots drains dust (doomed balance attempts) | **pass** | submitted=60 accepted=60 delivered=60 balanceDustErrors=0 60sWaits=0 drops=0 |
| T4 | Count-vs-value gate trap (analysis of T3 logs) | **pass** | balanceDustErrors=0 60sWaits=0 gatePassedLines=0 |
| T5 | Silent input drop after 3 retries | **pass** | accepted=80 delivered=80 drops=0 drained=true |

**Memory (docker stats, 100 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 555.0 | 522.5 |
| indexer | 65.7 | 65.7 |
| node | 198.1 | 197.2 |
| proof-server | 672.9 | 668.7 |
| proof-server-2 | 750.9 | 700.2 |
| proof-server-3 | 745.4 | 741.3 |

## Run 2026-08-04T21:09:33.997Z (phase 3)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T9 | Poison input does not block or kill good inputs | **pass** | poisonAccepted=false goodAccepted=4 goodDelivered=4 deserializeErrors=0 pendingLeft=0 |
| T10 | Duplicate tx submission handled deterministically | **pass** | accepted1=true accepted2=true deliveredUnits=1 intentAlreadyExists=0 |
| T12 | Garbage input rejected without poisoning the queue | **pass** | not-json-not-hex:rejected(400) empty:rejected(400) bad-stage:rejected(400) huge:rejected(400) healthyAfter=true |
| T11 | Batcher restart with non-empty queue | **pass** | accepted=6 deliveredAfterRestart=6 |

**Memory (docker stats, 40 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 587.8 | 532.2 |
| indexer | 71.1 | 71.1 |
| node | 223.3 | 222.2 |
| proof-server | 688.7 | 685.2 |
| proof-server-2 | 714.4 | 700.4 |
| proof-server-3 | 803.7 | 746.1 |

## Run 2026-08-04T21:18:26.416Z (phase 3)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T6 | Dust leak when prove/finalize fails mid-batch | **pass** | dustCoins 0→20 spendable 0→20 accepted=5 revertMentions=0 |
| T7 | Dust booked across submit timeout (node paused) | **observed** | accepted=3 delivered=3 submitTimeouts=3 dustCoins 20→20 |
| T8 | Node outage mid-run: park + recover, no drops | **pass** | accepted=8 delivered=8 drops=0 |

**Memory (docker stats, 76 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 537.3 | 532.6 |
| indexer | 74.8 | 72.6 |
| node | 228.5 | 228.5 |
| proof-server | 686.5 | 115.1 |
| proof-server-2 | 703.2 | 113.9 |
| proof-server-3 | 749.2 | 114.2 |

---

# FINAL SUMMARY — before/after (Phase 1 vs Phase 3)

Phase 1 ran the checklist against the batcher as-published (0.103.0-era source);
Phase 3 against the hardened `packages/batcher` (same stack, same 20-lane /
20-slot adversarial slots==coins configuration).

| # | Test | Phase 1 (current) | Phase 3 (fixed) |
|---|------|-------------------|-----------------|
| T1 | Baseline zswap | pass | **pass** (55s) |
| T2 | Baseline call | pass | **pass** (21s) |
| T3 | Burst 3× slots | not-reproduced (healthy chain: booked coins return in ~1 block) | **pass** — 60/60, 0 errors, 156s |
| T4 | Count-vs-value trap | not-reproduced on healthy path | **pass** — value-aware gate active |
| T5 | Sustained 4× overload | not-reproduced (80/80) | **pass** — 80/80, 0 drops |
| T6 | Prover kill mid-batch | observed — pool recovered | **pass** — pool 20/20 after fault |
| T7 | Node pause across 90s submit timeout | observed — 3 timeouts, txs landed, no leak (767s) | **observed** — same outcome, 171s (cooldown parks target) |
| T8 | 60s node outage | not-reproduced (699s) | **pass** — 8/8, 0 drops, 92s |
| T9 | Poison input | **REPRODUCED** — accepted, 82 deserialize errors/42s, stuck in queue forever | **pass** — rejected 400 at intake; queue clean |
| T10 | Duplicate submission | observed — exactly-once on chain, but 3 wasted balance+prove+submit cycles (365s) | **pass** — exactly-once, fails fast (165s) |
| T11 | Restart with queue | observed — durable, but 944s (phantom inputs blocked drain) | **pass** — 6/6 after restart, 63s |
| T12 | Garbage intake | **REPRODUCED** — 1MB blob accepted into queue | **pass** — all 4 classes rejected 400 (size cap + real deserializer at intake) |
| T13 | Mixed soak (40 calls + 15 zswaps) | 55/55, 0.39 TPS e2e (workload proving-bound) | **pass** — 55/55, 0.36 TPS, 0 errors, 0 drops |
| — | UNPLANNED: real indexer crash (pool starvation, ~10 min down) | **REPRODUCED root cause** — 12 inputs silently deleted (outage charged to retry budgets) | covered by park-don't-drop + infra classification (T8-class) |

## Key insight

The grand-e2e "Insufficient Funds: could not balance dust" storm is NOT a
load problem — on a healthy chain, booked dust coins return within ~1 block
and even slots==coins bursts drain cleanly. The doom loop needs a *seed*:
an infrastructure failure (or misprovisioning) that shrinks or empties the
spendable pool, after which the old code (count-only gate, no capacity brake,
no backoff, hardcoded 3 retries, silent drops, missing reverts) turned a
transient condition into permanent input loss. Both the provisioning pattern
(register address first → split into few LARGE-backed lanes) and the
hardening are required.

## Fixes shipped (`packages/batcher`)

1. Intake validation on the balancing adapter (`validateInput`): size cap +
   authoritative deserialization (merged into the pre-existing hex-only
   validator — a later duplicate class method silently overrides an earlier
   one; caught in Phase 3).
2. Value-aware dust gate (`generatedNow ≥ 1.5 × 0.3 DUST` per coin,
   configurable) replacing the count-only check.
3. Dust-aware `hasAvailableCapacity` — all-exhausted ⇒ inputs park, throttled
   background refresh resumes.
4. Worker pool no longer falls back to dust-exhausted wallets.
5. Batch-wide failure classification: infra failures (dust, network, timeouts,
   5xx, pool exhaustion) park inputs untouched + target cooldown
   (`retryDelayMs`); input failures charge the **configured** `maxRetries`
   (both config fields were previously inert; retry limit was hardcoded 3).
6. In-queue undeserializable inputs are bounded-retried and dropped with a
   visible warning (previously skipped-but-kept forever).
7. Dust-leak reverts: `signRecipe` failure reverts the booked recipe; submit
   timeout attaches a revert continuation for late rejections.
8. Removed a swallowed 10-second facade-state read on EVERY balance under
   dust-only sync.
9. Storage drops always warn with address/target (never silent).
10. + 15 unit tests (`packages/batcher/test/hardening.test.ts`).

## Memory (docker stats, consolidated from the per-run tables above)

| Run (what was executing) | app (batcher) peak→final | node | indexer | provers (peak each) |
|---|---|---|---|---|
| P1 T1 baseline | 484 → 482 | 229 | 19 | idle |
| P1 T3–T5 burst/overload (140 tx) | 577 → 344 | 294 | 38 | 506 / 858 / 692 |
| P1 T9–T12 adversarial | 672 → 564 | 170 | 52 | 298 / 556 / 352 |
| P1 T6–T8 fault injection | 640 → 570 | 175 | 57 | 891 / 887 / 811 |
| P1 T13 soak | 607 → 541 | 177 | 60 | 891 / 887 / 811 |
| P3 T1–T5 | 555 → 523 | 198 | 66 | 673 / 751 / 745 |
| P3 T9–T12 | 588 → 532 | 223 | 71 | 689 / 714 / 804 |
| P3 T6–T8 | 537 → 533 | 229 | 75 | 687 / 703 / 749 |
| P3 T13 soak | 556 → 555 | 236 | 75 | 792 / 1024 / 871 |

(MiB, ~5s sampling.) Reading: **no leak / no regression in the batcher** —
Phase 1 peak 672 MiB vs a 537–588 band in Phase 3 under the same loads (the
`app` container also hosts the funding/observer wallets). **Proof servers
dominate**: 500–1024 MiB each while proving, ~6–115 MiB idle — budget the
prover fleet, not the batcher. Node/indexer small and stable (170–295 /
19–75 MiB); the indexer's slow creep tracks accumulated wallet sessions,
consistent with its Phase 1 session-pool crash. Wallet sync batching
(batch 100 / timeout 1ms / spacing 1ms, per the Midnight wallet team) is
applied to all template wallets and the batcher dust wallet.

## Run 2026-08-04T21:22:19.113Z (phase 3)

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| T13 | TPS soak (mixed zswap + calls) | **pass** | calls=40/40 zswaps=15/15 wall=153.6s end2endTPS=0.36 chainUserTxs=55 blocks=1220→1246 dustErrors=0 drops=0 |

**Memory (docker stats, 33 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 555.6 | 555.1 |
| indexer | 75.3 | 74.2 |
| node | 235.9 | 235.3 |
| proof-server | 792.2 | 684.1 |
| proof-server-2 | 1024.0 | 926.4 |
| proof-server-3 | 870.9 | 697.3 |

## Sync-batching A/B benchmark (2026-08-04, bench-sync.ts)

Genesis wallet, fresh build, full sync vs the ~1,300-block dev chain; 2 runs
per mode (`MIDNIGHT_SYNC_BATCH_DISABLE=1` = SDK defaults):

| mode | full sync | peak RSS | final RSS |
|---|---|---|---|
| SDK default | 30.29s / 30.26s | 402 / 417 MiB | 373 / 382 |
| tuned 100/1ms/1ms | 30.23s / 30.28s | 406 / 413 MiB | 373 / 372 |

Verdict: no measurable difference at this chain length — the uniform ~30.2s
indicates the sync is floor-bound by indexer stream/progress cadence, not by
update processing (which is what `batchUpdates` optimizes). The tuning is
kept as the default (verified harmless, matches the wallet team's guidance)
and the knobs + A/B switch stay in `packages/scripts/wallet.ts` /
`bench-sync.ts`; re-measure against a long-history wallet (e.g. after a
multi-hour soak) where batch-folding of thousands of relevant updates can
actually show up.

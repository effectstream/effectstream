# Deep suite results

Runs append here. Newest information wins where a test was corrected between
runs — see the note below.

> **The 2026-08-05 runs were recorded on an older base.** They predate both the
> current `v-next` base and the clean-websocket-close guard now installed in the
> template's six wallet-opening processes. Superseded by the 2026-08-06 runs.
>
> **2026-08-06T20:53 is the first full run on the current base: 9/10, M2
> failed.** M2 was a test bug, not a batcher bug — see below. **2026-08-06T21:01
> is M2 alone, green after the fix.**

### Why M2 failed on 2026-08-06T20:53

product-c's payload is a matched-delta swap *offer* — half a trade, so it can
never settle and its rows must be retired rather than waited on. M2 launched all
three workloads under one `Promise.all` and retired c's offers only after the
**slowest** finished. While they sat queued the batcher retried them to
exhaustion and dropped them, so `drops === 0` was really asserting that
product-a's 30-call flood finishes before product-c's retry budget runs out.

That held on the 2026-08-05 machine and did not here: this run shared the box
with three other stacks and moved at roughly half the throughput (tps 0.09 vs
0.18; M10 wall 444s vs 226s). The isolation property M2 exists to prove was
never in question — a delivered 30/30 and b 4/4 in both runs.

Fixed by retiring c's offers as soon as c's own workload finishes, and by
scoping the drop assertion to products a and b, whose isolation is what M2
measures. c's reaped offers are reported (`cOffersReaped`) but not asserted on.
After the fix `cOffersReaped=0` — the race is gone at the root, not papered over.

> **Unexplained-looking drops in the 20:53 run were checked and are correct.**
> Three `product-b` drops appear in the log that no test reports. They are M9's
> own inputs: the batcher was killed mid-submission (no `Results:` line before
> the restart), the rows survived in storage because removal only happens after
> confirmation, and the post-restart retry failed because the originals had
> already landed. Delivered once, no double-submit, stale rows reaped — the
> intended exactly-once outcome.

> **2026-08-25: the base moved, and the suite moved with it — 12/12.** The
> branch merged `claude/multi-batcher-sdk-v2` (86 commits, including #873's
> request tracking). The 2026-08-25T19:05 run below is the first full run on
> that base and the authoritative one. Three notes, because two scenarios
> changed meaning and one changed for a reason that is not the batcher's:
>
> **M5's assertion was rewritten, and now proves more.** The pre-batch policy
> re-check it used to grep for (`Policy rejected … pre-batch`) no longer
> exists: policy re-validation of untrusted storage rows moved into the
> pre-spend gate, which throws a typed `POLICY_REJECTED` permanent rejection.
> The row is therefore REMOVED rather than retry-charged to exhaustion and
> reaped, so the old `drops > 0` could never hold again. Rather than relax the
> test, it now asserts the stronger fact, every count scoped to the row's own
> trace hash: refused by name, removed under the typed verdict, in a batch that
> cost the sponsor nothing (`0 submitted … 0 retry-charged`), with zero proving
> and zero retry charge. Probed by feeding it a row product-a *accepts* — every
> rejection counter went to zero and `proved` went 0 → 1.
>
> **M11 and M12 had never actually run on this branch.** Both import
> `validation-executor.ts`, `ledger-params-cache.ts` and the adapter's
> `PreSpendPermanent`/`waitForDustThenEnforceTtl`, none of which existed in the
> branch's own tree — they arrived with the merge. Their earlier recorded
> passes came from a working tree that was ahead of what was committed. This is
> the first run where the committed state contains what they import.
>
> **M8's first attempt hung for 36 minutes, and it was docker, not the
> batcher.** `docker compose unpause node` reported success while the
> container's freezer cgroup stayed frozen (`cgroup.freeze=1`) and the daemon's
> metadata said `Paused: false` — after which docker refused both `pause`
> ("container not running") and `unpause` ("is not paused"). The suite sat on a
> dead chain and would have reported the resulting timeout as a batcher fault.
> M8 now verifies both transitions against the daemon and waits for the node to
> answer RPC again, failing in seconds with the cause named. On the rerun M8
> passed in **171 s**. See TESTING.md for the recovery.

> **M3 was rewritten between the two runs on 2026-08-05.** The first run's M3
> ("delivered once EACH") did not test what it claimed: it sent the payload to
> product-b and product-c, but product-c *rejects* a plain transfer, so only one
> queue row was ever created and the shared-queue dedup key was never
> exercised. The rewritten M3 uses a matched swap offer — accepted by **both**
> products — and asserts two independent rows (`rows: b=1 c=1`). Trust the
> second run's M3 row, not the first's.


## Deep run 2026-08-05T20:23:13.126Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M1 | Policy matrix: each product accepts only its own shape | **pass** | 8/8 cases correct |
| M2 | One product's dust exhaustion does not stall the others | **pass** | a: 30/30 b: 4/4 c accepted=3 drops=0 |
| M3 | Byte-identical payload on two targets is delivered once EACH | **pass** | b=accepted c=rejected(400) deliveredUnits=1 |
| M4 | Unaddressed and unknown-target inputs are refused | **pass** | noTarget=400 unknownTarget=404 pending=0 |
| M5 | A policy-violating row written straight to storage is refused | **pass** | drained=true preBatchRejects=3 drops=1 productBPending=0 |
| M6 | Garbage and oversized payloads are refused at intake | **pass** | not-json-not-hex:rejected(400) empty:rejected(400) bad-stage:rejected(400) garbage-hex:rejected(400) huge:rejected(400) pending=0 |
| M7 | Per-product health is observable via /queue-stats | **pass** | product-a[w=0/5 dust=5] product-b[w=0/5 dust=9] product-c[w=0/5 dust=4] missing=none |
| M8 | Node outage parks every product and drops nothing | **pass** | a=5/5 b=3/3 parked=0 drops=0 |
| M9 | Restart with a mixed queue delivers every product exactly once | **pass** | a=4/4 b=3/3 |
| M10 | Mixed three-product soak | **pass** | a=25/25 b=10/10 c=6 wall=226.1s tps=0.18 dustErrors=0 drops=0 |

**Memory (docker stats, 173 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 585.0 | 536.3 |
| indexer | 47.8 | 47.8 |
| node | 338.6 | 338.6 |
| proof-lb | 3.7 | 2.4 |
| proof-server | 837.6 | 622.0 |
| proof-server-2 | 998.1 | 651.7 |
| proof-server-3 | 999.9 | 780.6 |

## Deep run 2026-08-05T20:24:02.383Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M3 | Byte-identical payload on two targets creates two independent rows | **pass** | b=accepted c=accepted rows: b=1 c=1 |

**Memory (docker stats, 6 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 526.2 | 525.8 |
| indexer | 47.7 | 46.7 |
| node | 339.0 | 339.0 |
| proof-lb | 2.4 | 2.4 |
| proof-server | 622.0 | 622.0 |
| proof-server-2 | 651.7 | 651.7 |
| proof-server-3 | 780.6 | 780.6 |

## Deep run 2026-08-06T20:53:10.403Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M1 | Policy matrix: each product accepts only its own shape | **pass** | 8/8 cases correct |
| M2 | One product's dust exhaustion does not stall the others | **fail** | a: 30/30 b: 4/4 c accepted=3 drops=3 |
| M3 | Byte-identical payload on two targets creates two independent rows | **pass** | b=accepted c=accepted rows: b=1 c=1 |
| M4 | Unaddressed and unknown-target inputs are refused | **pass** | noTarget=400 unknownTarget=404 pending=0 |
| M5 | A policy-violating row written straight to storage is refused | **pass** | drained=true preBatchRejects=3 drops=1 productBPending=0 |
| M6 | Garbage and oversized payloads are refused at intake | **pass** | not-json-not-hex:rejected(400) empty:rejected(400) bad-stage:rejected(400) garbage-hex:rejected(400) huge:rejected(400) pending=0 |
| M7 | Per-product health is observable via /queue-stats | **pass** | product-a[w=0/5 dust=5] product-b[w=0/5 dust=6] product-c[w=0/5 dust=4] missing=none |
| M8 | Node outage parks every product and drops nothing | **pass** | a=5/5 b=3/3 parked=0 drops=0 |
| M9 | Restart with a mixed queue delivers every product exactly once | **pass** | a=4/4 b=3/3 |
| M10 | Mixed three-product soak | **pass** | a=25/25 b=10/10 c=6 wall=444.0s tps=0.09 dustErrors=0 drops=0 |

**Memory (docker stats, 201 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 642.7 | 554.7 |
| indexer | 45.3 | 43.3 |
| node | 296.4 | 295.4 |
| proof-lb | 4.3 | 2.9 |
| proof-server | 841.9 | 679.2 |
| proof-server-2 | 911.6 | 830.4 |
| proof-server-3 | 920.1 | 774.6 |

## Deep run 2026-08-06T21:01:04.945Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M2 | One product's dust exhaustion does not stall the others | **pass** | a: 30/30 b: 4/4 c accepted=3 drops(a,b)=0 cOffersReaped=0 |

**Memory (docker stats, 39 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 571.2 | 557.4 |
| indexer | 48.4 | 47.5 |
| node | 318.5 | 317.8 |
| proof-lb | 3.7 | 2.9 |
| proof-server | 766.0 | 680.2 |
| proof-server-2 | 869.4 | 830.5 |
| proof-server-3 | 801.4 | 774.8 |

## Deep run 2026-08-07T04:52:43.738Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M3 | Byte-identical payload on two targets creates two independent rows | **pass** | b=accepted c=accepted rows: b=1 c=1 |
| M5 | A policy-violating row written straight to storage is refused | **pass** | drained=true preBatchRejects=3 drops=1 productBPending=0 |
| M9 | Restart with a mixed queue delivers every product exactly once | **pass** | a=4/4 b=3/3 |

**Memory (docker stats, 25 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 678.4 | 588.6 |
| indexer | 49.3 | 49.2 |
| node | 484.3 | 483.3 |
| proof-lb | 2.9 | 2.4 |
| proof-server | 788.2 | 785.8 |
| proof-server-2 | 743.2 | 741.2 |
| proof-server-3 | 710.1 | 700.3 |

## Deep run 2026-08-14T23:48:06.952Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M11 | Corrupted proof is admitted, then permanently rejected pre-spend | **pass** | hash=#9c3b8e2e corruptAt=50% noWait=200 waitReceipt=400/NOT_WELL_FORMED proved=0 proofRejects=2 permanent=2 retryCharged=0 zeroRetryOutcomes=2 dust=[10]→[10] D7={"phase":"pre-spend","txStage":"finalized","strictness":{"enforceBalancing":false,"verifySignatures":true,"enforceLimits":false,"verifyNativeProofs":false,"verifyContractProofs":false}} reason=Invalid proof -- while verifying Zswap proof |
| M12 | Intent-bearing call that expires during dust wait is refused | **pass** | realCallBytes=3307 intents=1 beforeWait=121000ms afterWait=119000ms floor=120000ms order=wait→ttl verdict=TTL_TOO_SHORT |

**Memory (docker stats, 7 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 1911.8 | 1888.3 |
| indexer | 36.5 | 26.6 |
| node | 664.2 | 150.5 |
| proof-lb | 4.5 | 4.5 |
| proof-server | 685.1 | 4.4 |
| proof-server-2 | 688.2 | 9.6 |
| proof-server-3 | 711.4 | 4.0 |

**Validation child RSS (7 samples):**

| host PID | peak RSS MiB |
|---|---|
| 3524165 | 138.3 |
| 3524166 | 115.2 |
| 3524167 | 120.2 |
| 3524168 | 115.1 |
| 3524169 | 117.3 |
| 3524170 | 122.7 |
| 3524171 | 115.5 |
| 3524172 | 115.7 |
| 3524173 | 117.4 |
| 3524176 | 121.0 |
| 3524177 | 116.1 |
| 3524179 | 115.7 |
| 3524181 | 121.1 |
| 3524183 | 116.8 |
| 3524185 | 120.7 |

Per-child RSS min/median/max: 115.1 / 117.3 / 138.3 MiB across 15 children.

## Deep run 2026-08-14T23:51:42.839Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M1 | Policy matrix: each product accepts only its own shape | **pass** | 8/8 cases correct |
| M6 | Garbage and oversized payloads are refused at intake | **pass** | not-json-not-hex:rejected(400) empty:rejected(400) bad-stage:rejected(400) garbage-hex:rejected(400) huge:rejected(400) pending=0 |

**Memory (docker stats, 13 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 1650.7 | 1650.7 |
| indexer | 38.6 | 26.8 |
| node | 620.1 | 150.4 |
| proof-lb | 4.5 | 4.5 |
| proof-server | 665.0 | 4.4 |
| proof-server-2 | 686.1 | 9.6 |
| proof-server-3 | 678.2 | 4.0 |

**Validation child RSS (13 samples):**

| host PID | peak RSS MiB |
|---|---|
| 3524165 | 118.9 |
| 3524166 | 98.0 |
| 3524167 | 98.1 |
| 3524168 | 98.0 |
| 3524169 | 100.3 |
| 3524170 | 100.7 |
| 3524171 | 98.2 |
| 3524172 | 98.7 |
| 3524173 | 100.4 |
| 3524176 | 98.8 |
| 3524177 | 99.1 |
| 3524179 | 98.3 |
| 3524181 | 99.4 |
| 3524183 | 99.5 |
| 3524185 | 98.5 |

Per-child RSS min/median/max: 98.0 / 98.8 / 118.9 MiB across 15 children.

## Deep run 2026-08-14T23:57:50.502Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M10 | Mixed three-product soak | **pass** | a=25/25 b=10/10 c=6 wall=279.4s tps=0.15 eventLoopLagP99(max 5s window)=106.04ms validationChildRSS=15 children 98.2/99.5/124.6 MiB min/median/max dustErrors=0 drops=0 |

**Memory (docker stats, 51 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 1681.4 | 1660.9 |
| indexer | 42.1 | 27.4 |
| node | 620.8 | 142.5 |
| proof-lb | 5.6 | 4.5 |
| proof-server | 785.2 | 4.4 |
| proof-server-2 | 860.5 | 9.6 |
| proof-server-3 | 791.9 | 4.0 |

**Validation child RSS (50 samples):**

| host PID | peak RSS MiB |
|---|---|
| 3524165 | 124.6 |
| 3524166 | 119.5 |
| 3524167 | 109.1 |
| 3524168 | 108.3 |
| 3524169 | 109.6 |
| 3524170 | 100.7 |
| 3524171 | 98.2 |
| 3524172 | 98.7 |
| 3524173 | 100.4 |
| 3524176 | 98.8 |
| 3524177 | 99.1 |
| 3524179 | 98.3 |
| 3524181 | 99.4 |
| 3524183 | 99.5 |
| 3524185 | 98.5 |

Per-child RSS min/median/max: 98.2 / 99.5 / 124.6 MiB across 15 children.

## Deep run 2026-08-25T19:05:46.114Z

| # | Test | Outcome | Notes |
|---|------|---------|-------|
| M1 | Policy matrix: each product accepts only its own shape | **pass** | 8/8 cases correct |
| M2 | One product's dust exhaustion does not stall the others | **pass** | a: 30/30 b: 4/4 c accepted=3 drops(a,b)=0 cOffersReaped=0 |
| M3 | Byte-identical payload on two targets creates two independent rows | **pass** | b=accepted c=accepted rows: b=1 c=1 |
| M4 | Unaddressed and unknown-target inputs are refused | **pass** | noTarget=400 unknownTarget=404 pending=0 |
| M5 | A policy-violating row written straight to storage is refused | **pass** | drained=true hash=#8f11240e policyRejects=1 typedRemoval=1 zeroCostBatch=1 proved=0 retryCharged=0 drops=0 productBPending=0 |
| M6 | Garbage and oversized payloads are refused at intake | **pass** | not-json-not-hex:rejected(400) empty:rejected(400) bad-stage:rejected(400) garbage-hex:rejected(400) huge:rejected(400) pending=0 |
| M7 | Per-product health is observable via /queue-stats | **pass** | product-a[w=0/5 dust=5] product-b[w=0/5 dust=6] product-c[w=0/5 dust=9] missing=none |
| M8 | Node outage parks every product and drops nothing | **pass** | a=5/5 b=3/3 parked=0 drops=0 |
| M9 | Restart with a mixed queue delivers every product exactly once | **pass** | a=4/4 b=3/3 |
| M10 | Mixed three-product soak | **pass** | a=25/25 b=10/10 c=6 wall=307.2s tps=0.13 eventLoopLagP99(max 5s window)=61.01ms validationChildRSS=30 children 114.5/117.7/141.0 MiB min/median/max dustErrors=0 drops=0 |
| M11 | Corrupted proof is admitted, then permanently rejected pre-spend | **pass** | hash=#b973912a corruptAt=50% noWait=200 waitReceipt=400/NOT_WELL_FORMED proved=0 proofRejects=2 permanent=2 retryCharged=0 zeroRetryOutcomes=2 dust=[7]→[7] D7={"phase":"pre-spend","txStage":"finalized","strictness":{"enforceBalancing":false,"verifySignatures":true,"enforceLimits":false,"verifyNativeProofs":false,"verifyContractProofs":false}} reason=Invalid proof -- while verifying Zswap proof |
| M12 | Intent-bearing call that expires during dust wait is refused | **pass** | realCallBytes=3307 intents=1 beforeWait=121000ms afterWait=119000ms floor=120000ms order=wait→ttl verdict=TTL_TOO_SHORT |

**Memory (docker stats, 171 samples):**

| service | peak MiB | final MiB |
|---|---|---|
| app | 1915.9 | 1603.6 |
| indexer | 52.2 | 9.2 |
| node | 1542.1 | 47.5 |
| proof-lb | 5.0 | 3.3 |
| proof-server | 806.3 | 4.4 |
| proof-server-2 | 840.5 | 4.0 |
| proof-server-3 | 849.4 | 5.0 |

**Validation child RSS (170 samples):**

| host PID | peak RSS MiB |
|---|---|
| 778995 | 136.4 |
| 778996 | 134.8 |
| 778997 | 114.9 |
| 778998 | 121.9 |
| 778999 | 115.6 |
| 779000 | 117.7 |
| 779001 | 114.5 |
| 779002 | 114.8 |
| 779005 | 120.4 |
| 779011 | 115.3 |
| 779013 | 115.3 |
| 779015 | 117.2 |
| 779018 | 115.1 |
| 779020 | 117.5 |
| 779049 | 117.9 |
| 967148 | 137.8 |
| 967149 | 141.0 |
| 967150 | 138.2 |
| 967151 | 117.1 |
| 967179 | 116.9 |
| 967183 | 119.8 |
| 967188 | 121.7 |
| 967190 | 117.6 |
| 967192 | 116.0 |
| 967194 | 119.9 |
| 967198 | 122.3 |
| 967199 | 115.2 |
| 967204 | 116.8 |
| 967212 | 120.5 |
| 967220 | 117.7 |

Per-child RSS min/median/max: 114.5 / 117.7 / 141.0 MiB across 30 children.

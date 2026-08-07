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

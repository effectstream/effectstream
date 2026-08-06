# Deep suite results

Runs append here. Newest information wins where a test was corrected between
runs — see the note below.

> **The 2026-08-05 runs below were recorded on an older base and have not been
> reproduced since.** They predate both the rebase onto current `v-next` and the
> clean-websocket-close guard now installed in the template's six
> wallet-opening processes. Treat them as indicative of the suite's shape, not
> as a green result for this tree. Regenerate with `bun run test:deep` before
> citing them.

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

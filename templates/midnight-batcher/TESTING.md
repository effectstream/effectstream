# Adversarial test checklist — midnight-balancer batcher

This template exists to reproduce, then verify the fix for, the batcher's
`Insufficient Funds: could not balance dust` doom loop observed in grand-e2e
runs (~1000 occurrences: 60s wait → doomed balance → re-queue → silent drop
after 3 retries).

## Background: why the loop happens (root causes under test)

1. **Count-vs-value gate** — `waitForDustAvailability` checks
   `availableCoins.length > 0`; the wallet SDK's coin selection needs
   per-coin *generated value* ≥ fee + 0.3 DUST overhead. Fresh coins exist
   with ~0 value → gate passes, balance fails.
2. **Slots 1:1 with dust UTXOs** — one full batch drains every dust coin
   (spent coins leave local state instantly); every following batch is doomed
   until on-chain confirmation.
3. **No brake, no backoff, silent drops** — `hasAvailableCapacity()` ignores
   dust; the worker pool bypasses its own exhaustion filter; retry count is
   hardcoded to 3 with zero delay; at 3 the input is silently deleted.
4. **Dust leaks** — failures between balance and finalize never call
   `revertTransaction`; the 90s submit-timeout path strands booked dust.
5. **`dust-only` sync stall** — every balance burns a swallowed 10s timeout
   reading the facade's combined state.

Dust facts the fixes rely on: fees are paid in dust; each dust coin backs
exactly ONE in-flight tx (parallelism = dust-coin count); every NIGHT UTXO of
a dust-registered address generates its own dust stream (register the address
first, then split — this template funds 20 large UTXOs); the correct readiness
signal is **coin count + per-coin generated value**, never `balance > 0`.

## The checklist

Run with the stack up (`docker compose up -d`, wait for the batcher):

```bash
bun run test:adversarial -- --phase 1     # against the CURRENT batcher (reproduce)
bun run test:adversarial -- --phase 3     # against the FIXED batcher (assert)
bun run test:adversarial -- --phase 1 --only T3,T5
```

Results are appended to `TESTING-RESULTS.md` per run.

| # | Test | Method | Phase 1 expectation (current batcher) | Phase 3 requirement (fixed batcher) |
|---|------|--------|----------------------------------------|--------------------------------------|
| T1 | Baseline zswap | 1 feeless shielded transfer through the balancer; sink balance is ground truth | passes | passes |
| T2 | Baseline contract call | 1 captured `increment()` call; on-chain counter is ground truth | passes | passes |
| T3 | Burst > slots (dust drain) | 3× slot-count calls at once | `could not balance dust` storm + 60s waits | inputs park while coins pend; no doomed attempts; all land; 0 errors |
| T4 | Count-vs-value trap | log analysis of T3: gate passed (`dust available`) yet balance failed | reproduced | value-aware gate: 0 balance-dust errors |
| T5 | Silent drop | 4× slot-count sustained; counter delta vs accepted; `Dropping input` grep | inputs silently deleted | nothing dropped for infra reasons; all delivered |
| T6 | Dust leak on mid-pipeline failure | stop all proof servers mid-batch, restart, watch batcher-wallet dust-coin count (observer wallet on same seed) | coin count shrinks and stays down | coins recovered / revert invoked; pool returns to target |
| T7 | Submit-timeout leak | pause node through the 90s submit timeout, unpause | booked dust stranded (observe) | dust recovered once outcome known |
| T8 | Node outage resilience | pause node 60s mid-run | error storm; possible drops | parks, recovers, 0 drops, all delivered |
| T9 | Poison input | valid-JSON garbage tx hex + 4 good calls | poison accepted, then skipped forever in queue (stuck pending) | good ones unaffected; poison rejected or failed with explicit reason; queue drains to 0 |
| T10 | Duplicate submission | same finalized tx hex POSTed twice | observe (IntentAlreadyExists / dust waste) | exactly-once effect on chain; deterministic handling |
| T11 | Restart durability | `docker compose restart app` with non-empty queue | observe (JSONL reload) | pending inputs survive; no double-submit |
| T12 | Garbage input | non-JSON, empty, bad txStage, oversized | observe what the door accepts | rejected at `/send-input`; batcher stays healthy |
| T13 | TPS soak | 40 calls + 15 zswaps concurrently; wall-clock + block-scan | measure baseline; expect stalls | 0 balance-dust errors, 0 drops, all delivered; TPS reported |

## Memory benchmarking

Every suite run samples `docker stats` for all stack containers (~5s interval)
and appends peak + final memory per service to the run's section in
`TESTING-RESULTS.md`. The `app` container (batcher + its wallet) is the
headline number; node / indexer / proof servers are recorded for stack sizing.
Phase 3 must show no unexplained memory growth vs Phase 1 under the same load
(leak check across the T13 soak).

## Judgement notes

- **Ground truth is on-chain**: the counter's commutative `round` value (calls)
  and the sink wallet's shielded balance (zswaps). Batcher self-reporting is
  only used as *evidence*, never as the verdict.
- T6/T7 dust-coin observations use a read-only wallet built from the batcher's
  seed. Note dust's on-ledger grace period is 3 hours — "recovered" in-test
  means the adapter reverts/re-books correctly and throughput continues, not
  that the ledger coin is re-spendable instantly.
- The 18400-block host ports are fixed in `docker-compose.yml`; the suite and
  workloads default to them (`packages/scripts/env.ts`).

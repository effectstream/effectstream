# perf — Effectstream node load test

A standalone harness that boots a real Effectstream node, floods a chain with
high event volume, and measures how the node behaves under load. Modeled on
`e2e/evm/` but trimmed to a single primitive.

> **Manual-only — never part of CI.** This suite is *not* in the `e2e/runner.ts`
> suites array and is *not* referenced by any GitHub Actions workflow. A bare
> `bun run e2e/runner.ts` (and CI) behaves exactly as it would without it. Run it
> explicitly with the commands below. Keeping the expensive 1M-entry run off CI is
> deliberate.

## What it measures

1. **Sync lag** over time, at two distinct pipeline stages (fetch → merge →
   apply). These can differ by orders of magnitude, so we track both:
   - **Apply lag — the real one:** `now − timestamp of the last *applied* block`,
     read from `/debug/metrics` (`applied.lagSeconds`). This is what the node's
     own heartbeat prints as `lag: X.Xs` and the figure that matters under
     write/apply-bound load.
   - **Fetch lag:** `mainNtp.buf × (blockTimeMS / 1000)` — the fetched-but-not-
     yet-merged page count times seconds-per-block (the heartbeat's `buf`). It
     only reflects the *fetch* stage and stays ~0 when the node is apply-bound,
     so it can read far lower than the real lag. Useful only for fetch-bound runs.

   The harness also records the **apply backlog** (`fetched_page − synced_page`
   from `/block-heights`): effectstream blocks fetched but not yet applied.
2. **Throughput** — entries/sec and blocks/sec, plus total time to drain.
3. **Peak memory** — node process RSS (peak and final), to catch growth/leaks.
4. **API latency** — p50/p95/max of `/health`, `/block-heights`, `/debug/metrics`
   sampled once per second under load.

## How it works

- **Data generation:** the `Counter` contract's `bulkIncrement(n)` emits the
  existing `changedCount` event `n` times in a single tx, so one tx ⇒ `n` parsed
  entries. This isolates the node's fetch/parse/write pipeline from
  tx-submission overhead. The existing `EvmCounterPrimitive` and `counter-stm`
  transition write one row to `counter_results` per event.
- **Metrics collection:** the node exposes a lightweight, in-memory
  `/debug/metrics` endpoint (gated by `ENABLE_DEV_AND_DEBUG_ENDPOINTS`, set by
  the launcher). It returns `process.memoryUsage()` plus per-protocol `buf` and
  `ownBlockNumber` — no DB queries on the hot path. The sampler in `metrics.ts`
  polls it once/sec (plus per-endpoint latency and a `count(*)` of
  `counter_results`) and records a full time series, so the report shows curves
  over time — not just peaks.
- **Two load phases:**
  - **Phase A — catch-up burst:** fire all txs as fast as possible (fire-and-forget,
    explicit nonces) to build a backlog, then measure how fast the node drains it.
  - **Phase B — steady-state:** submit at a fixed rate for a fixed duration and
    measure sustained behaviour.
- **Mining mode:** before the load phases the harness switches Hardhat off
  auto-mine and onto **interval mining** (`evm_setAutomine(false)` +
  `evm_setIntervalMining(PERF_MINE_INTERVAL_MS)`). Hardhat's default auto-mine
  produces one block per tx but rejects out-of-order nonces, so a concurrent
  burst drops ~a quarter of its txs as "nonce too high". Interval mining queues
  the whole burst in the mempool and mines it in batches, so **every** tx lands.
  Set `PERF_MINE_INTERVAL_MS=0` to keep the default auto-mine instead.
- **Backpressure pressure mode (issue #1) — DEFAULT ON:** the fetch loop has no
  backpressure, so during deep catch-up a chain's in-memory buffer races toward
  the whole backlog while the merge drains one block per DB txn (OOM risk). On a
  **fresh DB** the harness seeds the NTP `startTime` `PERF_BACKPRESSURE_LAG_S`
  seconds in the **past** (default `600`), so the node boots already behind and
  spends Phase A catching up. This surfaces in the **apply lag / apply backlog**
  charts (how far behind the apply stage is). Set `PERF_BACKPRESSURE_LAG_S=0` to
  opt out and restore the original start-at-now behaviour.
  - **This changes the default run into a deep-catch-up run** (it replays the
    seeded empty backlog before reaching live EVM data). Larger ⇒ deeper catch-up.
  - **Caveat — the live perf node does *not* balloon the buffer-page count.** Two
    reasons: (1) the NTP fetcher self-throttles (it makes a real `getTime()` call
    per fetch chunk, so `mainNtp.buf` fills at ≈ drain rate), and (2) the seeded
    historical blocks are *empty*, so they drain faster than the node finishes
    starting up — the transient spike is gone before the Phase-A sampler begins.
    So the live-run buffer chart usually stays flat; what it *does* show is the
    deep catch-up (apply lag) and any memory growth.
  - **To make the live node demonstrate the cap, set `PERF_APPLY_DELAY_MS>0`.** It
    slows drain below fetch, so every chain's `buf` climbs to its `cap` and
    plateaus there (instead of unbounded), and `/debug/metrics` reports the cap
    engaging — `cap`, `bufHighWater`, `pausedNow`, `pauses`, `pausedMs` per
    protocol. `pauses > 0` is the direct "backpressure fired" signal; a bounded
    `buf`/RSS under sustained delay is the fix working. (Without the fix the same
    delay would let `buf`/RSS climb without bound.)
  - **The authoritative buffer-growth curve comes from the in-process measurement,
    not the live run.** The deterministic test
    `packages/node-sdk/runtime/test/reproduction/buffering.test.ts` exercises the
    fetch backpressure cap for both the buffer (1a) and head-of-line blocking (1b)
    and writes `buffering-{1a,1b}-<stamp>.json` into `e2e/perf/results/`. With the
    Option B′ cap in place it now asserts the buffer stays **bounded** at the cap
    (~3–4k) instead of the pre-fix ~49–50k balloon (see
    `ISSUE-1-BACKPRESSURE-BASELINE.md`); for 1b, production still stalls at the slow
    chain's tip but the sibling buffer is capped. **This report auto-loads the
    latest such artifacts** and renders them in a dedicated **Backpressure —
    in-process measurement** section at the top. Run that test first
    (`bun test packages/node-sdk/runtime/test/reproduction/buffering.test.ts`) to
    populate it.

## Running

### Smoke (PGLite, small N) — validates wiring

```bash
bun run e2e/perf/run-tests.ts
```

Defaults to PGLite (embedded, single-connection) and `TOTAL=10000`. Good for
confirming the harness boots, txs land, `counter_results` hits the target, and
the report prints. **Not** representative of real throughput — PGLite serializes
writes and will log `[DB Mutex] ... critical error` contention warnings under the
burst. Use real Postgres for any meaningful numbers.

### Full run (real Postgres, 1M entries)

Point the suite at a **running** Postgres on 5432. Any instance works — e.g.
`brew services start postgresql@18`, a Docker container, or a managed DB. Then:

```bash
PGLITE=false ALLOW_NO_PG_IVM=true \
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PW=postgres DB_NAME=perf \
TOTAL=100000 EVENTS_PER_TX=200 \
  bun run e2e/perf/run-tests.ts
```

The driver **drops and recreates `DB_NAME` automatically** before each external
run (via an admin connection to the `postgres` maintenance DB), so every run
starts from a clean schema — no manual `createdb` needed. This is skipped for
reserved DBs (`postgres`/`template0`/`template1`), so use a dedicated name like
`perf`. Set `PERF_DB_RESET=0` to keep the existing DB instead.

The auto-reset cleans the **DB** but not the **chain**, so right after deploy the
driver also asserts the on-chain counter is **0** and aborts otherwise — a
fast-fail guard against an orphaned Hardhat from a previous (often *failed*) run
on 8545 silently feeding the node a stale, much larger event history. If it
trips, stop stale processes (`bun packages/build-tools/orchestrator/src/cli.ts
stop`) and retry.

> **`ALLOW_NO_PG_IVM=true`** — on startup the engine's `detectCapabilities()`
> runs `CREATE EXTENSION pg_ivm`; on a Postgres that doesn't ship `pg_ivm`
> (managed RDS, a stock Docker image) that fails and the node won't boot. This
> flag permits the plain-VIEW fallback. It's harmless when `pg_ivm` *is* present
> (Homebrew `postgresql@18` bundles it — the extension is still used), so set it
> unconditionally.
>
> **User/auth caveat:** the values above assume a `postgres` superuser. A stock Homebrew Postgres instead
> has no `postgres` role — its superuser is your OS username. Either use
> `DB_USER=$(whoami) DB_PW=` (trust auth), or create a `postgres` superuser once:
> `psql -d postgres -c "CREATE ROLE postgres LOGIN SUPERUSER PASSWORD 'postgres';"`
> (SUPERUSER is required so the node can `CREATE EXTENSION pg_ivm`, and the driver
> can drop/recreate `DB_NAME`). You don't need to `createdb` the target yourself —
> the driver does it (see `PERF_DB_RESET` above).

`TOTAL=1_000_000` with `EVENTS_PER_TX=200` is ~5000 txs. Under interval mining
(the default) those txs batch into blocks mined every `PERF_MINE_INTERVAL_MS`, so
the EVM block count tracks chain *time*, not tx count — expect fatter blocks than
the 1-block-per-tx auto-mine would give. The sync-lag, throughput, memory and
latency measurements are unaffected by block fatness. If you specifically want
~1 block per tx, set `PERF_MINE_INTERVAL_MS=0` (auto-mine), but expect some burst
txs to drop and the drain targets to adjust to the count actually submitted.

### Spreading the load across blocks (realistic block sizes)

By default Phase A fires the whole burst at once. Because effectstream blocks are
time-based (the NTP main, 1 block per `blockTimeMS`) and the merge buckets EVM
data by block timestamp, an instant burst collapses **all** events into ~one
giant effectstream block — fine as a worst-case catch-up test, but unrealistic
(processing 1M events in a single block).

To spread events across many blocks, pace submission with `PERF_PHASE_A_TPS`:

- **events per block ≈ `EVENTS_PER_TX × PERF_PHASE_A_TPS`**
- **data blocks ≈ submission seconds ≈ `total_txs / PERF_PHASE_A_TPS`**

EVM block timestamps are **whole seconds**, so the merge resolves at most **one
data-bearing block per second** — block production caps at 1/s regardless of
`blockTimeMS`. The driver therefore auto-sets the mine interval to `blockTimeMS`
(1 block/s) in paced mode; mining faster makes Hardhat bump EVM timestamps
+1s/block, racing ahead of real time and starving the merge (the node idles, then
the drain stalls). Consequence: spreading 1M events over N blocks takes ~N seconds
(a real chain produces ~1 block/s too).

Examples (1M events, `EVENTS_PER_TX=200` ⇒ 5000 txs):

| goal | `PERF_PHASE_A_TPS` | events/block | data blocks | ~submission |
|---|---|---|---|---|
| ~500 blocks  | `10` | 2000 | ~500  | ~8 min |
| ~1000 blocks | `5`  | 1000 | ~1000 | ~17 min |

```bash
PGLITE=false ALLOW_NO_PG_IVM=true \
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PW=postgres DB_NAME=perf \
TOTAL=1000000 EVENTS_PER_TX=200 PERF_PHASE_A_TPS=10 PERF_SKIP_PHASE_B=1 \
  bun run e2e/perf/run-tests.ts
```

## Knobs (env vars)

| Var | Default | Effect |
|---|---|---|
| `TOTAL` | `10000` | Phase A target entry count |
| `EVENTS_PER_TX` | `100` | events emitted per `bulkIncrement` tx (⇒ entries/tx) |
| `PERF_TX_GAS` | `200000 + EVENTS_PER_TX×15000` | per-tx gas; raise for large `EVENTS_PER_TX` |
| `PERF_SEND_CONCURRENCY` | `200` | in-flight txs during the Phase A burst |
| `PERF_PHASE_A_TPS` | `0` | `0` = instant burst; `>0` = pace Phase A at this tx/s to spread events across blocks (see "Spreading the load") |
| `PERF_TX_MAX_ATTEMPTS` | `8` | retries per tx on transient "nonce too high" (auto-mine reorder) |
| `PERF_MINE_INTERVAL_MS` | `100` (burst) / `blockTimeMS` (paced) | Hardhat interval-mining period; `0` → auto-mine. Auto-set to `blockTimeMS` in paced mode so EVM time tracks real time (an explicit value always wins) |
| `PERF_NO_OPEN` | — | set `1` to skip auto-opening the HTML report in the browser |
| `PERF_DRAIN_STALL_S` | `120` | abort a drain if entry count makes no progress for this long |
| `PERF_SKIP_PHASE_B` | — | set `1` to run Phase A only |
| `PERF_PHASE_B_TPS` | `20` | Phase B submission rate (tx/s) |
| `PERF_PHASE_B_DURATION_S` | `30` | Phase B duration |
| `PERF_SAMPLE_INTERVAL_MS` | `1000` | metrics sampling interval |
| `PERF_NTP_BLOCK_TIME_MS` | `1000` | NTP main seconds-per-block (lag multiplier) |
| `PERF_POLLING_INTERVAL_MS` | `500` | sync protocol polling interval |
| `PERF_STEP_SIZE` | `1000` | EVM parallel fetch step size (blocks/range) |
| `PERF_BACKPRESSURE_LAG_S` | `600` | backpressure pressure mode (issue #1): on a fresh DB, seed the NTP start this many seconds in the past so the node boots behind and Phase A is a deep catch-up (apply-lag signal). `0` = off (start at "now"). Larger ⇒ deeper catch-up. The buffer-growth curve itself comes from the in-process test artifacts; see below. |
| `PERF_APPLY_DELAY_MS` | `0` | diagnostic drain throttle: sleep this many ms after each applied block, slowing drain below fetch so the per-chain buffers fill to their cap and the **backpressure fix becomes observable in the live node** (`buf` climbs to `cap` and plateaus; `pauses` on `/debug/metrics` climb). `0` = off. See below. |
| `PGLITE` | `true` | `false` → use external Postgres via `DB_*` |
| `PERF_DB_RESET` | `1` | on external PG, drop+recreate `DB_NAME` before the run; `0` to keep it |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PW` / `DB_NAME` | localhost / 5432 / postgres ×3 | external Postgres connection |
| `EFFECTSTREAM_API_PORT` | `9999` | node HTTP API port the sampler hits |

## Files

| File | Role |
|---|---|
| `run-tests.ts` | driver: lifecycle, the two load phases, console report |
| `metrics.ts` | `/debug/metrics` sampler (full time series) + console reporter |
| `report.ts` | HTML + JSON report writer (time-series charts) |
| `node.ts` | the perf node — `EvmCounterPrimitive` + `counter-stm` only |
| `config.ts` | one NTP main + one EVM parallel + the `Counter` primitive |
| `grammar.ts` | single `counter-stm` grammar entry |
| `launcher.cli.ts` | orchestrator config: (PGLite\|external PG) + Hardhat + node |

Reused unchanged: `@e2e/evm-contracts` (Counter deployment), `@e2e/evm-database`
(`counter_results` migration), `@e2e/engine` (harness), and the orchestrator's
`launch-pglite` / `launch-evm`.

## Reports

Every run produces two artifacts in `e2e/perf/results/` (git-ignored), named
`perf-<timestamp>.{html,json}`, plus the console summary below. The paths are
printed at the end of the run, and the HTML report is **opened automatically** in
your default browser (set `PERF_NO_OPEN=1` to skip).

- **HTML** — open in a browser. Per phase, line charts of: sync lag (**apply lag
  vs fetch/buf lag** overlaid — watch the gap between them), backlog (**apply
  backlog in blocks** vs `mainNtp`/`evm` buffered pages), memory (rss + heapUsed),
  block progress (fetch **tip vs applied** block — the gap is the apply lag),
  cumulative entries, and API latency over time (log scale). The report also has a
  **Backpressure — in-process measurement (issue #1)** section at the top
  (auto-loaded from the in-process test artifacts — the authoritative buffer-growth
  and head-of-line curves), plus a per-phase **Backpressure — live run** sub-block
  (the live node's buffers/memory, usually modest — see the caveat above).
  This is the view for spotting **degradation**: apply lag that rises and doesn't
  recover, memory that trends up (leak), throughput that tails off.
  Charts use Chart.js from a CDN, so rendering the HTML needs internet.
- **JSON** — the full per-tick time series + summary, for offline inspection or
  run-to-run comparison. Always usable without internet.

### Console summary

```
--- Phase: A (catch-up burst) ---
  entries/sec / blocks/sec   throughput
  peak lag (peak buf)        fetch-side: max(mainNtp.buf) × blockTimeMS/1000
  peak APPLY lag             apply-side (the real one): max(now − applied block ts)
  peak RSS (final)           node memory
  API latency (ms)           p50/p95/max per endpoint
```

Notes:
- `Expected entries` in the console header reflects `TOTAL` (Phase A's target),
  not the Phase A + Phase B grand total.
- `/debug/metrics` should stay sub-millisecond (in-memory); a high
  `/block-heights` p95 under load is expected — it's DB-backed and contends with
  the write load (especially on PGLite).
- Drain targets are based on the number of txs **actually submitted** (some may
  be dropped under extreme bursts even after retries), so a run never hangs
  waiting for entries that were never sent.
- A drain completes when every expected entry is **applied** (the `drained N/N`
  count), not when `buf` reaches 0. Under interval mining the chain keeps
  producing blocks, so the NTP main's live tip always carries a small residual
  `buf` (1-2) — a final `mainNtp buf 1` is normal, not a stuck backlog.
- While the applied count is **flat** (e.g. the node is grinding through one huge
  block), the driver prints a `...waiting at N/target` heartbeat every 10s with
  buf, derived lag, and the NTP/EVM tip block numbers. Climbing block numbers
  with a flat count means sync is alive and finalization/apply is the bottleneck
  — not a dead hang. If the count truly doesn't move for `PERF_DRAIN_STALL_S`
  (default 120s) the run aborts; raise it for very large blocks.

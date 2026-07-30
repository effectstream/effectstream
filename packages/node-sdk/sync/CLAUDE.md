# `@effectstream/sync` — how the sync service works

This package fetches data from every configured chain, interleaves it into a single
deterministic stream of **effectstream blocks** ordered by time, and hands that stream
to the runtime for state-machine execution.

> **Naming gotcha:** despite the project name and an `effect` (Effect-TS) entry in the
> root `package.json`, the sync service uses **[`effection`](https://frontside.com/effection)**,
> a generator-based structured-concurrency library. Effect-TS is **not imported anywhere**
> in source. Everywhere below, an "effect" is an `effection` `Operation<T>` — a lazy,
> cancellable computation written as a `function*` and composed with `yield*`.

## effection in 30 seconds

| effection | rough analogy |
|---|---|
| `Operation<T>` | a lazy, cancellable `async` function |
| `function*` / `yield*` | `async` / `await` |
| `spawn(op)` | fork a child task (dies with its parent scope) |
| `call(() => promise)` / `until(promise)` | `await` a Promise inside an Operation |
| `all([...ops])` | `Promise.all` |
| `createChannel()` + `each(ch)` | an async stream / `for await` |
| `conditionVariable()` (`@effectstream/utils`, `concurrency/condVar.ts`) | a monitor wait/wake |

Because every loop is `spawn`ed under the runtime's `start()` scope, cancelling the parent
tears down every fetcher, the merge, the heartbeat, and the HTTP server cleanly.

## The pipeline at a glance

```
config (syncProtocols.main + syncProtocols.parallel)
        │  genSyncProtocols()  → one SyncState per chain, main at index 0
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PER-CHAIN FETCH LOOPS              one spawn per protocol             │
│  startSync(state):  stateToInput → readData → updateState             │
│    → push Output to bufferedData (Deque)  + wake newData/newPageCondVar│
│    → lastPage kept IN-MEMORY only (no DB write; runtime owns resume)   │
│    → producerChannel.send(...)  ← NOTE: nothing consumes this today    │
└────────────────────────────────────────┬─────────────────────────────┘
                                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MERGE LOOP   startMerge()    one spawn, produces ONE ChainBlock/iter  │
│   i=0 main:   toRootOutput(front datum)  → new root block @ timestamp T│
│   i>0 parallel: wait page>T, drain buffered data ≤T via mergeDatum()   │
│   → finalizedBlockStream.send(block); then run cleanups (pop Deques)   │
└────────────────────────────────────────┬─────────────────────────────┘
                                          ▼
   runtime/src/main.ts:  for (block of each(finalizedBlockStream))
     acquire DB mutex → processFinalizedBlock (STF)
     → upsertPage(block.resumePages) + removePages(< committed) [in txn] → COMMIT
     → fire-and-forget MQTT events → each.next()
```

## The three per-chain abstractions (`src/sync-protocols/<chain>/`)

1. **Fetcher** — `BaseDataFetcher` subclass (`base/fetcher.ts`). `readData(input)` fetches a
   page-range of raw chain data → `DataFetched { output[], lastPage }`. Implements
   `PaginatedFetcher` (`getLatestPage`, `nextInterval`, `previousInterval`,
   `intervalFromStart`) for chunked pagination by `stepSize`, and optionally
   `PrimitiveFetcher` (`base/primitive.ts`: `readPrimitives` / `groupByPage`) to extract
   app-relevant primitives from raw blocks. Optionally also `ReorgDetectingFetcher`
   (`common/reorg.ts`: `getBlockHashAt`) — chains that implement it are monitored for
   reorgs, chains that don't are reported as unmonitored on `/health`.

2. **State** — `SyncState` subclass (`base/state.ts`). Holds `bufferedData` (a `denque`
   Deque of fetched-not-yet-merged data, `state.ts:50`), `lastPage` (high-water mark,
   `state.ts:70`), two CondVars (`newDataCondVar` / `newPageCondVar`, `state.ts:57-63`),
   and error/health counters. Defines the chain↔root contract:
   - `stateToInput()` — compute the next page-range to fetch (via `common/page-helpers.ts:genInputRange`)
   - `toRootPage()` — map a block → millisecond timestamp (the **merge key**)
   - `toRootOutput()` — **main only** — produce a root `ChainBlock`
   - `mergeDatum()` — **parallel only** — fold this chain's data into the root
   - `updateState()` — push outputs to the Deque and wake the CondVars. It does **not**
     persist anything: `lastPage` is in-memory only, because the fetch loop runs ahead of
     commits and its chunk-end page is not a safe resume point. The runtime is the sole
     writer of the persisted resume marker (design idea #5).

3. **types.ts** — `Input` / `Output` / `Page` aliases (+ a `Client.ts` per chain where an
   RPC client is needed).

**main vs parallel** is structural in config — `toSyncProtocolWithNetwork`
(`@effectstream/config`, `config/utils.ts`) builds the array **main-first**, then parallels —
but enforced at runtime only by thrown errors: e.g. `evm/state.ts` `toRootOutput` throws
"Only main chains create root outputs"; `ntp/state.ts` `mergeDatum` throws "Only parallel
chains merge into root". **The main chain must be at index 0.**

## The two driving loops

**`startSync(state)`** (`src/sync-protocols/orchestration/sync.ts`) spawns three tasks:
- `startAsync()` — optional background producer (websocket/gRPC subs for utxorpc; no-op
  for polled chains). **Supervised** when the state sets `hasAsyncProducer`: both a throw
  and a clean return count as failure (a producer that returns has ended its stream) and
  are restarted with capped backoff, counted in `producerRestarts`. Polled chains run
  their no-op once.
- a **reorg check** on its own cadence (`EFFECTSTREAM_REORG_CHECK_INTERVAL_MS`, default
  30 s). Deliberately not part of the fetch loop: a chain at its tip parks inside
  `getLatestPage`, which retries until the tip advances, so a loop-driven check would
  never fire for an idle chain.
- the **polling loop**: `stateToInput()` → `readData()` → `updateState()` →
  `producerChannel.send()`. Errors are swallowed via `tryYield`, bump
  `consecutiveErrors`, log, sleep, continue. Every branch sleeps
  `pollingInterval` (falling back to 1 s if a config somehow lacks one) — a pass that
  neither fetches nor sleeps starves the whole event loop. While behind it fetches chunks
  back-to-back.

**`startMerge(syncProtocols, finalizedBlockStream)`** (`orchestration/merge.ts`) loops; per
iteration it walks protocols in order:
- **main (i=0, root not yet set):** wait for first page, peek the front buffered datum,
  `toRootOutput` → a fresh `ChainBlock` whose `timestamp` becomes the slot boundary `T`.
- **parallel (i>0):** block on `newPageCondVar` until *that chain's page has advanced past
  `T`* (proving it scanned all data up to `T`), then drain every buffered datum with
  timestamp ≤ `T` into the root via `mergeDatum`.
- send the block downstream, **then** run cleanups that pop consumed data from each Deque.

## Key design ideas

1. **Time is the universal merge key.** Every chain maps blocks → ms timestamp. The main
   chain (usually NTP, a wall-clock heartbeat at `blockTimeMS`) emits empty root blocks at a
   fixed cadence; parallel chains' data is bucketed into those slots.
2. **Page ≠ Data.** `lastPage` advances even on an empty query, so a parallel chain can
   signal "scanned up to `T`, found nothing" and let the merge proceed. `newPageCondVar`
   = progress; `newDataCondVar` = content.
3. **Confirmation depth as a time shift.** `common/utils.ts:applyDelay` *adds* `delayMs` to
   a parallel chain's timestamp so older blocks merge into more-recent root slots.
4. **Mutate-after-commit.** `OutputAndCleanup` keeps data in the Deque until the block is
   safely produced; the consumer commits to Postgres *before* emitting events.
5. **Durable, block-accurate resume queue.** *(Single source of truth for how restart/resume
   works — code comments point here; see also Finding #2 for the bug this fixes.)*

   `effectstream.sync_protocol_pagination` is keyed `(protocol_name, page_number)` and the
   **runtime is the sole writer** of the resume position (Fix D). End to end:
   - **Fetch loop** (`base/state.ts:updateState`) keeps `lastPage` in memory only — it does
     **not** persist (it runs ahead of commits, so its chunk-end page is not a safe resume
     point).
   - **Merge** (`orchestration/merge.ts`) tags every `ChainBlock` with `resumePages`: one
     marker per protocol = `outputToLastPage(lastConsumed)`, the `LastPage`
     (`{ own, ownBlockNumber, root }`) of the **highest datum merged into the block**. Each
     protocol implements `outputToLastPage` (`base/state.ts` + per-chain `state.ts`) because
     `own` is a structured page for object-paged chains and can't be rebuilt from the block
     number. Pending data above the committed timestamp is **not** marked, so it is always
     re-fetched, never skipped.
   - **Commit** (`runtime/process-blocks.ts`, STEP 7) writes each marker **inside the block's
     transaction**: `upsertPage(page_number = ownBlockNumber)` then
     `removePages(page_number < ownBlockNumber)` — leaving exactly one row per protocol = the
     committed watermark, atomic with the block.
   - **Boot** (`restoreState`) reads `getPage` = `ORDER BY page_number ASC LIMIT 1` and
     resumes from `nextInterval(own).from` = the next uncommitted block.

   **Re-scan on restart is bounded by `stepSize`, not a chain's whole quiet tail.** Every
   fetched chunk's boundary page (`data.to`) is buffered and consumed even when empty, so the
   marker advances to within one `stepSize` of the committed frontier — and reaches the
   fetched tip exactly at full catch-up. So a long-quiet chain re-fetches at most ~`stepSize`
   blocks after a restart, regardless of how long ago its last data was. Trade-off:
   `getSyncAndLastPage` now reports `synced_page == fetched_page`.

---

## Findings (open issues, as of this investigation)

Both bite hardest during **deep catch-up** — e.g. DB synced 3 days ago with a 0.25s chain
(~1.04M blocks behind) and a 6s chain (~43k behind), NTP main at `blockTimeMS: 1000`.

### 1. Unbounded buffering + head-of-line blocking (performance / OOM)

The fetch loop has **no backpressure** and **no clamp** relative to the merge or other
chains: `genInputRange` (`common/page-helpers.ts`) clamps each fetch only to the chain's own
tip and `nextPage + stepSize`. A `grep` confirms the only reads of `bufferedData.size()` are
the merge's first-datum wait (`merge.ts:110`) and the heartbeat log (`runtime/main.ts:106`) —
nothing pauses fetching when the Deque grows.

Consequences during catch-up:
- Each chain races to its own tip, filling its in-memory Deque toward the **entire backlog**
  (~1.04M block objects for the 0.25s chain; NTP fills ~259k near-instantly since it's pure
  arithmetic). Drain happens only at serial-replay speed (one DB txn + STF per block in
  `processFinalizedBlock`), which is far slower than fetch → peak memory ≈ whole backlog →
  **OOM risk**. No cap exists.
- The merge is gated per timestamp `T` on the slowest chain's *page* to advance
  (`mergeIntoRoot`, `merge.ts`), so a slow/stalled chain stalls all block production while
  the others keep ballooning (head-of-line blocking).

→ Fix: **(C) backpressure** — ✅ SHIPPED. `bufferAtCap` (`common/page-helpers.ts`) caps
`bufferedData` and pauses the fetch loop (each chain's `stateToInput` returns `undefined`)
until the merge drains. See README "Backpressure (`maxBufferedPages`)".

> **Merge→apply queue cap (Fix C′) — ✅ SHIPPED.** The Deque cap above bounds *fetch*, but the
> merge then sends finalized blocks into an effection channel whose subscriber queue buffers
> unbounded — so the merge (no I/O) could still race ahead of the serial apply loop and grow that
> queue toward the whole backlog, especially with empty-block coalescing (Fix E) removing the
> per-block apply brake. The runtime now gates the merge's `send` (`runtime/src/main.ts`): it blocks
> once `EFFECTSTREAM_FINALIZED_STREAM_CAP` (default 2048) produced blocks are unconsumed, and the
> apply loop wakes it as it drains. `inFlight = produced − consumed` is surfaced on
> `/debug/metrics`. Repro/guard: `runtime/test/reproduction/coalesce-memory.test.ts`.

> **Merge-demand exemption (safeguard).** A naive cap can deadlock the merge: it drains a
> parallel chain's buffer only *after* its page passes the root timestamp `τ`, so if the cap
> pauses the fetcher while its page is still `≤ τ` (a far skip-ahead, or a chain finer-grained
> than the cap), merge waits for the page ↔ the page waits for a fetch ↔ the fetch waits for
> the buffer to drain — circular. Guard: `mergeIntoRoot` sets `SyncState.mergeWaitingForPage`
> while blocked on a chain's page, and `bufferAtCap` returns `false` for that chain while the
> flag is set — so the fetcher advances past `τ`. Bounded by necessity: only
> `(lastPage.root, τ]` is buffered above the cap. Repros: `buffering.test.ts` 1c/1d.

### 2. Silent data gap on restart (correctness) — ✅ FIXED (D)

**The bug (historical).** The page queue was **chunk-granular** but commits are
**single-block-granular**: the fetch loop persisted `upsertPage(page_number = chunk_end)`,
commit deleted `removePages(page_number < merged_block_N)`, and restart resumed from
`getPage` = oldest remaining chunk at `nextInterval(own).from = chunk_end + 1`. During
catch-up chunks are full `stepSize`, so the committed watermark `N` sat **inside** the
oldest retained chunk `[start, end]` (`end ≥ N ⇒ not deleted`); resume jumped to `end + 1`,
**silently skipping `(N, end]`** → missing primitives → divergent app state, with no error.

**The fix (D) — block-accurate resume, runtime is the sole writer.** The runtime persists a
block-accurate marker per protocol on commit instead of the fetch loop persisting chunk-end
pages. Full mechanism in **design idea #5** above. Regression test: the
`consistency.test.ts` "mid-chunk restart" case (Postgres-only).

### 3. Serial replay is the catch-up bottleneck

Block cadence is the main chain's granularity (1/s for NTP@1000), so 3 days ≈ 259,200
effectstream blocks, each a separate DB transaction + STF run. Most are empty during
catch-up.

→ Fix: **(E) faster replay** (conservative, flag-gated) — coalesce consecutive empty
catch-up blocks into fewer transactions while preserving steady-state semantics and the
block-hash chain.

### 4. No RPC timeouts — a hung fetch stalled the node silently (correctness) — ✅ FIXED

`fetch` has no default timeout. Bitcoin, NEAR and Avail used it bare, so a blackholed
endpoint (dropped LB backend, half-open socket) hung `readData` forever. That is the worst
shape of failure here: the fetch loop never reaches its `catch`, so `consecutiveErrors`
stays 0 and `lastSuccessfulFetchMs` freezes while the merge blocks on that chain's page.
Block production stopped and nothing reported it.

→ Fix: `common/http.ts:fetchWithTimeout` (AbortSignal.timeout) on every client, configured
per protocol by `requestTimeoutMs` on `PollingSyncProtocol` (default 15 s). Timeout-only,
no internal retry — the fetch loop already retries the same page range idempotently, and
retrying inside the client would hide the failure from the health endpoint. Regression
test: `sync/test/rpc-timeout.test.ts` (each client vs a blackholed socket).

### 5. An unpaced fetch loop starved the event loop (correctness) — ✅ FIXED

`startSync` guarded its sleeps with `if ("pollingInterval" in config.syncProtocol)`, and
the Cardano/utxorpc schema was the only sync protocol not merging `PollingSyncProtocol` —
so that property was undeclared, untyped and undefaulted while the loop keyed its pacing
off it. Cardano worked only because every config passed it anyway as an undeclared extra
field; a config built strictly from the schema froze the node.

Froze rather than span: a pass that neither fetches nor sleeps never yields to the
macrotask queue. Measured 200k iterations in ~4 s while a 500 ms `setTimeout` never fired
once — no HTTP server, no other chain's fetch loop, and for a streaming chain none of the
callbacks that would let it escape.

→ Fix: utxorpc merges `PollingSyncProtocol` like every other protocol, **and** the sleep is
unconditional with a 1 s fallback. Regression test: `sync/test/poll-loop-spin.test.ts`.

### 6. The streaming producer was unsupervised (correctness) — ✅ FIXED

`startAsync` was spawned bare. A stream that **ended cleanly** left the chain receiving
nothing forever with every health counter clean — a total, silent, unrecoverable stall. A
stream that **threw** tore down the enclosing scope, i.e. `start()`, taking every unrelated
chain with it.

→ Fix: both treated as failure and restarted with capped backoff, counted in
`producerRestarts`. Gated on `hasAsyncProducer` so polled chains still run their no-op
once. Regression test: `sync/test/start-async-supervision.test.ts`.

### 7. Reorgs were undetectable (correctness) — ✅ DETECT + WARN (no auto-repair)

Forward-only sync never revisits a committed block, and the per-source block hashes on
`ChainBlock.blockInfo` were used for events/logging then dropped, so a source chain that
rewrote history left the node building on blocks that no longer existed — with nothing
reported.

→ Fix: `sync_protocol_block_hash` (migration 0.8.2) records those hashes inside the block's
transaction; `common/reorg.ts:detectReorg` re-checks them on its own cadence and binary
searches the fork point. Opt-in per chain via `ReorgDetectingFetcher` (EVM + `test`
today); unmonitored chains say so on `/health`.

**Deliberately no automatic repair.** On detection the node logs at ERROR, marks `/health`
degraded, and writes an operator report to `EFFECTSTREAM_INCIDENT_PATH` with an impact
assessment (nothing derived → "no action required"; state derived → what landed, plus the
rollback runbook and SQL). Regression test: `runtime/test/reproduction/reorg.test.ts`.

### 8. `/health` reported only database reachability (operability) — ✅ FIXED

Every failure above leaves the database perfectly healthy, so a node that had not applied a
block in an hour still answered `200 {"status":"ok"}`.

→ Fix: `runtime/src/api/health.ts` reports per-protocol state — most of which `SyncState`
already tracked and never exposed — keyed on wall-clock time since the last *applied*
block rather than block-time lag (a node replaying history is legitimately far behind in
block time while healthy). `blockingMerge` names the chain the merge is waiting on. 503 is
reserved for `db-unreachable` / `stalled` / `starting`; a chain erroring while blocks still
flow is `degraded` + 200. Regression test: `runtime/test/reproduction/health.test.ts`.

---

> The synthetic `test` chain (`src/sync-protocols/test/`) and the in-process harness
> (`packages/node-sdk/runtime/test/reproduction/`, in the runtime package because it boots
> the full `start()`, which sync must not depend on) back all of these. `sanity.test.ts`
> proves the chain syncs, processes a configured event, and survives a restart. See
> `docs/ADDING-A-SYNC-PROTOCOL.md` for how to add a chain (with `test` as the worked
> example).
>
> Every finding above has a deterministic reproduction that was written to fail first.
> Run them all, isolated from other suites, with:
>
> ```
> bun run e2e/sync-repro/run-tests.ts --docker
> ```
>
> Still open: #3 → opt-in empty-block commit batching during catch-up.

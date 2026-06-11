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
   app-relevant primitives from raw blocks.

2. **State** — `SyncState` subclass (`base/state.ts`). Holds `bufferedData` (a `denque`
   Deque of fetched-not-yet-merged data, `state.ts:50`), `lastPage` (high-water mark,
   `state.ts:70`), two CondVars (`newDataCondVar` / `newPageCondVar`, `state.ts:57-63`),
   and error/health counters. Defines the chain↔root contract:
   - `stateToInput()` — compute the next page-range to fetch (via `common/page-helpers.ts:genInputRange`)
   - `toRootPage()` — map a block → millisecond timestamp (the **merge key**)
   - `toRootOutput()` — **main only** — produce a root `ChainBlock`
   - `mergeDatum()` — **parallel only** — fold this chain's data into the root
   - `updateState()` (`state.ts:109`) — push outputs to the Deque, wake CondVars, and
     persist the page (`upsertPage`, `state.ts:132`).

3. **types.ts** — `Input` / `Output` / `Page` aliases (+ a `Client.ts` per chain where an
   RPC client is needed).

**main vs parallel** is structural in config — `toSyncProtocolWithNetwork`
(`@effectstream/config`, `config/utils.ts`) builds the array **main-first**, then parallels —
but enforced at runtime only by thrown errors: e.g. `evm/state.ts` `toRootOutput` throws
"Only main chains create root outputs"; `ntp/state.ts` `mergeDatum` throws "Only parallel
chains merge into root". **The main chain must be at index 0.**

## The two driving loops

**`startSync(state)`** (`src/sync-protocols/orchestration/sync.ts`) spawns:
- `startAsync()` — optional background producer (websocket subs for utxorpc/midnight;
  no-op for NTP/EVM).
- the **polling loop**: `stateToInput()` → `readData()` → `updateState()` →
  `producerChannel.send()` (`sync.ts:70`). Errors are swallowed via `tryYield`, bump
  `consecutiveErrors`, log, sleep `pollingInterval`, continue. The loop only sleeps when
  `stateToInput` returns `undefined` (caught up); while behind it fetches chunks
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

> This PR adds the synthetic `test` chain (`src/sync-protocols/test/`) and an
> in-process harness (`packages/node-sdk/runtime/test/reproduction/`, in the
> runtime package because it boots the full `start()`, which sync must not depend
> on). `sanity.test.ts` proves the chain syncs, processes a configured event, and
> survives a restart. See `docs/ADDING-A-SYNC-PROTOCOL.md` for how to add a chain
> (with `test` as the worked example).
>
> Deterministic reproductions of #1/#2/#3 and their fixes land alongside each fix:
> **#2 → block-accurate resume is DONE** (`consistency.test.ts`); **#1 → fetch
> backpressure is DONE** (`buffering.test.ts`, incl. 1c/1d for the merge-demand
> exemption). Still in follow-up PRs: #3 → opt-in empty-block commit batching during
> catch-up.

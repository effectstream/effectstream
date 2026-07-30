---
title: "@effectstream/sync"
description: "Blockchain sync service for EffectStream"
sidebar_label: "sync"
---

<!-- Generated from packages/node-sdk/sync/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/sync`](https://www.npmjs.com/package/@effectstream/sync)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/sync)

The blockchain-sync service inside an EffectStream node. Reads finalized
blocks from every chain you've configured (EVM, Bitcoin, Cardano, Midnight,
Avail, Celestia, NEAR…), normalizes them into a single rollup ordering,
and stages the inputs the state machine consumes.

- Blockchain-sync service: reads finalized blocks from every configured chain.
- Normalises into a single rollup ordering and stages inputs for the state machine.
- Drop-in fetchers: EVM, Bitcoin, Cardano UTXO-RPC, Midnight, Avail, Celestia, NEAR, NTP.
- `genSyncProtocols(config)` is what the runtime calls during boot.

## Install

```bash
bun add @effectstream/sync
# or
npm install @effectstream/sync
```

## Usage

This package pairs with [`@effectstream/runtime`](https://www.npmjs.com/package/@effectstream/runtime),
which boots sync as part of `start()`: it calls `genSyncProtocols(...)`
against the `syncProtocols` section of your
[`@effectstream/config`](https://www.npmjs.com/package/@effectstream/config),
then drives the resulting fetcher + state pairs every block. As an app
author you declare which protocols to sync in your config; everything
else runs automatically.

If you're building a new chain integration, implement the sync-protocol
interfaces in [`src/sync-protocols/`](https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/sync/src/sync-protocols).

## Inside EffectStream

`genSyncProtocols(config)` is what the runtime calls during boot. It walks
the `syncProtocols` section of your `@effectstream/config`, instantiates a
fetcher for each chain (viem for EVM, UTXORpc for Cardano, the Midnight
SDK for Midnight, etc.), and writes paginated blocks into PostgreSQL
through `@effectstream/db`. The state machine then drains that queue.

```typescript
import { genSyncProtocols } from "@effectstream/sync";
// inside the runtime startup path:
const protocols = await genSyncProtocols(config);
// protocols.parallelEvmRPC_fast.runOne()  // poll one block
```

## Backpressure (`maxBufferedPages`)

During deep catch-up a chain's fetch loop races to its tip far faster than the
merge can drain (the merge applies one block per DB transaction). Without a bound
the in-memory buffer (`SyncState.bufferedData`) grows toward the **entire backlog**
- hundreds of thousands of block objects - which is an OOM risk.

**The cap.** Every chain's `stateToInput` calls `bufferAtCap(state, syncProtocol)`
first (`sync-protocols/common/page-helpers.ts`): when
`bufferedData.size() >= maxBufferedPages` it returns `undefined`, so the chain stops
fetching - exactly as if it had caught up to the tip - and the polling loop sleeps
`pollingInterval` and retries. The merge keeps draining the buffer; once it drops
below the cap the next poll resumes. Peak in-memory buffering is therefore bounded
to **≈ `maxBufferedPages + stepSize`** per chain (one in-flight chunk can overshoot
the cap), instead of the whole backlog.

**Config.** `maxBufferedPages` is an optional field on every sync-protocol config
(declared once on the shared `PollingSyncProtocol` schema). When unset it defaults to
**`4 × stepSize`** (the `MAX_BUFFER_MULTIPLE` constant in `page-helpers.ts`), always
clamped to **`≥ stepSize + 1`** so a chain can always fetch at least one chunk to feed
the merge. ~4 chunks of look-ahead never starves the merge while keeping memory
bounded; raise it to trade memory for more fetch look-ahead. The cap only bites during
catch-up - in steady state the buffer sits near zero and the cap is never reached.

**Deadlock-safety (merge-demand exemption).** A naive cap can deadlock the merge: it
produces a root block at timestamp `τ` only once a parallel chain's page passes `τ`, and
drains that chain's buffer only *after* the page passes `τ`. If the cap pauses the
fetcher while its page is still `≤ τ` (the data up to `τ` exceeds the cap - e.g. a far
skip-ahead or a parallel chain finer-grained than the cap), neither side can proceed: a
circular wait, not a lost wakeup.

The safeguard is a **merge-demand exemption**: while the merge is blocked on a chain's
page (`mergeIntoRoot` sets `SyncState.mergeWaitingForPage`), `bufferAtCap` returns
`false` for that chain so the fetcher advances until its page crosses `τ`. Memory stays
**bounded by necessity** - only `(lastPage.root, τ]` is buffered above the cap, exactly
what the merge must hold to build block `τ`; once the page passes `τ` the normal cap
re-engages. A chain that is merely tip-limited (caught up, not gated by the merge) is
*not* exempted, so steady-state and head-of-line bounds are unaffected. Reproductions:
`buffering.test.ts` 1c (skip-ahead) and 1d (density).

**Scope.** The guard runs in **every** chain's `stateToInput`, so all sync chains are
covered: EVM, NTP, Bitcoin, Avail, Celestia, NEAR, Midnight, Cardano (UTXO-RPC), and
the synthetic `test` chain. Two notes:
- **Cardano (UTXO-RPC)** has no `stepSize` (it streams one block per pass), so the cap
  falls back to a default chunk size of 1000 (⇒ default cap 4000); set `maxBufferedPages`
  explicitly to tune it.
- The cap bounds `SyncState.bufferedData` (the merge-facing Deque the backpressure
  feature protects). The UTXO-RPC fetcher additionally keeps its own internal FollowTip stream
  buffer; pausing `stateToInput` stops draining it into `bufferedData`, but bounding
  that lower-level stream is a separate, fetcher-specific concern.

**Observability.** Each `SyncState` tracks, and the runtime's `/debug/metrics`
endpoint reports per protocol: `cap` (resolved `maxBufferedPages`), `buf` (current
size), `bufHighWater` (peak since boot - catches spikes between samples), `pausedNow`,
`pauses` (rising-edge count - **the "backpressure engaged" signal**), `pausedMs`
(total time paused), and `mergeWaiting`/`mergeDemandRoot` (merge-demand exemption:
`mergeWaiting=true` means the merge is gated on this chain's page and the cap is lifted).
`pauses > 0` means the cap actively bounded memory; `0` means it
was never needed in that run. Steady-state these sit at `0`; during a real deep
catch-up (or under the perf harness's `PERF_APPLY_DELAY_MS` drain throttle) they climb
as `buf` pins to `cap`.

## Key exports

- `genSyncProtocols(dbConn, syncInfo)` - Effection generator that instantiates a runtime fetcher + state pair for every protocol in `syncInfo` (from `config.syncProtocols`). Called from the runtime's process-blocks loop.
- `AllSyncProtocols` - union type covering every supported protocol; useful when authoring config that fans out.
- `ChainBlock`, plus base `Fetcher`/`State` types from `sync-protocols/base/` - the wire shape per chain.

Per-chain `Fetcher` / `SyncState` classes (`EvmFetcher`,
`BitcoinFetcher`, `MidnightFetcher`, `AvailFetcher`, `UtxoRpcFetcher`,
`NtpFetcher`, `CelestiaFetcher`, `NearFetcher`, and matching `*SyncState`
classes) are exported but are internal to the factory wiring -
application code drives them through `genSyncProtocols` rather than
instantiating them directly. Reach for them only if you're writing a
custom orchestration layer.

## Examples

End-to-end sync test (boots a node, reads blocks, asserts the DB):
[`e2e/evm/sync/`](https://github.com/effectstream/effectstream/tree/main/e2e/evm/sync).

Runnable: [`test/examples.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/node-sdk/sync/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/sync
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/sync

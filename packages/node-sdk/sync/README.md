# @effectstream/sync

The blockchain-sync service inside an EffectStream node. Reads finalized
blocks from every chain you've configured (EVM, Bitcoin, Cardano, Midnight,
Avail, Celestia, NEAR, Solana…), normalizes them into a single rollup ordering,
and stages the inputs the state machine consumes.

- Blockchain-sync service: reads finalized blocks from every configured chain.
- Normalises into a single rollup ordering and stages inputs for the state machine.
- Drop-in fetchers: EVM, Bitcoin, Cardano UTXO-RPC, Midnight, Avail, Celestia, NEAR, Solana, NTP.
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
— hundreds of thousands of block objects — which is an OOM risk.

**The cap.** Every chain's `stateToInput` calls `bufferAtCap(state, syncProtocol)`
first (`sync-protocols/common/page-helpers.ts`): when
`bufferedData.size() >= maxBufferedPages` it returns `undefined`, so the chain stops
fetching — exactly as if it had caught up to the tip — and the polling loop sleeps
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
catch-up — in steady state the buffer sits near zero and the cap is never reached.

**Deadlock-safety (merge-demand exemption).** A naive cap can deadlock the merge: it
produces a root block at timestamp `τ` only once a parallel chain's page passes `τ`, and
drains that chain's buffer only _after_ the page passes `τ`. If the cap pauses the
fetcher while its page is still `≤ τ` (the data up to `τ` exceeds the cap — e.g. a far
skip-ahead or a parallel chain finer-grained than the cap), neither side can proceed: a
circular wait, not a lost wakeup.

The safeguard is a **merge-demand exemption**: while the merge is blocked on a chain's
page (`mergeIntoRoot` sets `SyncState.mergeWaitingForPage`), `bufferAtCap` returns
`false` for that chain so the fetcher advances until its page crosses `τ`. Memory stays
**bounded by necessity** — only `(lastPage.root, τ]` is buffered above the cap, exactly
what the merge must hold to build block `τ`; once the page passes `τ` the normal cap
re-engages. A chain that is merely tip-limited (caught up, not gated by the merge) is
_not_ exempted, so steady-state and head-of-line bounds are unaffected. Reproductions:
`buffering.test.ts` 1c (skip-ahead) and 1d (density).

**Scope.** The guard runs in **every** chain's `stateToInput`, so all sync chains are
covered: EVM, NTP, Bitcoin, Avail, Celestia, NEAR, Solana, Midnight, Cardano (UTXO-RPC), and
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
size), `bufHighWater` (peak since boot — catches spikes between samples), `pausedNow`,
`pauses` (rising-edge count — **the "backpressure engaged" signal**), `pausedMs`
(total time paused), and `mergeWaiting`/`mergeDemandRoot` (merge-demand exemption:
`mergeWaiting=true` means the merge is gated on this chain's page and the cap is lifted).
`pauses > 0` means the cap actively bounded memory; `0` means it
was never needed in that run. Steady-state these sit at `0`; during a real deep
catch-up (or under the perf harness's `PERF_APPLY_DELAY_MS` drain throttle) they climb
as `buf` pins to `cap`.

## Request timeouts (`requestTimeoutMs`)

`fetch` has no default timeout, so an RPC endpoint that accepts the connection and
then never answers — a load balancer that dropped its backend, a socket left
half-open by a NAT rebind — would hang the fetch indefinitely. That is worse than
an error: the fetch loop never reaches its `catch`, so no error is counted, while
the merge blocks on that chain's page and block production stops.

**Config.** `requestTimeoutMs` is an optional field on every polling sync-protocol
config, defaulting to **15 s**. It bounds a single request; retry is the fetch
loop's job (it re-runs the same page range and counts the failure, which is what
`/health` reports on).

**Coverage.** Honoured by EVM (as the viem transport timeout), Bitcoin, NEAR,
Avail (light-client HTTP), Midnight and Celestia. Two exceptions:

- **Celestia** retries internally, so the value bounds each _attempt_ rather than
  the whole call. It still falls back to `CELESTIA_RPC_TIMEOUT_MS` when no
  protocol-level value is set.
- **Cardano / utxorpc** reads its data from a gRPC stream rather than
  request/response RPCs, so the field is inert there. That path is instead
  protected by producer supervision — a stream that dies or ends is restarted
  with backoff (see below).

The synthetic `test` chain makes no network calls. NTP performs bounded UDP I/O;
its one-shot boundary is described below.

```ts
.addParallel((n) => n.myChain, () => ({
  name: "myChain",
  type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  pollingInterval: 1000,
  requestTimeoutMs: 30_000, // slow archive node
  // ...
}))
```

## NTP clock ownership and one-shot tip

Every `NtpFetcher` owns its own `ntp-time-sync` client and cache, including when
`servers` is absent or empty. A non-empty server list is defensively copied into
that client. This prevents a default or configured fetcher from reusing another
fetcher's server selection or cached offset.

For startup boundaries, `getNtpTip` builds a private `ntp-time-sync` client
per call, samples the selected servers concurrently, and returns the inclusive
page from the first validated round:

```ts
import { getNtpTip } from "@effectstream/sync";

const { height } = await getNtpTip({
  startTime: network.startTime,
  blockTimeMS: network.blockTimeMS,
  servers: network.servers,
  signal,
  // requestTimeoutMs: 15_000, // default
});
```

The operation has one deadline (`requestTimeoutMs`), which also bounds the
client's own socket wait; on timeout or caller abort it clears its timer and
abort listener and rejects, while the client's in-flight sockets close at that
same deadline. `NtpTipError.code` distinguishes invalid options, abort,
timeout, network, and invalid time; abort preserves the caller's reason as
`cause`, while timeout exposes the effective `timeoutMs`.

Compatibility warning: the exact `ntp-time-sync` 0.6.0 upgrade drops Node 18
support. Its dependency graph requires Node 20.19+ or Node 22.12+ (the repository's
supported Bun runtime also works). Version 0.6.0 also corrects offsets to their
signed RFC 5905 meaning, so both the runtime floor and clock-direction behavior
are breaking compatibility changes.

## Producer supervision (streaming chains)

Chains whose data arrives over a subscription rather than by polling (utxorpc
today) set `hasAsyncProducer` on their `SyncState`, and `startSync` supervises
that producer instead of spawning it bare.

Both of its exit modes count as failure and trigger a restart with capped
exponential backoff (1s → 30s), including a **clean return** — a producer that
returns has ended its stream, and the observable effect is identical to a throw:
no more data. Left unsupervised, a stream that simply ended left the chain silent
forever with every health counter clean, and a stream that threw tore down the
whole node.

The backoff de-escalates: a producer that ran longer than the maximum backoff
before dying resets the delay, so an occasional incident over a long-lived stream
does not permanently penalise it.

Restarts are counted in `producerRestarts` and failures in `producerErrors`, both
reported per protocol on `/health`. They are tracked separately from the fetch
loop's `consecutiveErrors` on purpose: that counter is only cleared by a
successful `readData`, so sharing it left an idle streaming chain reporting
errors long after its producer recovered.

## Key exports

- `genSyncProtocols(dbConn, syncInfo)` - Effection generator that instantiates a runtime fetcher + state pair for every protocol in `syncInfo` (from `config.syncProtocols`). Called from the runtime's process-blocks loop.
- `AllSyncProtocols` - union type covering every supported protocol; useful when authoring config that fans out.
- `ChainBlock`, plus base `Fetcher`/`State` types from `sync-protocols/base/` - the wire shape per chain.

Per-chain `Fetcher` / `SyncState` classes (`EvmFetcher`,
`BitcoinFetcher`, `MidnightFetcher`, `AvailFetcher`, `UtxoRpcFetcher`,
`NtpFetcher`, `CelestiaFetcher`, `NearFetcher`, `SolanaFetcher`, and matching `*SyncState`
classes) are exported but are internal to the factory wiring -
application code drives them through `genSyncProtocols` rather than
instantiating them directly. Reach for them only if you're writing a
custom orchestration layer.

## One-shot Midnight tip

`getMidnightTip()` performs one bounded query for the Midnight indexer's
current block height. The caller must supply the absolute HTTP(S) `indexer`;
the helper has no network or endpoint default.

```typescript
import { getMidnightTip } from "@effectstream/sync";

const { height } = await getMidnightTip({
  indexer: midnight.indexer,
  requestTimeoutMs: 15_000, // optional; 15 seconds by default
  signal,
});
```

The operation sends exactly one `query { block { height } }` POST and returns
one validated non-negative safe integer. It never retries, polls, caches, or
persists a partial or successful result.

Failures are `MidnightTipError` instances with stable codes:
`INVALID_OPTIONS`, `ABORTED`, `TIMEOUT`, `NETWORK`, `HTTP`, `GRAPHQL`, and
`INVALID_RESPONSE`. Caller abort preserves `signal.reason`; network and JSON
parse failures preserve their original cause; HTTP failures expose
`status`/`statusText`; and GraphQL failures expose a frozen `graphqlErrors`
copy. Caller abort and the operation deadline use first-winner semantics and
release their timer, listener, and request on every settlement.

## Examples

End-to-end sync test (boots a node, reads blocks, asserts the DB):
[`e2e/evm/sync/`](https://github.com/effectstream/effectstream/tree/main/e2e/evm/sync).

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/sync
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/sync

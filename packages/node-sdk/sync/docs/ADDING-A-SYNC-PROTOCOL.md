# Adding a new chain / sync protocol

This is the end-to-end checklist for registering a new chain, distilled from
adding the synthetic **`test`** chain (its files are the worked example — search
for `TEST_MAIN` / `TEST_PARALLEL` / `ConfigNetworkType.TEST`). Read
`packages/node-sdk/sync/CLAUDE.md` first for how the sync service works.

A chain needs a **network type** (`ConfigNetworkType`) and one or more
**sync-protocol types** (`ConfigSyncProtocolType`). A network may have several
sync protocols (e.g. Cardano has CARP + UTXORPC; the `test` chain has a `main`
clock variant and a `parallel` variant). Each sync protocol is either **main**
(produces root blocks via `toRootOutput`) or **parallel** (folds data into the
root via `mergeDatum`).

> TypeScript is your friend here: several registries are
> `satisfies Record<ConfigSyncProtocolType, …>`, so the compiler forces you to
> add entries. But note this repo does **not** typecheck cleanly under
> `bunx tsc` (it runs via bun's loaders); validate by running
> `bun test ./packages` and a config that uses the new chain.

## Pick an archetype to copy

Start from the closest existing chain rather than from scratch:

| Your chain | Copy | Notes |
|---|---|---|
| Synthetic / arithmetic clock (no RPC) | `ntp/`, `test/` | blocks computed from `startTime`+`blockTimeMS`; main role |
| RPC, polled, emits primitives (parallel) | `evm/` | `getLatestPage` from RPC; `readPrimitives` filters logs; needs a viem client |
| Bitcoin-style RPC | `bitcoin/` | custom `Client.ts` (`BitcoinRpcClient`), small `stepSize` (25) |
| Streaming / subscription (push) | `utxorpc/`, `midnight/` | override **`startAsync`**; a `Client.ts` + a multiplexer/buffer feed the channel |
| Substrate-based | `avail/`, `midnight/` | substrate network schema + genesis hash |
| NEAR-style | `near/` | `Client.ts`, event-standard filters |

`stepSize` (chunk size) defaults vary by chain: 1000 (EVM/NTP/Avail), 25
(Bitcoin), 10 (Midnight/Celestia/NEAR) — pick what the RPC can serve per call.

## 1. Config (`@effectstream/config`, `src/schema/`)

- **`network/types.ts`** — add to the `ConfigNetworkType` enum.
- **`network/<chain>.ts`** (new) — a `new ConfigSchema({ required, optional })`
  describing the network (mirror `network/ntp.ts`). Optional fields **must** have
  a `default`.
- **`network/all.ts`** — import the schema and add it to `networkTypes`. (This is
  all that's needed for the network to appear in `NetworkConfig` — it's derived
  from `networkTypes`.)
- **`network/utils.ts`** — add a `case` to `caip2PrefixFor` (the trailing
  `throw` means an un-handled type fails at runtime).
- **`sync-protocols/types.ts`** —
  - add to the `ConfigSyncProtocolType` enum;
  - add to `SyncProtocolToNetwork` (**exhaustive** `satisfies Record`);
  - add a `…Primitive` type and an entry in `ProtocolPrimitiveMap`.
- **`sync-protocols/<chain>/rpc.ts`** (new) — `ConfigSchema`s for each variant +
  a `CommonResponse…` per variant (mirror `ntp/rpc.ts` for main,
  `evm/rpc.ts` for parallel). Shared fields come from `NameField`,
  `PollingSyncProtocol`, `StartStopBlockheight` via `.cloneMerge(...)`.
- **`sync-protocols/all.ts`** — register each variant in `mainSyncProtocolTypes`
  / `parallelSyncProtocolTypes`, and its `CommonResponse` in
  `syncProtocolCommonResponse` (**exhaustive** `satisfies Record`).
- **`primitive/types.ts`** — add a payload type + entry in `ProtocolPayloadMap`
  (used by `FlattenSyncProtocolIOFor`).

`mod.ts` re-exports are optional for the rpc files (NTP/NEAR/test rpc are *not*
re-exported; `all.ts` imports them directly). `CommonResponse` has **no
node-sdk runtime consumer** — it's config-side type derivation — so you have
latitude on its exact shape.

## 2. Sync (`@effectstream/sync`, `src/`)

- **`sync-protocols/<chain>/types.ts`** — `Page`, `Input` (`PageSyncRange<Page>`),
  `Output` (must include `primitives: PrimitiveType[]` if the chain emits any),
  `PrimitiveType = FlattenSyncProtocolIOFor<…>`, `toMsTimestamp`.
- **`sync-protocols/<chain>/fetcher.ts`** — extend `BaseDataFetcher`; implement
  `readData` (+ `PaginatedFetcher`: `getLatestPage`/`nextInterval`/
  `previousInterval`/`intervalFromStart`, and `PrimitiveFetcher` if it emits
  primitives). `lastPage.own`/`ownBlockNumber` = the **chunk end** (`data.to`).
  **Bound every RPC call** with `common/http.ts:fetchWithTimeout` (or the client
  library's own timeout) — a bare `fetch` against a blackholed endpoint hangs
  `readData` forever, which silently stalls the whole node (CLAUDE.md #4).
  Implement `getBlockHashAt` (`common/reorg.ts:ReorgDetectingFetcher`) if the
  chain can be asked for a past block's hash, and the chain gets reorg detection.
  Page-request helpers live in `base/page.ts`
  (`genImmediatePageRequests`/`genOnDemandPageRequests`).
- **`sync-protocols/<chain>/Client.ts`** (new, only if it talks to a node) — the
  RPC/stream client (e.g. `bitcoin/fetcher.ts:BitcoinRpcClient`,
  `near/NearClient.ts`). EVM-family chains instead use a viem client built with
  `createViemPublicClient` + `getViemNetwork` (declare the network via the
  builder's `addViemNetwork`).
- **`sync-protocols/<chain>/state.ts`** — extend `SyncState`; implement
  `stateToInput` (via `common/page-helpers.ts:genInputRange`), `toRootPage`
  (→ ms timestamp; use `applyDelay` for confirmation depth), `toRootOutput`
  (main), `mergeDatum` (parallel), `getNamespace`, and a static `restoreState`
  that reads `getPage`. For **streaming** chains, override **`startAsync()`** to
  run the subscription/producer in the background (it feeds `bufferedData`);
  polled chains leave it as the no-op default. (A `maxBufferedData` backpressure
  cap on the constructor is a planned follow-up — see CLAUDE.md finding #1.)
- **`syncProtocolFactory.ts`** — add an `else if (entry.networkType === …)`
  branch constructing the client + fetcher + `restoreState`.
- **`sync-protocols/types.ts`** — add the state class to the `AllSyncProtocols`
  union.
- **`sync-protocols/mod.ts`** — export the new fetcher/state.

## 3. Runtime (`@effectstream/runtime`, `src/`)

- **`api/http-server.ts`** — add a `case` to the `switch (networkType)` in the
  blocks endpoint (import the fetcher).
- **`config-snapshot.ts`** — `extractImmutableConfig` **throws** for un-handled
  protocol types. Add the chain to the right branch (NTP/TEST share
  `startTime`+`blockTimeMS`; most parallel chains use `startBlockHeight`).
- **`main.ts` clock detection** (only if your chain can be the **main** clock) —
  the lag threshold is derived from the main clock's `blockTimeMS` via a
  `syncInfo.find(...)` that today keys on `NTP_MAIN`. If your chain is a new main
  clock and you want lag logging (and the planned catch-up batching) to engage,
  add its `*_MAIN` type to that predicate.

## 4. Primitives (only if the chain emits data)

A fetched primitive's `primitive` field must equal a **registered primitive's
instanceName**, which is the config primitive's `id` (= its `name`). The fetcher
typically tags emitted primitives with `this.config.primitives[i].id`. The
primitive class (built-in in `@effectstream/sm` or supplied via
`StartConfig.userDefinedPrimitives`) turns raw data into `primitive_accounting`
rows and optional scheduled STF inputs.

## Gotchas / learnings

- **One network → many sync protocols** is allowed (Cardano, `test`). `FlipObject`
  unions them, so `addMain`/`addParallel` narrow correctly.
- **Resume is block-accurate** (CLAUDE.md finding #2, fixed): the runtime is the
  sole writer of the persisted marker, written inside the block's transaction.
  Your `state.ts` must implement `outputToLastPage`; `updateState` must not
  persist anything.
- **Declare `pollingInterval`** by merging `PollingSyncProtocol` into your schema.
  It is not optional in practice — the fetch loop paces itself with it, and a
  protocol without one used to starve the entire event loop (CLAUDE.md #5).
- **Set `hasAsyncProducer = true`** on the state if your chain's data arrives via
  `startAsync` rather than polling, so the producer is supervised and restarted
  (CLAUDE.md #6).
- **Merge boundary gate**: a parallel chain only merges into a root block at
  timestamp `T` once its own page is *strictly* past `T`. If the main clock runs
  to the same height as a parallel chain's fetched tip, the merge stalls at that
  boundary — keep the main clock at/behind the parallel tips.
- **`finalizedBlockStream` subscribes before the merge is spawned**
  (`runtime/src/finalized-stream.ts`), because an effection channel drops sends
  with no active subscriber.
- **`isPresync`** is currently ~always false (`genInputRange` TODO) — the
  historical-presync path may not trigger as intended.

## Verify

Build a `ConfigBuilder` config that declares the chain (see
`packages/node-sdk/runtime/test/reproduction/sanity.test.ts` for the `test`-chain
config), then `toSyncProtocolWithNetwork(config)` + `start({...})`, or run
`bun test packages/node-sdk/runtime/test/reproduction/`.

## Testing a new chain (in-process harness)

`packages/node-sdk/runtime/test/reproduction/harness.ts` is the reusable
template — it boots the real `start()` in-process against an in-process PGLite
server and the synthetic `test` chain. Reuse its patterns for any chain:

- **Env is lazy** (`ENV.*` reads `process.env` at access), so set
  `PGLITE`/`DB_*`/`EFFECTSTREAM_API_PORT` per run before `start()`. With multiple
  harnesses in one file, re-assert DB env in `runNode` (shared `process.env`).
- **Determinism**: drive the synthetic chain's tip via the in-memory
  `TestChainControl` registry (no real clock); poll with
  `waitForHeight`/`waitUntilStable` (fixed tips → a well-defined stable state).
- **Observe live state** via the test-only `StartConfig.dev.onStarted` hook
  (exposes the `AllSyncProtocols[]`, e.g. for `bufferedData.size()` assertions)
  and assert effects against DB tables (`primitive_accounting`,
  `rollup_input_result`, `effectstream_blocks`, `sync_protocol_pagination`).
- **Simulate a restart** by halting the node task while keeping PGLite alive
  (state persists), then booting again.
- Set `MQTT_BROKER=false` (it binds fixed ports that aren't freed on halt).

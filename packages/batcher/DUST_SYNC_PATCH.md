# Dust wallet sync memory/throughput patch

## TL;DR

If you install `@effectstream/batcher` as a dependency and run Midnight fee
wallets, you should apply the patch below to
`@midnight-ntwrk/wallet-sdk-dust-wallet@3.0.0`. **Without it, the batcher's dust
sync tuning is silently ignored** and the wallet syncs with browser-tuned
defaults that are slow and allocation-heavy for a backend.

> Patches are **not** transitive. The patch shipped in this monorepo
> (`patches/` + `patchedDependencies` in the root `package.json`) only applies
> to *our* installs. When you install `@effectstream/batcher` from npm, your
> package manager resolves a clean, unpatched `wallet-sdk-dust-wallet@3.0.0`,
> so you must re-apply the patch in your own project.

## The problem

The batcher builds Midnight fee wallets in `dust-only` sync mode — the shielded
and unshielded sub-wallet subscriptions are torn down, so **the dust wallet is
the only thing actively syncing** and is the dominant memory consumer. With more
than one fee wallet this multiplies, and even a single wallet has a noticeable
footprint.

`@midnight-ntwrk/wallet-sdk-dust-wallet@3.0.0` hard-codes its sync batching to
values tuned for keeping a browser UI responsive:

- batch **size** `10` — emit a new wallet-state snapshot every 10 events
- batch **timeout** `1ms`
- batch **spacing** `4ms` — sleep 4ms between *every* batch

In a headless backend this is wasteful: tiny batches mean far more short-lived
intermediate state objects (allocation churn / GC pressure), and the 4ms
per-batch throttle dramatically slows initial catch-up sync (e.g. ~40s of pure
imposed sleep over a 100k-event history vs ~1s with the patched values).

`wallet-sdk-dust-wallet@4.0.0+` makes these configurable via a `batchUpdates`
field. We pin `3.0.0` (a `4.x` bump requires `ledger-v8 ^8.1.0` and a
coordinated upgrade of the whole Midnight SDK set), so we backport just the
config wiring via a patch.

## What the patch does

It changes `makeDefaultSyncService` in `dist/v1/Sync.js` to read the batch
parameters from `config.batchUpdates` (falling back to the original 10/1ms/4ms
defaults), and lets `spacing: 0` disable the inter-batch throttle entirely. This
is a straight backport of the logic already present in `4.1.0`.

The batcher already passes the config — see
[`packages/chains/midnight-contracts/src/get-wallet-info.ts`](../chains/midnight-contracts/src/get-wallet-info.ts)
(`resolveDustBatchUpdates` → `buildDustWallet`). Defaults: **size 100 / timeout
1ms / spacing 1ms**, overridable per-deployment with:

| env var                              | default | meaning                                            |
| ------------------------------------ | ------- | -------------------------------------------------- |
| `MIDNIGHT_DUST_SYNC_BATCH_SIZE`      | `100`   | max events per batch before emitting a snapshot    |
| `MIDNIGHT_DUST_SYNC_BATCH_TIMEOUT_MS`| `1`     | max wait before flushing a partial batch           |
| `MIDNIGHT_DUST_SYNC_BATCH_SPACING_MS`| `1`     | min delay between batches (`0` disables throttling) |

> Keep `spacing > 0` unless you run the wallet in a worker thread. The batcher
> syncs on the main event loop, so `spacing: 0` would starve the HTTP server /
> tx pipeline during the initial catch-up sync. `1ms` is enough to interleave.

## How to apply it in your project

The patch (`dist/v1/Sync.js`):

```diff
         updates: (state, secretKey) => {
-            const batchSize = 10;
-            const batchTimeout = Duration.millis(1);
-            return pipe(indexerSyncService.subscribeWallet(state), Stream.groupedWithin(batchSize, batchTimeout), Stream.map(Chunk.toArray), Stream.map((data) => WalletSyncUpdate.create(data, secretKey, new Date())), Stream.schedule(Schedule.spaced(Duration.millis(4))), Stream.provideSomeLayer(indexerSyncService.connectionLayer()));
+            const batchSize = config.batchUpdates?.size ?? 10;
+            const batchTimeout = Duration.millis(config.batchUpdates?.timeout ?? 1);
+            const batchSpacing = config.batchUpdates?.spacing ?? 4;
+            return pipe(indexerSyncService.subscribeWallet(state), Stream.groupedWithin(batchSize, batchTimeout), Stream.map(Chunk.toArray), Stream.map((data) => WalletSyncUpdate.create(data, secretKey, new Date())), batchSpacing > 0
+                ? Stream.schedule(Schedule.spaced(Duration.millis(batchSpacing)))
+                : (eventsStream) => eventsStream, Stream.provideSomeLayer(indexerSyncService.connectionLayer()));
         },
```

### Bun

```bash
bun patch @midnight-ntwrk/wallet-sdk-dust-wallet@3.0.0
# edit node_modules/@midnight-ntwrk/wallet-sdk-dust-wallet/dist/v1/Sync.js per the diff above
bun patch --commit node_modules/@midnight-ntwrk/wallet-sdk-dust-wallet
```

This writes a patch file under `patches/` and adds `patchedDependencies` to your
`package.json`. Commit both — they re-apply on every `bun install`.

### npm / yarn / pnpm (via `patch-package`)

```bash
npm i -D patch-package
# edit node_modules/@midnight-ntwrk/wallet-sdk-dust-wallet/dist/v1/Sync.js per the diff above
npx patch-package @midnight-ntwrk/wallet-sdk-dust-wallet
# add to package.json scripts: "postinstall": "patch-package"
```

Commit the generated `patches/@midnight-ntwrk+wallet-sdk-dust-wallet+3.0.0.patch`.

## Verifying it applied

```bash
grep -q "config.batchUpdates?.size" \
  node_modules/@midnight-ntwrk/wallet-sdk-dust-wallet/dist/v1/Sync.js \
  && echo PATCHED || echo "NOT patched"
```

Make sure the **copy your build actually resolves** is patched — in hoisted
layouts there may be multiple physical copies under different peer-dependency
hashes. Only the one your wallet-building code (`@effectstream/midnight-contracts`)
resolves matters; a type-only copy nested under `wallet-sdk-facade` is never
executed and does not need patching.

## When to remove it

This patch is pinned to `wallet-sdk-dust-wallet@3.0.0`. If/when the dependency
moves to `4.x`, `batchUpdates` is supported natively — drop the patch. Bun/
`patch-package` will error if the package version no longer matches, which is
the intended signal.

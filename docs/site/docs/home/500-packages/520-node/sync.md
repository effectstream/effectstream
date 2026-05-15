---
title: "@effectstream/sync"
description: "Blockchain sync service for EffectStream"
sidebar_label: "sync"
---

<!-- Generated from packages/node-sdk/sync/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/sync`](https://www.npmjs.com/package/@effectstream/sync)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/sync)

The blockchain-sync service inside an EffectStream node. Reads finalized
blocks from every chain you've configured (EVM, Bitcoin, Cardano, Midnight,
Avail, Celestia, NEAR…), normalizes them into a single rollup ordering,
and stages the inputs the state machine consumes.

## Install

```bash
bun add @effectstream/sync
# or
npm install @effectstream/sync
```

## Standalone usage

This is a **runtime-only module**. The exports describe the protocol the
node's main loop expects, not a self-contained CLI. Use it through
`@effectstream/node-sdk/sync` once `@effectstream/runtime` has booted the
node — sync is started for you when `start()` runs against a config that
declares one or more sync protocols.

If you're building a new chain integration, the sync-protocol interfaces
in [`src/sync-protocols/`](https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/sync/src/sync-protocols)
are what you implement.

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

## Key exports

- `genSyncProtocols(dbConn, syncInfo)` — Effection generator that instantiates a runtime fetcher + state pair for every protocol in `syncInfo` (from `config.syncProtocols`).
- Per-chain `Fetcher` and `SyncState` classes — `EvmFetcher`/`EvmSyncState`, `BitcoinFetcher`/`BitcoinSyncState`, `MidnightFetcher`/`MidnightSyncState`, `AvailFetcher`/`AvailSyncState`, `UtxoRpcFetcher`/`UtxoRpcSyncState`, `CelestiaFetcher`/`CelestiaSyncState`, `NtpFetcher`/`NtpSyncState`, etc.
- `AllSyncProtocols` — union type covering every supported protocol; useful when authoring config that fans out.
- `ChainBlock`, plus base `Fetcher`/`State` types from `sync-protocols/base/` — the wire shape per chain.

## Examples

End-to-end sync test (boots a node, reads blocks, asserts the DB):
[`e2e/evm/sync/`](https://github.com/PaimaStudios/paima-engine/tree/main/e2e/evm/sync).

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/node-sdk/sync/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/sync
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/sync

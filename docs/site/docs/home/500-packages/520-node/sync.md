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

## Key exports

- `genSyncProtocols(dbConn, syncInfo)` — Effection generator that instantiates a runtime fetcher + state pair for every protocol in `syncInfo` (from `config.syncProtocols`). Called from the runtime's process-blocks loop.
- `AllSyncProtocols` — union type covering every supported protocol; useful when authoring config that fans out.
- `ChainBlock`, plus base `Fetcher`/`State` types from `sync-protocols/base/` — the wire shape per chain.

Per-chain `Fetcher` / `SyncState` classes (`EvmFetcher`,
`BitcoinFetcher`, `MidnightFetcher`, `AvailFetcher`, `UtxoRpcFetcher`,
`NtpFetcher`, `CelestiaFetcher`, `NearFetcher`, and matching `*SyncState`
classes) are exported but are internal to the factory wiring —
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

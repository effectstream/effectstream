---
title: "@effectstream/npm-midnight-node"
description: "Downloads and starts the binary for Midnight Node"
sidebar_label: "midnight-node"
---

{/* Generated from packages/binaries/midnight-node/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/npm-midnight-node`](https://www.npmjs.com/package/@effectstream/npm-midnight-node)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/midnight-node)

NPM wrapper that downloads and runs the
[Midnight](https://midnight.network/) Node binary. Installs a pinned
version on first invocation and exposes a `npm-midnight-node` CLI for
the EffectStream orchestrator and templates.

## Install

```bash
bun add @effectstream/npm-midnight-node
# or
npm install @effectstream/npm-midnight-node
```

## Standalone usage

```bash
# Start a local Midnight node (downloads the binary on first run)
bunx npm-midnight-node --dev

# Clear the downloaded binary cache
bunx npm-midnight-node --clean-binaries

# Only clean, don't redownload
bunx npm-midnight-node --only-clean
```

## Inside EffectStream

The orchestrator's Midnight step starts this binary, plus
`@effectstream/npm-midnight-proof-server` and
`@effectstream/npm-midnight-indexer`, then `@effectstream/sync`'s
`MidnightFetcher` consumes the node's RPC. Templates that target
Midnight:

- [`templates/evm-midnight/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/evm-midnight)
- [`templates/night-bitcoin/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/night-bitcoin)
- [`templates/zswap-da/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/zswap-da)
- [`templates/zk-cardano/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/zk-cardano)

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/midnight-node
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/midnight-node
- Upstream Midnight: https://midnight.network/

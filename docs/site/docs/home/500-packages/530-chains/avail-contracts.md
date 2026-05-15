---
title: "@effectstream/avail-contracts"
description: "Avail DA contract interfaces for EffectStream"
sidebar_label: "avail-contracts"
---

{/* Generated from packages/chains/avail-contracts/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/avail-contracts`](https://www.npmjs.com/package/@effectstream/avail-contracts)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/avail-contracts)

Contract-interface package for Avail (data-availability layer) inside
EffectStream. Reserved as the home for Avail-side bindings, helpers, and
deployment scripts that an EffectStream app might use when posting data
blobs to or syncing rollup inputs from Avail.

## Install

```bash
bun add @effectstream/avail-contracts
# or
npm install @effectstream/avail-contracts
```

## Standalone usage

This package is currently a **stub**. It ships so that
`@effectstream/sync` and `@effectstream/orchestrator` can declare a
stable dependency on the Avail integration namespace; concrete exports
(message-encoding helpers, address utilities) will land here as the
Avail integration evolves.

For sync-side Avail support today, see:

- `@effectstream/sync` — `AvailFetcher`, `AvailSyncState`.
- `@effectstream/npm-avail-node`, `@effectstream/npm-avail-light-client` — pinned binary wrappers.
- [`templates/avail/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/avail) — a working node configured against an Avail testnet.

## Inside EffectStream

The package's role inside the framework is the per-chain "contracts"
slot, mirroring the structure already used by `@effectstream/evm-contracts`,
`@effectstream/midnight-contracts`, `@effectstream/cardano-contracts`,
and `@effectstream/bitcoin-contracts`.

## Key exports

None at present — the module currently re-exports nothing. Watch the
`mod.ts` for future entry points, or open an issue if you need a specific
helper.

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/avail-contracts
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/avail-contracts
- Avail docs: https://docs.availproject.org/

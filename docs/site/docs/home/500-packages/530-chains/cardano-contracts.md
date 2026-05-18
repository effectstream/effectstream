---
title: "@effectstream/cardano-contracts"
description: "Cardano contract interfaces for EffectStream"
sidebar_label: "cardano-contracts"
---

<!-- Generated from packages/chains/cardano-contracts/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/cardano-contracts`](https://www.npmjs.com/package/@effectstream/cardano-contracts)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/cardano-contracts)

Contract-interface package for Cardano inside EffectStream. Reserved as
the home for Cardano-side bindings, helpers, and deployment scripts that
an EffectStream app might use when interacting with Cardano-native
contracts (Plutus, Aiken).

## Install

```bash
bun add @effectstream/cardano-contracts
# or
npm install @effectstream/cardano-contracts
```

## Standalone usage

This package is currently a **stub**. It ships so that
`@effectstream/sync`, `@effectstream/orchestrator`, and the templates can
depend on a stable Cardano integration namespace. Concrete exports —
script encoders, datum types, common policy IDs — will land here as the
Cardano integration evolves.

For Cardano support today, see:

- `@effectstream/sync` — `UtxoRpcFetcher`, `UtxoRpcSyncState` for Cardano UTXO-RPC sync.
- `@effectstream/sm/builtin` — `PrimitiveTypeCardanoTransfer`, `PrimitiveTypeCardanoMintBurn`, `PrimitiveTypeCardanoPoolDelegation`, `PrimitiveTypeCardanoDelayedAsset`, `PrimitiveTypeCardanoProjectedNFT`.
- Templates: [`templates/cardano-delegation/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/cardano-delegation), [`templates/preorder/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/preorder), [`templates/evm-cardano/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/evm-cardano), [`templates/projected-nft-preorder/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/projected-nft-preorder), [`templates/zk-cardano/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/zk-cardano).

## Inside EffectStream

The package's role inside the framework is the per-chain "contracts"
slot, mirroring `@effectstream/evm-contracts`,
`@effectstream/midnight-contracts`, and `@effectstream/bitcoin-contracts`.

## Key exports

None at present — the module currently re-exports nothing. Open an issue
if you have a Cardano-side helper you'd like to upstream.

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/cardano-contracts
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/cardano-contracts

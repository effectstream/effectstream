# @effectstream/cardano-contracts

Contract-interface package for Cardano inside EffectStream. Reserved as
the home for Cardano-side bindings, helpers, and deployment scripts that
an EffectStream app might use when interacting with Cardano-native
contracts (Plutus, Aiken).

- Reserved namespace for Cardano-side bindings, helpers, and deployment scripts.
- Ships intentionally empty today: `mod.ts` re-exports nothing.
- Mirrors the per-chain "contracts" slot used by EVM, Midnight, Bitcoin, Avail.
- For Cardano support today, see `@effectstream/sync`'s `UtxoRpcFetcher` and `@effectstream/sm/builtin`'s Cardano primitives.

## Install

```bash
bun add @effectstream/cardano-contracts
# or
npm install @effectstream/cardano-contracts
```

## Standalone usage

This package is intentionally empty today. It ships so that `@effectstream/sync`, `@effectstream/orchestrator`, and the templates can depend on a stable Cardano integration namespace; concrete exports (script encoders, datum types, common policy IDs) land here as the Cardano integration grows.

For Cardano support today, see:

- `@effectstream/sync` — `UtxoRpcFetcher`, `UtxoRpcSyncState` for Cardano UTXO-RPC sync.
- `@effectstream/sm/builtin` — `PrimitiveTypeCardanoTransfer`, `PrimitiveTypeCardanoMintBurn`, `PrimitiveTypeCardanoPoolDelegation`, `PrimitiveTypeCardanoDelayedAsset`, `PrimitiveTypeCardanoProjectedNFT`.
- Templates: [`templates/cardano-delegation/`](https://github.com/effectstream/effectstream/tree/main/templates/cardano-delegation), [`templates/preorder/`](https://github.com/effectstream/effectstream/tree/main/templates/preorder), [`templates/evm-cardano/`](https://github.com/effectstream/effectstream/tree/main/templates/evm-cardano), [`templates/projected-nft-preorder/`](https://github.com/effectstream/effectstream/tree/main/templates/projected-nft-preorder), [`templates/zk-cardano/`](https://github.com/effectstream/effectstream/tree/main/templates/zk-cardano).

## Inside EffectStream

The package's role inside the framework is the per-chain "contracts"
slot, mirroring `@effectstream/evm-contracts`,
`@effectstream/midnight-contracts`, and `@effectstream/bitcoin-contracts`.

## Key exports

None at present — the module currently re-exports nothing. Open an issue
if you have a Cardano-side helper you'd like to upstream.

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/cardano-contracts
- Source: https://github.com/effectstream/effectstream/tree/main/packages/chains/cardano-contracts

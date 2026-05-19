# @effectstream/avail-contracts

Contract-interface package for Avail (data-availability layer) inside
EffectStream. Reserved as the home for Avail-side bindings, helpers, and
deployment scripts that an EffectStream app might use when posting data
blobs to or syncing rollup inputs from Avail.

- Reserved namespace for Avail-side bindings, helpers, and deployment scripts.
- Ships intentionally empty today: `mod.ts` re-exports nothing.
- Mirrors the per-chain "contracts" slot used by EVM, Midnight, Cardano, Bitcoin.
- For sync-side Avail support today, see `@effectstream/sync` and the Avail binary wrappers.

## Install

```bash
bun add @effectstream/avail-contracts
# or
npm install @effectstream/avail-contracts
```

## Standalone usage

This package is intentionally empty today. It ships so that `@effectstream/sync` and `@effectstream/orchestrator` can declare a stable dependency on the Avail integration namespace; concrete exports (message-encoding helpers, address utilities) land here as the Avail integration grows.

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

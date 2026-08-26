# @effectstream/npm-midnight-node

NPM wrapper that downloads and runs the
[Midnight](https://midnight.network/) Node binary. Installs a pinned
version on first invocation and exposes a `npm-midnight-node` CLI for
the EffectStream orchestrator and templates.

- Pinned Midnight node binary (`2.0.0-rc.4`), downloaded on first run.
- Native targets are `macos-arm64` and `linux-amd64`; no Linux arm64 asset is published.
- `--dev` for a local node; `--clean-binaries` / `--only-clean` to manage the cache.
- Consumed by `@effectstream/sync`'s `MidnightFetcher`.
- Templates: `evm-midnight-v2`, `night-bitcoin`, `zswap-da`, `zk-cardano`.

## Cached-chain compatibility

This node is the Ledger-9 member of the bundled tuple declared by
`@effectstream/npm-midnight-indexer/compatibility.json`. Node-1/Ledger-8 chain
state is not reusable by node `2.0.0-rc.4`. In the pinned reproduction, that
state made the node exit nonzero with a missing
`ext_ledger_8_bridge_construct_distribute_treasury_system_tx_version_1` host
import. Do not label other startup failures incompatible without that exact
evidence.

The Effectstream orchestrator passes an explicit project-local `BASE_PATH`:
`packages/contracts-midnight/node_modules/.cache/effectstream/midnight-node`.
If a reset is necessary, stop the stack, archive or remove only that directory,
then restart. The orchestrator and indexer never reset it automatically, and
indexer `--clean` does not affect it.

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

- [`templates/evm-midnight-v2/`](https://github.com/effectstream/effectstream/tree/main/templates/evm-midnight-v2)
- [`templates/night-bitcoin/`](https://github.com/effectstream/effectstream/tree/main/templates/night-bitcoin-v2)
- [`templates/zswap-da/`](https://github.com/effectstream/effectstream/tree/main/templates/zswap-da)
- [`templates/zk-cardano/`](https://github.com/effectstream/effectstream/tree/main/templates/zk-cardano)

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/midnight-node
- Source: https://github.com/effectstream/effectstream/tree/main/packages/binaries/midnight-node
- Upstream Midnight: https://midnight.network/

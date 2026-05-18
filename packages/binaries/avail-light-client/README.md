# @effectstream/npm-avail-light-client

NPM wrapper around the [Avail](https://www.availproject.org/) light client
CLI. Installs a pinned binary into `node_modules/.bin/npm-avail-light-client`
so the EffectStream orchestrator and Avail-side E2E tests can spin up a
light client without each developer fetching the binary by hand.

## Install

```bash
bun add @effectstream/npm-avail-light-client
# or
npm install @effectstream/npm-avail-light-client
```

The package downloads the pinned light-client binary for your OS/arch on
install.

## Standalone usage

```bash
# Through the bin shim
bunx npm-avail-light-client --network mainnet

# Or invoke the script directly
bun run --bun @effectstream/npm-avail-light-client/start -- --network mainnet
```

## Inside EffectStream

The orchestrator's Avail step boots this binary alongside the Avail node
wrapper (`@effectstream/npm-avail-node`) so syncs against Avail-DA work
locally. See:

- [`templates/avail/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/avail) — full template using Avail.
- [`e2e/avail/`](https://github.com/PaimaStudios/paima-engine/tree/main/e2e/avail) — E2E suite.
- `@effectstream/sync` — `AvailFetcher`, `AvailSyncState` on the runtime side.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/avail-light-client
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/avail-light-client
- Avail Light Client: https://github.com/availproject/avail-light

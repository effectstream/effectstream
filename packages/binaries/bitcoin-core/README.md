# @effectstream/bitcoin-core

A pinned Bitcoin Core binary, packaged for npm. Installing this drops a
versioned `bitcoind` and `bitcoin-cli` into `node_modules/.bin` so the
EffectStream orchestrator and E2E tests can boot a local regtest
without each developer running their own install script.

- Pins Bitcoin Core 28.1 for local regtest.
- Linux / macOS, x64 and arm64.
- Pairs with `@effectstream/bitcoin-contracts` for `generate-blocks` and `wait-for-block`.
- Used by the orchestrator's Bitcoin step.

## Install

```bash
bun add @effectstream/bitcoin-core
# or
npm install @effectstream/bitcoin-core
```

Currently pins **Bitcoin Core 28.1**.

## Standalone usage

Once installed, the binary is on your local PATH (via `node_modules/.bin`).

```bash
# Start a regtest daemon
bunx bitcoin-core -regtest -daemon

# Or invoke through this package directly
bun run --bun @effectstream/bitcoin-core/start -- -regtest -daemon
```

The package downloads the pinned tarball for your OS/arch on first run:

| Platform | Architecture |
|---|---|
| linux  | x64, arm64 |
| darwin | x64, arm64 |

Pair with [`@effectstream/bitcoin-contracts`](https://www.npmjs.com/package/@effectstream/bitcoin-contracts)
for the `generate-blocks` and `wait-for-block` helpers.

## Inside EffectStream

The orchestrator (`@effectstream/orchestrator`) declares this as a
dependency of its `bitcoin-core` step, so `bun packages/build-tools/orchestrator/src/cli.ts start`
brings up a regtest chain automatically. The Bitcoin E2E suite at
[`e2e/bitcoin/`](https://github.com/PaimaStudios/paima-engine/tree/main/e2e/bitcoin)
runs against this same binary.

## Links

- Docs: https://effectstream.github.io/docs/packages/binaries/bitcoin-core
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/bitcoin-core
- Upstream Bitcoin Core: https://bitcoincore.org/

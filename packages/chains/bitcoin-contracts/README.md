# @effectstream/bitcoin-contracts

Bitcoin-side helper scripts for local EffectStream development. Ships
two `bun run` scripts used by the orchestrator and templates: a regtest
block generator and a "wait for block N" RPC poller. Built on
[`bitcoinjs-lib`](https://github.com/bitcoinjs/bitcoinjs-lib).

## Install

```bash
bun add @effectstream/bitcoin-contracts
# or
npm install @effectstream/bitcoin-contracts
```

## Standalone usage

The package exports two scripts (no `bin` entries — invoke them via the
subpath exports):

```bash
# Generate regtest blocks at a fixed interval.
bun run @effectstream/bitcoin-contracts/generate-blocks --block-interval 5000

# Wait until the chain reaches a specific height.
bun run @effectstream/bitcoin-contracts/wait-for-block --block-height 100
```

Both scripts speak Bitcoin Core's JSON-RPC at
`http://127.0.0.1:18443` (auth `dev:devpassword` by default). Pair with
[`@effectstream/bitcoin-core`](https://www.npmjs.com/package/@effectstream/bitcoin-core)
to get the actual Bitcoin Core binary.

## Inside EffectStream

`@effectstream/orchestrator/launch-bitcoin` declares the Bitcoin step's
process graph and resolves these scripts by name from your template's
package — so as long as your template's `package.json` exposes
`chain:start`, `wait-for-block`, and `generate:blocks` scripts that
delegate to this package's subpaths, the orchestrator picks them up.

On the sync side, `@effectstream/sync`'s `BitcoinFetcher` + `BitcoinSyncState`
consume the regtest chain that these scripts keep moving.

## Key exports

- `./generate-blocks` — script for regtest block generation. Args: `--block-interval <ms>`.
- `./wait-for-block` — script to poll Bitcoin Core until a target height. Args: `--block-height <n>`.
- `./mod` — re-exports `./generate-blocks` (the `bitcoin.payments` / `ECPair` helpers it builds on are inlined, not exported separately).

## Examples

The Bitcoin sync E2E suite at
[`e2e/bitcoin/`](https://github.com/PaimaStudios/paima-engine/tree/main/e2e/bitcoin)
shows the full flow: orchestrator boots `@effectstream/bitcoin-core`,
this package generates blocks, sync ingests them, the test asserts on
the DB.

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/bitcoin-contracts
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/bitcoin-contracts
- bitcoinjs-lib: https://github.com/bitcoinjs/bitcoinjs-lib

---
title: "@effectstream/bitcoin-contracts"
description: "Bitcoin script utilities for EffectStream"
sidebar_label: "bitcoin-contracts"
---

{/* Generated from packages/chains/bitcoin-contracts/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/bitcoin-contracts`](https://www.npmjs.com/package/@effectstream/bitcoin-contracts)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/bitcoin-contracts)

Bitcoin-side helper scripts for local EffectStream development. Ships
two utilities used by the orchestrator and templates: a regtest block
generator and a "wait for block N" RPC poller. Built on
[`bitcoinjs-lib`](https://github.com/bitcoinjs/bitcoinjs-lib).

## Install

```bash
bun add @effectstream/bitcoin-contracts
# or
npm install @effectstream/bitcoin-contracts
```

## Standalone usage

Keep a Bitcoin regtest chain producing blocks at a fixed interval — used
by E2E tests and the orchestrator to keep timestamps moving.

```bash
bun run @effectstream/bitcoin-contracts/generate-blocks --block-interval 5000
```

Connects to a Bitcoin Core regtest node at
`http://127.0.0.1:18443` (auth `dev:devpassword`) and mines a block
every 5 seconds.

Wait for a specific block before continuing CI / orchestration:

```bash
bun run @effectstream/bitcoin-contracts/wait-for-block --block-height 100
```

Both scripts are RPC-only — pair them with `@effectstream/bitcoin-core`
(the pinned Bitcoin Core binary) to get a fully self-hosted regtest
environment.

## Inside EffectStream

The orchestrator uses `generate-blocks` to drive the Bitcoin regtest
chain inside `@effectstream/orchestrator start`, and E2E tests use
`wait-for-block` to gate on chain progress. Together with
`@effectstream/sync`'s `BitcoinFetcher`, they form the minimal Bitcoin
dev loop.

## Key exports

- `./mod` — re-exports `./generate-blocks`.
- `./generate-blocks` — script + helpers for regtest block generation.
- `./wait-for-block` — script + helper to poll Bitcoin Core until a
  target height.

## Examples

The Bitcoin sync E2E suite at
[`e2e/bitcoin/`](https://github.com/PaimaStudios/paima-engine/tree/main/e2e/bitcoin)
shows the full flow: orchestrator boots `@effectstream/bitcoin-core`,
this package generates blocks, sync ingests them, the test asserts on the
DB.

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/bitcoin-contracts
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/chains/bitcoin-contracts
- bitcoinjs-lib: https://github.com/bitcoinjs/bitcoinjs-lib

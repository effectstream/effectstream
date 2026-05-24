---
title: Packages
sidebar_label: Packages
description: Reference for every published @effectstream/* package on npm.
---

# Packages

Reference documentation for every `@effectstream/*` package published to npm.
Each page is generated from the package's own `README.md`, so the npm page,
the GitHub source, and this site never drift apart.

If you just want to build something quickly, start at
[Quickstart](../10-quickstart/10-quickstart.md). The pages below are reference
material: what each package contains, how to use it standalone, and how it
fits into the rest of EffectStream.

## How packages are grouped

EffectStream is a stack of independent layers. Most users only need a small
slice of it.

| Group | Use when you want to… | Example |
|---|---|---|
| **SDK** | Sign messages, encode addresses, talk to wallets - runs in the browser or any Node tool. | `@effectstream/wallets`, `@effectstream/crypto` |
| **Node SDK** | Run an EffectStream node: indexer, state machine, database, event server. | `@effectstream/node-sdk`, `@effectstream/runtime` |
| **Chains** | Deploy or interact with the on-chain contracts EffectStream syncs from. | `@effectstream/evm-contracts`, `@effectstream/midnight-contracts` |
| **Binaries** | Install a pinned blockchain node or sidecar (Bitcoin Core, Midnight node, Grafana…). | `@effectstream/npm-midnight-node`, `@effectstream/bitcoin-core` |
| **Tools** | Local dev orchestrator, batcher service, frontend SDK. | `@effectstream/orchestrator`, `@effectstream/batcher-sdk` |

## SDK

Building blocks. These work outside the EffectStream node - pull them into any
TypeScript project.

- `@effectstream/utils` - Address encoding, type helpers, concurrency utilities.
- `@effectstream/crypto` - Multi-chain signature verification and seeded RNG.
- `@effectstream/log` - OpenTelemetry-instrumented structured logging.
- `@effectstream/config` - Chain and runtime configuration schema.
- `@effectstream/precompile` - Precompile registration helpers.
- `@effectstream/chain-types` - Cross-chain type definitions.
- `@effectstream/concise` - Type-safe schemas for EffectStream messages.
- `@effectstream/event-client` - MQTT-based event subscriber.
- `@effectstream/wallets` - Browser wallet connectors (EVM, Cardano, Midnight…).
- `@effectstream/coroutine` - Effection-based async control flow.

## Node SDK

The runtime engine - pulled in by anyone running an EffectStream node.

- `@effectstream/node-sdk` - Main entrypoint that re-exports the node runtime.
- `@effectstream/sync` - Blockchain sync service.
- `@effectstream/sm` - State-machine DSL.
- `@effectstream/db` - PostgreSQL + PgLite database layer.
- `@effectstream/db-emulator` - In-memory database for tests.
- `@effectstream/runtime` - State-machine runtime.
- `@effectstream/event-server` - Event server for streaming updates.

## Chains

Per-chain contract bindings and deployment helpers.

- `@effectstream/evm-contracts` - Solidity contracts for EVM chains.
- `@effectstream/evm-hardhat` - Hardhat deployment helpers.
- `@effectstream/midnight-contracts` - Midnight contract interfaces.
- `@effectstream/avail-contracts` - Avail DA contract interfaces.
- `@effectstream/bitcoin-contracts` - Bitcoin script utilities.
- `@effectstream/cardano-contracts` - Cardano contract interfaces.

## Binaries

NPM-wrapped third-party binaries. Install one and it drops a usable executable
into `node_modules/.bin`. Mostly consumed by `@effectstream/orchestrator`.

- `@effectstream/bitcoin-core`, `@effectstream/ord`
- `@effectstream/npm-avail-light-client`, `@effectstream/npm-avail-node`
- `@effectstream/npm-midnight-node`, `@effectstream/npm-midnight-proof-server`, `@effectstream/npm-midnight-indexer`
- `@effectstream/near-sandbox`, `@effectstream/celestia`
- `@effectstream/grafana-alloy`, `@effectstream/grafana-loki`

## Tools

- `@effectstream/batcher-sdk` - Cross-chain transaction batcher.
- `@effectstream/orchestrator` - Multi-chain local dev environment.
- `@effectstream/frontend-sdk` - React frontend SDK for EffectStream apps.

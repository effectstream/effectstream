# Architecture

> This section is intended for developers who require advanced knowledge about the engine or plan to contribute to `EffectStream`

EffectStream is distributed through `NPM` packages. There are **38 publishable packages**, all released together under a single coordinated version. Each has its own reference page under [Packages](../500-packages/500-packages.md), generated from the package's README.

## Core SDK

Client- and shared-side building blocks (`packages/effectstream-sdk/`).

*  @effectstream/chain-types
    Block header/hashing types shared across chains.

*  @effectstream/concise
    Type-safe grammar: encode, parse and validate the concise JSON-array inputs, plus batcher message construction and account-delegation helpers.

*  @effectstream/config
    `ConfigBuilder` and the schema layer for networks, sync protocols, deployments and primitives.

*  @effectstream/coroutine
    Effection-based generator plumbing (`World`) used to queue state updates atomically.

*  @effectstream/crypto
    Server-side address decoding and signature verification per chain (`CryptoManager`).

*  @effectstream/event-client
    Client for subscribing to engine, primitive and app events over MQTT.

*  @effectstream/log
    Logging and observability utilities, including OpenTelemetry setup.

*  @effectstream/precompile
    Precompile address helpers.

*  @effectstream/utils
    Shared utilities (config helpers, address/encoding, concurrency, decorators, constants, captcha, viem wrappers).

*  @effectstream/wallets
    Browser wallet connectors and the frontend runtime client for login, signing and submission.

## Node runtime

The engine itself (`packages/node-sdk/`).

*  @effectstream/node-sdk
    Umbrella entry point re-exporting the runtime packages below.

*  @effectstream/runtime
    The `start(...)` entry point and node lifecycle: sync, state machine, API server.

*  @effectstream/sm
    State machine DSL (`Stm`) and the built-in primitives.

*  @effectstream/sync
    Per-chain fetchers and sync protocols.

*  @effectstream/db
    Typed database layer (pgtyped), connection helpers, event indexing, dynamic tables, scheduled constructors, and DB scripts for launching in-memory pgsql for development.

*  @effectstream/db-emulator
    In-memory database used for tests.

*  @effectstream/event-server
    Localhost-only MQTT broker that publishes engine events.

## Chain contracts and tooling

Per-chain contract interfaces (`packages/chains/`).

*  @effectstream/evm-contracts
    EffectStream EVM default contracts (Forge/Hardhat/Ignition) and published artifacts/ABIs.

*  @effectstream/evm-hardhat
    Hardhat scripts, JSON-RPC server, deploy helpers and remappings.

*  @effectstream/midnight-contracts
    Compact contract deployment, wallet and dust helpers.

*  @effectstream/cardano-contracts
    Cardano-side contract helpers.

*  @effectstream/bitcoin-contracts
    Bitcoin-side helpers for regtest workflows.

*  @effectstream/avail-contracts
    Avail-side helpers.

## Binaries

NPM wrappers that install a pinned upstream binary (`packages/binaries/`).

*  @effectstream/npm-avail-light-client
    A wrapper for the Avail Light Client CLI.

*  @effectstream/npm-avail-node
    A wrapper for the Avail node.

*  @effectstream/npm-midnight-node
    A wrapper for the Midnight node.

*  @effectstream/npm-midnight-indexer
    A wrapper for the Midnight GraphQL indexer.

*  @effectstream/npm-midnight-proof-server
    A wrapper for the Midnight proof server.

*  @effectstream/bitcoin-core
    A wrapper for Bitcoin Core.

*  @effectstream/celestia
    A wrapper for the Celestia node stack.

*  @effectstream/near-sandbox
    A wrapper for the NEAR sandbox.

*  @effectstream/solana-node
    A wrapper for the Solana (Agave) validator.

*  @effectstream/ord
    A wrapper for the `ord` Ordinals CLI.

*  @effectstream/grafana-alloy
    A wrapper for Grafana Alloy, used by the local observability stack.

*  @effectstream/grafana-loki
    A wrapper for Grafana Loki.

## Services and tools

*  @effectstream/batcher-sdk
    Cross-chain transaction batching: core, adapters, batch data builder and the Fastify server.

*  @effectstream/orchestrator
    Process orchestration to coordinate services, wait for DB/chain readiness, and manage production and local environments.

*  @effectstream/frontend-sdk
    Frontend SDK. The only package that requires a build step before publishing.

:::note Not published
`@effectstream/explorer` (a Vite + React web explorer for inspecting chain and game state locally) lives in `packages/build-tools/explorer` but is **deprecated and excluded from publishing** — see [Explorer](../100-components/107-explorer.md). The internal `packages/build-tools/tui` sources are likewise not a publishable package.
:::

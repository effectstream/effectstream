# Architecture

> This section is intended for developers who require advanced knowledge about the engine or plan to contribute to `Effectstream`

Effectstream is distributed for `deno` through `NPM` and `JSR` packages

## NPM Packages:

*  @effectstream/evm-contracts  
    Effectstream EVM default contracts (Forge/Hardhat/Ignition) and published artifacts/ABIs.
    
*  @effectstream/npm-avail-light-client  
    A wrapper for the Avail Light Client CLI.

*  @effectstream/npm-avail-node  
    A wrapper for the Avail node binary.

*  @effectstream/npm-midnight-indexer  
    Downloads and runs the Midnight Indexer. It needs a running Midnight Node.

*  @effectstream/npm-midnight-node  
    Downloads and starts the binary for Midnight Node.

*  @effectstream/npm-midnight-proof-server  
    A wrapper for the Midnight proof server binary.

## JSR Packages:
*  @effectstream/batcher  
    HTTP service to collect and submit user inputs, replacing the need for manually sending input to the blockchain Effectstream L2 contract.

*  @effectstream/chain-types  
    Common chain types and hashing helpers shared across modules.

*  @effectstream/collector  
    Lightweight OpenTelemetry collector gateway (Fastify) to receive and forward metrics/logs. Intended for development only.

*  @effectstream/concise  
    Client SDK for submitting moves and interacting with the batcher; includes v2 helpers and delegate wallet utilities.

*  @effectstream/config  
    Central configuration schemas and loaders; parses env and provides type-safe config for multi-chain setups.

*  @effectstream/coroutine  
    Generator-based effect system used by the state machine to compose async operations.

*  @effectstream/crypto  
    Cross-chain cryptography utilities (EVM/Cardano/Mina), including signature verification primitives.

*  @effectstream/db  
    Typed database layer (pgtyped), connection helpers, event indexing, dynamic tables, scheduled constructors, and DB scripts for launching in-memory pgsql for development.

*  @effectstream/docs  
    This documentation.

*  @effectstream/explorer  
    Web explorer (Vite + React + Oak) to inspect chain and game state locally.

*  @effectstream/log  
    Logging and observability utilities.

*  @effectstream/orchestrator  
    Process orchestration to coordinate services, wait for DB/chain readiness, and manage production and local environments.

*  @effectstream/precompile  
    Helpers to derive deterministic EVM precompile addresses from names/enums.

*  @effectstream/runtime  
    Node runtime; boots HTTP/RPC server, loads config, and orchestrates processing of chain sync.

*  @effectstream/sm  
    State Machine SDK; define grammar-driven transitions with and routes.

*  @effectstream/sync  
    Chain synchronization protocols and factory; Processing of different chains as EVM, Cardano, Midnight and Avail to feed the main sync engine.

*  @effectstream/tui  
    Terminal UI for monitoring logs and services.

*  @effectstream/utils  
    Shared utilities (config helpers, address/encoding, concurrency, decorators, constants, captcha, viem wrappers).

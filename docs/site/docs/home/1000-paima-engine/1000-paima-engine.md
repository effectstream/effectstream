# Architecture

> This section is intended for developers who require advanced knowledge about the engine or plan to contribute to `Paima Engine`

Paima is distributed for `deno` through `NPM` and `JSR` packages

## NPM Packages:

*  @paimaexample/evm-contracts  
    Paima EVM default contracts (Forge/Hardhat/Ignition) and published artifacts/ABIs.
    
*  @paimaexample/npm-avail-light-client  
    A wrapper for the Avail Light Client CLI.

*  @paimaexample/npm-avail-node  
    A wrapper for the Avail node binary.

*  @paimaexample/npm-midnight-indexer  
    Downloads and runs the Midnight Indexer. It needs a running Midnight Node.

*  @paimaexample/npm-midnight-node  
    Downloads and starts the binary for Midnight Node.

*  @paimaexample/npm-midnight-proof-server  
    A wrapper for the Midnight proof server binary.

## JSR Packages:
*  @paimaexample/batcher  
    HTTP service to collect and submit user inputs, replacing the need for manually sending input to the blockchain Paima-L2 contract.

*  @paimaexample/chain-types  
    Common chain types and hashing helpers shared across modules.

*  @paimaexample/collector  
    Lightweight OpenTelemetry collector gateway (Fastify) to receive and forward metrics/logs. Intended for development only.

*  @paimaexample/concise  
    Client SDK for submitting moves and interacting with the batcher; includes v2 helpers and delegate wallet utilities.

*  @paimaexample/config  
    Central configuration schemas and loaders; parses env and provides type-safe config for multi-chain setups.

*  @paimaexample/coroutine  
    Generator-based effect system used by the state machine to compose async operations.

*  @paimaexample/crypto  
    Cross-chain cryptography utilities (EVM/Cardano/Mina), including signature verification primitives.

*  @paimaexample/db  
    Typed database layer (pgtyped), connection helpers, event indexing, dynamic tables, scheduled constructors, and DB scripts for launching in-memory pgsql for development.

*  @paimaexample/docs  
    This documentation.

*  @paimaexample/explorer  
    Web explorer (Vite + React + Oak) to inspect chain and game state locally.

*  @paimaexample/log  
    Logging and observability utilities.

*  @paimaexample/orchestrator  
    Process orchestration to coordinate services, wait for DB/chain readiness, and manage production and local environments.

*  @paimaexample/precompile  
    Helpers to derive deterministic EVM precompile addresses from names/enums.

*  @paimaexample/runtime  
    Node runtime; boots HTTP/RPC server, loads config, and orchestrates processing of chain sync.

*  @paimaexample/sm  
    State Machine SDK; define grammar-driven transitions with and routes.

*  @paimaexample/sync  
    Chain synchronization protocols and factory; Processing of different chains as EVM, Cardano, Midnight and Avail to feed the main sync engine.

*  @paimaexample/tui  
    Terminal UI for monitoring logs and services.

*  @paimaexample/utils  
    Shared utilities (config helpers, address/encoding, concurrency, decorators, constants, captcha, viem wrappers).

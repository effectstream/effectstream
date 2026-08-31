# Effectstream

A multi-chain Web3 engine for building multi-chain dApps, infrastructure and onchain games.
This project integrates with the Midnight Network.

[Home](https://effectstream.github.io/home/) · [Docs](https://effectstream.github.io/docs/) · [Blog](https://effectstream.github.io/docs/blog/)

- **Multi-chain by default.** EVM, Midnight, Bitcoin, Cardano, Avail, Celestia, and NEAR — one state machine, many chains.
- **Sovereign rollups.** App-specific L2s that inherit finality from the underlying L1, with no custodial bridge.
- **Modular.** Pick the chains and modules you need. Everything ships as a separate `@effectstream/*` package.
- **Bun-native.** The whole monorepo runs on Bun. No build step for development; TypeScript executes directly.

## Quick start

Install [Bun](https://bun.sh), [Foundry](https://www.getfoundry.sh/), and the
Compact compiler selection (`0.33.0-rc.2`) used by the EVM/Midnight template
before starting:

```sh
curl -L https://foundry.paradigm.xyz | bash && foundryup
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

Run a sample project:  
```sh
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/evm-midnight-v2
bun toolchain/compact.ts install
bun i
bun run dev
```

`bun run dev` brings up the full local stack: PGLite, Hardhat, a Midnight node, contract deployment, the sync node, the batcher, and the frontend. Open [http://localhost:10599](http://localhost:10599) once everything is up.

## What it is

Effectstream is a framework for building dApps that read state from multiple chains and fold their updates into a single deterministic state machine. You write your app logic in TypeScript, point it at one or more chains, and Effectstream handles sync (read), batching (write), indexing, and the frontend connection.

For more information visit the [docs site](https://effectstream.github.io/docs/).

## Templates

`templates/` has ready-to-run examples. Each one is a self-contained Bun workspace you can copy and modify.

| Template | What it shows |
|---|---|
| [`minimal`](templates/minimal/) | Smallest possible Effectstream app |
| [`evm-midnight-v2`](templates/evm-midnight-v2/) | EVM + Midnight, ERC-721 sync, ZK contracts, full React frontend |
| [`chess-v2`](templates/chess-v2/) | Onchain chess with matchmaking |
| [`batcher-validations`](templates/batcher-validations/) | Custom Batcher Validation |
| [`preorder`](templates/preorder/) | dApp (Cardano+EVM) for Assets Presale |
| [`zswap-da`](templates/zswap-da/) | Midnight Zswap for decentralized liquidity | 
| [`more`](templates/) | Explore the examples | 


## Repository layout

| Directory | What lives here |
|---|---|
| [`packages/effectstream-sdk/`](packages/effectstream-sdk/) | Core SDK: config, events, crypto, wallets, log, schemas, chain types |
| [`packages/node-sdk/`](packages/node-sdk/) | Runtime engine: database, state machine, sync, node entry point |
| [`packages/chains/`](packages/chains/) | Per-chain contract interfaces (EVM, Midnight, Bitcoin, Cardano, Avail) |
| [`packages/batcher/`](packages/batcher/) | Cross-chain transaction batching |
| [`packages/binaries/`](packages/binaries/) | NPM-wrapped blockchain node binaries |
| [`packages/build-tools/`](packages/build-tools/) | Orchestrator, explorer, TUI |
| [`packages/frontend/`](packages/frontend/) | React frontend SDK |
| [`e2e/`](e2e/) | Integration test suites (one per chain) |
| [`docs/site/`](docs/site/) | Docusaurus documentation site |

## Orchestrator

The orchestrator runs your dev stack. It supervises every process an Effectstream app needs (chains, contract deployment, sync node, batcher, frontend, plus any custom action you wire in) and gives you one place to start, stop, and inspect them. You don't have to be building a multi-chain app to want it; a single-chain dev loop is nicer with it too.

```sh
bunx orchestrator start --background   # --background enables status and logs
bunx orchestrator status
bunx orchestrator logs
bunx orchestrator stop
```

## Package Development

```sh
# Unit tests
bun test ./packages

# All e2e suites (run serially because they share ports)
cd e2e && bun run runner.ts

# Run a single suite (or a few)
cd e2e && bun run runner.ts evm bitcoin
```

Available suites: `evm`, `bitcoin`, `cardano`, `midnight`, `avail`, `celestia`, `near`, `features`, `wallets`.

Contribution guide: [`docs/site/docs/home/1000-effectstream-engine/1100-contributions.md`](docs/site/docs/home/1000-effectstream-engine/1100-contributions.md).

Some templates ship a `link.sh` script that points the dApp at the local `@effectstream/*` source instead of the published packages, so you can make improvements on the engine itself.

## Published packages

Everything below is published on npm under `@effectstream/*`. All packages share the same version line and are released together.

### Core SDK

| Package | Description |
|---|---|
| [`@effectstream/utils`](https://www.npmjs.com/package/@effectstream/utils) | Shared utilities |
| [`@effectstream/log`](https://www.npmjs.com/package/@effectstream/log) | OpenTelemetry observability |
| [`@effectstream/config`](https://www.npmjs.com/package/@effectstream/config) | Chain and runtime configuration |
| [`@effectstream/precompile`](https://www.npmjs.com/package/@effectstream/precompile) | Precompile utilities |
| [`@effectstream/chain-types`](https://www.npmjs.com/package/@effectstream/chain-types) | Chain-specific type definitions |
| [`@effectstream/crypto`](https://www.npmjs.com/package/@effectstream/crypto) | Multi-chain signature verification |
| [`@effectstream/concise`](https://www.npmjs.com/package/@effectstream/concise) | Type-safe schemas |
| [`@effectstream/event-client`](https://www.npmjs.com/package/@effectstream/event-client) | MQTT-based event client |
| [`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets) | Wallet connector integrations |
| [`@effectstream/coroutine`](https://www.npmjs.com/package/@effectstream/coroutine) | Async control flow |

### Node runtime

| Package | Description |
|---|---|
| [`@effectstream/db`](https://www.npmjs.com/package/@effectstream/db) | PostgreSQL and PgLite database layer |
| [`@effectstream/db-emulator`](https://www.npmjs.com/package/@effectstream/db-emulator) | In-memory test database |
| [`@effectstream/sync`](https://www.npmjs.com/package/@effectstream/sync) | Blockchain sync service |
| [`@effectstream/sm`](https://www.npmjs.com/package/@effectstream/sm) | State machine DSL |
| [`@effectstream/runtime`](https://www.npmjs.com/package/@effectstream/runtime) | State machine runtime |
| [`@effectstream/event-server`](https://www.npmjs.com/package/@effectstream/event-server) | Event server |
| [`@effectstream/node-sdk`](https://www.npmjs.com/package/@effectstream/node-sdk) | Main application node SDK |

### Chains

| Package | Description |
|---|---|
| [`@effectstream/evm-contracts`](https://www.npmjs.com/package/@effectstream/evm-contracts) | EVM smart contract interfaces |
| [`@effectstream/evm-hardhat`](https://www.npmjs.com/package/@effectstream/evm-hardhat) | Hardhat deployment and JSON-RPC utilities |
| [`@effectstream/midnight-contracts`](https://www.npmjs.com/package/@effectstream/midnight-contracts) | Midnight network contract interfaces |
| [`@effectstream/bitcoin-contracts`](https://www.npmjs.com/package/@effectstream/bitcoin-contracts) | Bitcoin script utilities |
| [`@effectstream/cardano-contracts`](https://www.npmjs.com/package/@effectstream/cardano-contracts) | Cardano contract interfaces |
| [`@effectstream/avail-contracts`](https://www.npmjs.com/package/@effectstream/avail-contracts) | Avail DA contract interfaces |

### Batcher

| Package | Description |
|---|---|
| [`@effectstream/batcher`](https://www.npmjs.com/package/@effectstream/batcher) | Cross-chain transaction batching |
| [`@effectstream/batcher-sdk`](https://www.npmjs.com/package/@effectstream/batcher-sdk) | Batcher SDK |

### Build tools & frontend

| Package | Description |
|---|---|
| [`@effectstream/orchestrator`](https://www.npmjs.com/package/@effectstream/orchestrator) | Multi-chain local development environment |
| [`@effectstream/tui`](https://www.npmjs.com/package/@effectstream/tui) | Terminal UI |
| [`@effectstream/frontend-sdk`](https://www.npmjs.com/package/@effectstream/frontend-sdk) | React frontend SDK |

### Binary wrappers

Third-party blockchain binaries packaged for npm so you can install them with `bun add` instead of curl-pipe-bash.

| Package | Description |
|---|---|
| [`@effectstream/bitcoin-core`](https://www.npmjs.com/package/@effectstream/bitcoin-core) | Bitcoin Core |
| [`@effectstream/ord`](https://www.npmjs.com/package/@effectstream/ord) | Ord |
| [`@effectstream/avail-light-client`](https://www.npmjs.com/package/@effectstream/avail-light-client) | Avail light client |
| [`@effectstream/avail-node`](https://www.npmjs.com/package/@effectstream/avail-node) | Avail node |
| [`@effectstream/midnight-node`](https://www.npmjs.com/package/@effectstream/midnight-node) | Midnight node |
| [`@effectstream/midnight-indexer`](https://www.npmjs.com/package/@effectstream/midnight-indexer) | Midnight indexer |
| [`@effectstream/midnight-proof-server`](https://www.npmjs.com/package/@effectstream/midnight-proof-server) | Midnight proof server |
| [`@effectstream/near-sandbox`](https://www.npmjs.com/package/@effectstream/near-sandbox) | NEAR sandbox |
| [`@effectstream/celestia`](https://www.npmjs.com/package/@effectstream/celestia) | Celestia |
| [`@effectstream/grafana-alloy`](https://www.npmjs.com/package/@effectstream/grafana-alloy) | Grafana Alloy |
| [`@effectstream/grafana-loki`](https://www.npmjs.com/package/@effectstream/grafana-loki) | Grafana Loki |

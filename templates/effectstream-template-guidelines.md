# Effectstream Template Specification

This document defines the canonical structure for Effectstream templates. Each template is a standalone Bun monorepo. All templates share one flat layout -- complexity is additive (more packages), not structural (deeper nesting).

SDK packages use `@effectstream/*` (from npm, or resolved automatically within the monorepo workspace). All `@effectstream/*` packages share a coordinated version — always use the same latest version for all of them.

**Bun workspace resolution**: Sibling packages (`@my-template/database`, `@my-template/contracts-evm`, etc.) are resolved by name automatically within a Bun workspace — you do NOT need `workspace:*` in dependencies. Just declare `"workspaces": ["packages/*"]` in the root `package.json` and import sibling packages by name. Bun creates the symlinks in `node_modules/@my-template/` during `bun install`.

---

## Quick-Reference Checklist

Use this as a step-by-step guide when building a new template or migrating an existing one. Each item links to its detailed section.

### 1. Scaffold

- [ ] Create root `package.json` with workspaces and `effectstream.default` — [Root package.json](#root-packagejson)
- [ ] Set up flat `packages/*` directory layout — [Directory Structure](#directory-structure)

### 2. Orchestrator (`start.dev.ts`)

Define the orchestrator first — it declares which chains and services your template needs, and drives all subsequent decisions.

- [ ] Create `start.dev.ts` at project root — [Orchestrator](#6-orchestrator-startdevts)
- [ ] Add `launchPglite()` (always required) — [Orchestrator](#6-orchestrator-startdevts)
- [ ] Add chain launcher(s) for your target chains — [Orchestrator](#6-orchestrator-startdevts)
- [ ] Add sync node process with correct `dependsOn` — [Orchestrator](#6-orchestrator-startdevts)

### 3. Contracts

Create `packages/contracts-{chain}/` for each chain your template targets. Some chains require compilation steps that are handled by the orchestrator launchers defined in step 2.

Currently supported chains (see `e2e/shared/contracts/*` for reference implementations):

| Chain | Contract package | Compilation | Launcher |
|-------|-----------------|-------------|----------|
| EVM | `contracts-evm/` | Hardhat + Forge | `launchEvm` |
| Midnight | `contracts-midnight/` | Compact compiler (`+0.31.0`) | `launchMidnight` |
| Bitcoin | `contracts-bitcoin/` | None (scripts only) | `launchBitcoin` |
| Cardano | `contracts-cardano/` | None (Yaci devkit) | `launchCardano` |
| NEAR | `contracts-near/` | Rust → WASM | `launchNear` |
| Solana | `contracts-solana/` | Rust → SBF (`cargo-build-sbf`) | `launchSolana` |
| Avail | `contracts-avail/` | None (config + deploy) | `launchAvail` |
| Celestia | `contracts-celestia/` | None (fund bridge) | — |

- [ ] Create contract package(s) for your chain(s) — [EVM Contracts](#8-evm-contracts), [Multi-chain Templates](#multi-chain-templates-midnight-bitcoin-etc)
- [ ] Implement required scripts expected by the launcher (e.g., `hardhat:start`, `midnight-node:start`) — [Orchestrator](#6-orchestrator-startdevts)
- [ ] **Compile each contract package and verify it succeeds before moving on** — catch issues early before building dependent packages
- [ ] Verify `start.dev.ts` launcher can resolve and run the contract package — [Orchestrator](#6-orchestrator-startdevts)

### 4. Database

- [ ] Create `packages/database/migrations/000-init.sql` with your schema — [Database Migrations](#7-database-migrations)
- [ ] Create `packages/database/migration-order.ts` exporting `migrationTable` — [Database Migrations](#7-database-migrations)
- [ ] Add pgtyped `.sql` queries in `packages/database/sql/` — [Database Migrations](#7-database-migrations)
- [ ] **Run `bun run build:pgtypes` to generate `.queries.ts` files and verify it succeeds before moving on** — [Database Migrations](#7-database-migrations)
- [ ] Create `packages/database/mod.ts` re-exporting generated queries + migrations — [Database Migrations](#7-database-migrations)

> **RULE: No raw SQL in application code.** Only pgtyped-generated `PreparedQuery` objects (exported from `@my-template/database`) may be used to access the database. Raw SQL strings are only allowed inside `packages/database/sql/*.sql` source files. The node package, API routes, state machine, and tests must all use the generated typed queries via `World.resolve` or `runPreparedQuery`.

### 5. Node (sync engine)

- [ ] Define grammar in `packages/node/grammar.ts` — [Grammar](#1-grammar-grammarts)
- [ ] Build config with `ConfigBuilder` in `packages/node/config.dev.ts` — [Config](#2-config-configdevts--configmainnetts)
- [ ] Wire state transitions in `packages/node/state-machine.ts` — [State Machine](#3-state-machine-state-machinets)
- [ ] Add API routes in `packages/node/api.ts` — [API Routes](#5-api-routes-apits)
- [ ] Create entry point `packages/node/main.dev.ts` — [Entry Point](#4-entry-point-maindevts--mainmainnetts)

### 6. Batcher

The batcher is chain-specific — each target chain requires its own adapter. See `e2e/{chain}/batcher/` for working examples.

Available adapters (`@effectstream/batcher-sdk`):

| Adapter | Chain | Batching criteria |
|---------|-------|-------------------|
| `EffectstreamL2DefaultAdapter` | EVM | time, size, hybrid |
| `EvmContractAdapter` | EVM (custom contract) | time, size, hybrid |
| `MidnightAdapter` | Midnight | size (typically 1) |
| `BitcoinAdapter` | Bitcoin | hybrid |
| `NearAdapter` | NEAR | time, size |
| `NearIntentAdapter` | NEAR (intents) | time, size |
| `SolanaAdapter` | Solana (fee-payer sponsor) | size |

- [ ] Create adapter config factories (e.g., `packages/batcher/effectstream-l2.ts`) — [Batcher Package](#batcher-package)
- [ ] Create `packages/batcher/batcher.dev.ts` entry point — [Batcher Package](#batcher-package)
- [ ] Add batcher process to `start.dev.ts` with correct `dependsOn` — [Orchestrator](#6-orchestrator-startdevts)

### 7. Frontend (optional)

The frontend is framework-agnostic — use any stack (Vite, Next.js, plain HTML, etc.). If no specific framework is chosen, the default setup is Vite + React + a Fastify static server.

- [ ] Create `packages/frontend/` with your chosen framework
- [ ] Configure `EffectstreamConfig` (appName must match batcher namespace)
- [ ] Add build and serve scripts to the package
- [ ] Add frontend-build and frontend-server processes to `start.dev.ts`

**Frontend SDK usage** (`@effectstream/wallets`):

```ts
// packages/frontend/client/src/PaimaEngineConfig.ts
import { EffectstreamConfig } from "@effectstream/wallets";
import { hardhat } from "viem/chains";

export const paimaEngineConfig = new EffectstreamConfig(
  "",              // appName — MUST match BatcherConfig.namespace
  "mainEvmRPC",   // sync protocol name (from config.dev.ts)
  "0x5FbDB...",   // EffectstreamL2 contract address
  hardhat,        // viem chain definition
  undefined,      // optional overrides
  "http://localhost:3334", // batcher URL
  true,           // preferBatchedMode
);
```

```ts
// Wallet connection
import { walletLogin, WalletMode } from "@effectstream/wallets";
const wallet = await walletLogin(paimaEngineConfig, WalletMode.EvmInjected);
// For local dev with Hardhat accounts, use WalletMode.EvmEthers with a private key
```

```ts
// Writing transactions (concise data array matches grammar definition order)
import { sendTransaction } from "@effectstream/wallets";
await sendTransaction(
  wallet,
  ["createRoom", "my-room", 4],  // [grammarKey, ...values with proper JS types]
  paimaEngineConfig,
  "wait-effectstream-processed",
);
```

**Browser-side wallet pattern (no batcher)**: (FOR DEVELOPMENT ONLY) For Cardano templates that build and submit transactions directly in the browser (e.g., using Lucid Evolution), there is no batcher. The frontend uses Lucid to construct, sign, and submit transactions to the YACI devkit. The node API is GET-only — it serves indexed data from the EffectStream database but never receives write requests from the frontend. This pattern requires:
- Lucid Evolution packages: `@lucid-evolution/lucid`, `@lucid-evolution/provider`, `@lucid-evolution/utils`, `@lucid-evolution/core-types`
- A Fastify static server with proxies to YACI (`/yaci/*`) and Dolos (`/dolos/*`) in addition to the API (`/api/*`)
- Browser-side seed phrase storage in `localStorage` for dev wallet persistence

**Fastify proxy path-rewriting pitfall**: When proxying `/api/*` to the upstream node (e.g., `http://localhost:9999`), do NOT strip the `/api` prefix if the upstream expects it. Use an empty string as the prefix to forward the path as-is:
```ts
// WRONG — forwards /api/locks as /locks → 404
await proxyRequest(API_URL, "/api", request, reply);

// CORRECT — forwards /api/locks as /api/locks
await proxyRequest(API_URL, "", request, reply);
```
For proxies where the prefix IS artificial (e.g., `/yaci/*` → YACI at localhost:10000), strip it: `proxyRequest(YACI_URL, "/yaci", request, reply)`.

**Fastify proxy with CBOR support**: If the frontend proxies to a Cardano submit endpoint that expects `application/cbor`, register a content type parser for CBOR in Fastify:
```ts
server.addContentTypeParser("application/cbor", { parseAs: "buffer" }, (_req, body, done) => {
  done(null, body);
});
```

### 8. Tests

- [ ] Create `packages/tests/start.test.ts` (test orchestrator config) — [Test Launcher](#test-launcher-starttestts)
- [ ] Create `packages/tests/helpers.ts` with `assert` / `assertSQL` — [Test Helpers](#test-helpers)
- [ ] Create `packages/tests/infra/` Phase A tests (chain health, deploy) — [Phase A: Infrastructure](#phase-a-infrastructure)
- [ ] Create `packages/tests/stm/` Phase B tests (submit tx, verify DB + API) — [Phase B: State Machine / DB / API](#phase-b-state-machine--db--api)
- [ ] Create `packages/tests/frontend/` Phase C tests (if frontend exists) — [Phase C+: Frontend](#phase-c-frontend)
- [ ] Create `packages/tests/run-tests.ts` orchestrating all phases — [Test Runner](#test-runner-run-teststs)
- [ ] Add `"test": "bun run packages/tests/run-tests.ts"` script to root `package.json` — [Running Tests](#running-tests)

### 9. Multi-environment

- [ ] Add `config.mainnet.ts` with env var validation — [Multi-Environment Pattern](#multi-environment-pattern)
- [ ] Add `main.mainnet.ts` importing mainnet config — [Multi-Environment Pattern](#multi-environment-pattern)
- [ ] Add `batcher/batcher.mainnet.ts` — [Multi-Environment Pattern](#multi-environment-pattern)
- [ ] Add `"start:mainnet"` script to root `package.json` — [Multi-Environment Pattern](#multi-environment-pattern)

### 10. Docker

- [ ] Create `Dockerfile` with correct chain dependencies — [Docker / Containerization](#docker--containerization)
- [ ] Create `.dockerignore` — [Docker / Containerization](#docker--containerization)
- [ ] Append Docker section to `README.md` — [README Docker Section](#readme-docker-section)

### 11. Verify

- [ ] `bun run dev` boots the full stack end-to-end — [Checklist for New Templates](#checklist-for-new-templates)
- [ ] `bun run test` passes all phases — [Checklist for New Templates](#checklist-for-new-templates)
- [ ] `docker build` succeeds — [Docker / Containerization](#docker--containerization)
- [ ] `docker run <image> bun run test` passes — [Docker / Containerization](#docker--containerization)

### 12. Template README

Every template MUST include a `README.md` at its root. Use the following canonical structure (see `chess-v2/README.md` and `evm-midnight-v2/README.md` as reference implementations):

| Section | Required | Content |
|---------|----------|---------|
| Title + one-liner | Yes | Template name + single sentence describing purpose and chains |
| Quick Start | Yes | `bun install` + any pre-build steps + `bun run dev` + dApp URL |
| Environments | Yes | Table comparing Dev vs Mainnet: chain, entry points, start commands |
| Mainnet env vars | Yes (if mainnet exists) | Table of required/optional env vars |
| Testing | Yes | `bun run test` + brief description of coverage |
| Project Structure | Yes | ASCII tree of `packages/` with workspace names |
| Package descriptions | Yes | Key-file table for node/batcher, prose for others |
| Services | Yes | Table of all services with ports |
| Game/App Mechanics | Recommended | Grammar inputs table + API endpoints table |

Guidelines:
- Keep under 150 lines for single-chain templates, under 200 for multi-chain
- Use tables over prose for structured information
- Ports and URLs must match what `start.dev.ts` actually configures
- Do not document internal implementation details — focus on "how to run" and "what's where"

- [ ] `README.md` follows the canonical structure above

---

## Directory Structure

Every template uses the same flat layout. Optional packages are marked.

```
my-template/
├── package.json                              # Bun workspaces: ["packages/*"]
├── start.dev.ts                              # Orchestrator config (bun run dev)
├── start.mainnet.ts                          # (optional) Mainnet orchestrator config
├── README.md
├── packages/
│   ├── node/                                 # The sync node
│   │   ├── package.json                      # @my-template/node
│   │   ├── main.dev.ts                       # Entry point (dev/local)
│   │   ├── main.mainnet.ts                   # (optional) Entry point (mainnet)
│   │   ├── state-machine.ts                  # Stm wiring (all game logic lives here)
│   │   ├── api.ts                            # Fastify API routes
│   │   ├── config.dev.ts                     # ConfigBuilder (dev networks + primitives)
│   │   ├── config.mainnet.ts                 # (optional) ConfigBuilder (mainnet)
│   │   └── grammar.ts                        # Grammar definition
│   │
│   ├── database/                             # SQL migrations + typed queries
│   │   ├── package.json                      # @my-template/database
│   │   ├── mod.ts                            # Re-exports queries + migrations
│   │   ├── migration-order.ts
│   │   ├── migrations/
│   │   │   └── 000-init.sql
│   │   └── sql/                              # pgtyped .sql + generated .queries.ts
│   │       ├── queries.sql
│   │       └── queries.queries.ts            # Generated
│   │
│   ├── contracts-evm/                        # (optional) EVM smart contracts
│   │   ├── package.json                      # @my-template/contracts-evm
│   │   ├── hardhat.config.ts
│   │   ├── deploy.ts
│   │   ├── mod.ts                            # Re-exports generated addresses (auto-generated)
│   │   ├── build/                            # Generated: ABIs, addresses
│   │   ├── src/contracts/
│   │   │   └── MyEffectstreamL2.sol
│   │   └── ignition/modules/
│   │       └── effectstreamL2.ts
│   │
│   ├── contracts-midnight/                   # (optional) Midnight contracts
│   │   ├── package.json                      # @my-template/contracts-midnight
│   │   ├── deploy.ts
│   │   └── contract-round-value/             # Sub-workspace (Compact contract)
│   │       ├── package.json                  # @my-template/midnight-contract
│   │       └── src/
│   │           ├── counter.compact           # Compact source
│   │           └── managed/                  # Compiled output (keys, zkir)
│   │
│   ├── contracts-bitcoin/                    # (optional) Bitcoin contracts
│   ├── contracts-cardano/                    # (optional) Cardano contracts
│   ├── contracts-near/                       # (optional) NEAR contracts
│   ├── contracts-solana/                     # (optional) Solana programs
│   │
│   ├── batcher/                              # (optional) Transaction batcher
│   │   ├── package.json                      # @my-template/batcher
│   │   ├── batcher.dev.ts                    # Batcher entry (dev)
│   │   ├── batcher.mainnet.ts                # (optional) Batcher entry (mainnet)
│   │   ├── effectstream-l2.ts                # Adapter factory (env-agnostic)
│   │   └── midnight-balancing.ts             # (optional) Midnight adapter factory
│   │
│   ├── frontend/                             # (optional) Web UI
│   │   ├── package.json                      # @my-template/frontend
│   │   ├── client/                           # React/Vite app
│   │   ├── server/main.ts                    # Fastify static server
│   │   └── vite.config.ts
│   │
│   └── tests/                                # Template test suite
│       ├── package.json                      # @my-template/tests
│       ├── run-tests.ts                      # Test runner (orchestrates all phases)
│       ├── start.test.ts                   # Orchestrator config for test infra
│       ├── helpers.ts                        # assert, assertSQL utilities
│       ├── infra/                            # Phase A: Infrastructure
│       │   ├── chain-ready.test.ts
│       │   └── deploy.test.ts
│       ├── stm/                              # Phase B: State machine + DB + API
│       │   ├── my-action.test.ts
│       │   └── api.test.ts
│       └── frontend/                         # Phase C+: Frontend
│           ├── build-smoke.test.ts
│           └── render.test.ts
```

### What changed from the previous Bun layout

These changes apply if you already migrated to Bun + `@effectstream/*` but are using the older flat layout (single `main.ts`, `config.ts`, `start.ts` inside `packages/node/`). For migrating from `@paimaexample/*` templates, see [Migrating from `@paimaexample/*` Templates](#migrating-from-paimaexample-templates).

| Old | New | Why |
|-----|-----|-----|
| `packages/node/start.ts` | `start.dev.ts` (root) | Orchestrator config lives at project root, not inside node |
| `packages/node/main.ts` | `packages/node/main.dev.ts` | Multi-environment entry points (`*.dev.ts`, `*.mainnet.ts`) |
| `packages/node/config.ts` | `packages/node/config.dev.ts` | Multi-environment configs |
| `@effectstream/orchestrator-v2` | `@effectstream/orchestrator` | Package renamed |
| `bunx orchestrator-v2 start` | `bunx orchestrator start` | CLI renamed |
| Batcher as a comment in orchestrator | `packages/batcher/` | Full batcher package with multi-env configs |
| No `effectstream.default` | `"effectstream": { "default": "start.dev.ts" }` | Tells the CLI which start file to use |

---

## Core Components

### 1. Grammar (`grammar.ts`)

Defines all actions the state machine can process. Each key maps to a built-in grammar (for chain event primitives) or a list of `[name, TypeboxSchema]` tuples (for custom actions).

```ts
import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  // Custom actions (submitted via EffectstreamL2 contract or batcher)
  createRoom: [
    ["roomName", Type.String({ maxLength: 32 })],
    ["maxPlayers", Type.Number({ minimum: 2, maximum: 8 })],
  ],

  // Built-in grammars for chain events -> STM
  nftTransfer: builtinGrammars.evmErc721,
  tokenTransfer: builtinGrammars.evmErc20,
} as const satisfies GrammarDefinition;
```

**Input wire format**: When submitting via `effectstreamSubmitGameInput` (or through the batcher), the JSON payload is `["grammarKey", value1, value2, ...]`. The first element must be the exact grammar object key (e.g., `"createRoom"`, not a short alias like `"c"`), and subsequent values must use proper JS types matching the Typebox schema — numbers as numbers, booleans as booleans. Passing `"4"` (string) when the schema expects `Type.Number()` will cause a parsing error.

**Built-in grammars** (from `@effectstream/sm/grammar`):

| Grammar key | Chain | Use |
|-------------|-------|-----|
| `evmErc20` | EVM | ERC-20 Transfer events (`{ from, to, value }`) |
| `evmErc721` | EVM | ERC-721 Transfer events (`{ from, to, tokenId }`) |
| `evmErc1155` | EVM | ERC-1155 TransferSingle events (`{ from, to, tokenId, amount }`) |
| `midnightGeneric` | Midnight | Generic ledger contract state (`{ payload }`) |
| `bitcoinAddress` | Bitcoin | Address transaction events |
| `utxorpcGeneric` | Cardano | Generic UTXO events |
| `cardanoMintBurn` | Cardano | Mint/burn events (`{ policy, asset, quantity }`) |
| `cardanoTransfer` | Cardano | ADA/token transfer events (`{ address, amount, ... }`) |
| `cardanoPoolDelegation` | Cardano | Stake delegation certificates (`{ address, pool, epoch }`) |
| `cardanoDelayedAsset` | Cardano | Delayed asset claims |
| `cardanoProjectedNft` | Cardano | Projected NFT state |
| `availGeneric` | Avail | Application data submissions |
| `celestiaGeneric` | Celestia | Blob data events |
| `nearNep141` | NEAR | NEP-141 fungible token events |
| `nearNep171` | NEAR | NEP-171 NFT events |
| `nearNep245` | NEAR | NEP-245 multi-token events |
| `nearIntent` | NEAR | DIP-4 intent events |
| `solanaProgramLog` | Solana | Program log lines, scoped to the invoking program |
| `solanaAccountBalance` | Solana | Watched address lamport balance |
| `nearGeneric` | NEAR | NEP-297 generic events |
| `nearAccountWatch` | NEAR | Function call tracking |

### 2. Config (`config.dev.ts` / `config.mainnet.ts`)

Uses `ConfigBuilder` to declare networks, sync protocols, and primitives. Separate files per environment.

```ts
import { contractAddressesEvmMain } from "@my-template/contracts-evm";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { PrimitiveTypeEVMERC721 } from "@effectstream/sm/builtin";
import { hardhat } from "viem/chains";

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("my-template"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addViemNetwork({ ...hardhat, name: "evmMain" })
  )
  .buildDeployments((builder) =>
    builder
      .addDeployment(
        (networks) => networks.evmMain,
        (_network) => ({
          name: "Erc721DevModule#Erc721Dev",
          address: contractAddressesEvmMain()
            .chain31337["Erc721DevModule#Erc721Dev"],
        }),
      )
  )
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (network, deployments) => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => networks.evmMain,
        (network, deployments) => ({
          name: "parallelEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 500,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "MyERC721",
          type: PrimitiveTypeEVMERC721,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain()
              .chain31337["Erc721DevModule#Erc721Dev"],
          stateMachinePrefix: "nftTransfer",
        }),
      )
  )
  .build();
```

**Mainnet config** (`config.mainnet.ts`) follows the same pattern but:
- Validates required env vars (`EVM_RPC_URL`, `EVM_START_BLOCK`, etc.)
- Uses real chain definitions (e.g., `arbitrum` from `viem/chains` with custom RPC)
- Sets production-appropriate polling intervals, step sizes, and confirmation depths

**NTP start time recovery**: For deterministic replay, the NTP start time can be recovered from the database when restarting. This is one of the few cases where a raw query is acceptable — it reads from the engine's internal `effectstream.sync_protocol_pagination` table (not the application schema), so it doesn't need a pgtyped query in `@my-template/database`:
```ts
const dbConn = getConnection();
try {
  const result = await dbConn.query(`
    SELECT * FROM effectstream.sync_protocol_pagination
    WHERE protocol_name = '${mainSyncProtocolName}'
    ORDER BY page_number ASC LIMIT 1
  `);
  if (result?.rows.length) {
    launchStartTime = result.rows[0].page.root -
      (result.rows[0].page_number * 1000);
  }
} catch { /* DB not initialized yet */ }
```

### 3. State Machine (`state-machine.ts`)

Each grammar key maps to a state transition via `Stm.addStateTransition`. Transitions are generator functions that use `World.resolve` for typed queries and `World.promise` for raw async operations.

All game logic lives here -- there is no separate `game-logic` package or `tick.ts`.

**All database access must use pgtyped `PreparedQuery` objects** imported from `@my-template/database`. Never write raw SQL strings in the state machine — use `World.resolve(queryFn, params)` with generated queries.

```ts
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { insertRoom, getRoomByName } from "@my-template/database";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("createRoom", function* (data) {
  const { blockHeight, parsedInput, signerAddress: user } = data;
  // parsedInput is typed: { roomName: string, maxPlayers: number }

  yield* World.resolve(insertRoom, {
    room_name: parsedInput.roomName,
    max_players: parsedInput.maxPlayers,
    creator: user,
    block_height: blockHeight,
  });
});

stm.addStateTransition("nftTransfer", function* (data) {
  const { to, tokenId } = data.parsedInput;
  yield* World.resolve(insertOwnership, {
    token_id: tokenId,
    owner: to,
    block_height: data.blockHeight,
  });
});

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
```

**State transition context** (`data`) provides:
- `parsedInput` -- Typed fields from the grammar
- `blockHeight` -- Block number this input was indexed at
- `blockTimestamp` -- Unix timestamp of the block
- `signerAddress` -- Wallet address that signed the transaction
- `randomGenerator` -- Deterministic PRNG seeded by block hash
- `emit(event, payload)` -- Emit a custom app event (see "Custom Events" below)

### 3a. Custom Events

Apps can declare typed events in the state machine and subscribe to them from the frontend. Events are delivered after MQTT, with two important guarantees:

1. **Post-COMMIT delivery** — when a subscriber receives an event, a follow-up API query will see the rows the STF wrote. The frontend never races ahead of the database.
2. **Drop on rollback** — events emitted by an STF that throws (or by a block that fails to commit) are never published. No ghost events.

A small `@my-template/shared` package keeps the event declarations in one place so the state machine and the frontend stay in sync. The node + frontend packages both depend on it.

**Declare** (`packages/shared/app-events.ts`):

```ts
import { Type } from "@sinclair/typebox";
import { genEvent, registerEvents } from "@effectstream/event-client";

export const AppEvents = registerEvents({
  RoomCreated: genEvent({
    name: "RoomCreated",
    fields: [
      { name: "roomId",   type: Type.Integer(), indexed: true  },
      { name: "creator",  type: Type.String(),  indexed: true  },
      { name: "roomName", type: Type.String() },
      { name: "maxPlayers", type: Type.Number() },
    ],
  }),
});
```

`registerEvents` auto-prepends `blockHeight` as the first indexed field — apps never declare or set it. Topic shape is `app/{topicHash}/{blockHeight}/{roomId}/{creator}`. Indexed fields of complex types (objects, arrays) are auto-hashed to a string for MQTT topic compatibility.

The `packages/shared/package.json` is tiny — just typebox and the event client:

```json
{
  "name": "@my-template/shared",
  "version": "1.0.0",
  "exports": { "./app-events": "./app-events.ts" },
  "dependencies": {
    "@effectstream/event-client": "0.100.13",
    "@sinclair/typebox": "0.34.41"
  }
}
```

**Emit** (`packages/node/state-machine.ts`):

```ts
import { AppEvents } from "@my-template/shared/app-events";

stm.addStateTransition("createRoom", function* (data) {
  const { roomName, maxPlayers } = data.parsedInput;
  const [{ id: roomId }] = yield* World.resolve(insertRoom, {
    room_name: roomName, max_players: maxPlayers,
    creator: data.signerAddress!, block_height: data.blockHeight,
  });

  // Buffered now, published to MQTT after this block's COMMIT.
  // If the STF throws below, this event is dropped along with the DB writes.
  data.emit(AppEvents.RoomCreated, {
    roomId, creator: data.signerAddress!, roomName, maxPlayers,
  });
});
```

The `data.emit` closure runs synchronously and never throws — it just pushes into a per-input buffer. The runtime promotes the buffer to a per-block buffer on STF success, drops it on failure, and flushes to MQTT only after the block-level `COMMIT` completes.

**Subscribe** (`packages/frontend/.../page.tsx`):

```tsx
import { EventManager } from "@effectstream/event-client";
import { AppEvents } from "@my-template/shared/app-events";

useEffect(() => {
  if (!walletAddress) return;
  let sym: symbol | undefined;
  let cancelled = false;
  EventManager.Instance.subscribe(
    {
      topic: AppEvents.RoomCreated,
      filter: {
        creator: walletAddress.toLowerCase(),  // narrow to me
        roomId: undefined,                     // any room
        blockHeight: undefined,                // any block
      },
    },
    (event) => {
      console.log(`Room ${event.roomId} (${event.roomName}) created at block ${event.blockHeight}`);
      setRefreshKey((k) => k + 1);  // trigger API refetch
    },
  )
    .then((s) => { cancelled ? EventManager.Instance.unsubscribe(s) : (sym = s); });
  return () => { cancelled = true; if (sym) EventManager.Instance.unsubscribe(sym); };
}, [walletAddress]);
```

The filter takes the same shape as the event declaration. Set `undefined` on a field to wildcard it (MQTT `+`), or supply a value to narrow.

**Notes on durability**: events are *live notifications*, not a persistent log. A subscriber that connects after a block has finalized will not see past events. If you need replay, query the API for the corresponding DB state. Future: a `/api/events` REST endpoint backed by an event-log table.

**Notes on replay**: if the engine re-syncs from genesis (e.g. after a reset), every STF re-runs and every event re-emits. Subscribers should be idempotent — events are best treated as "refresh this view" signals rather than authoritative state.

**Working example**: see `templates/preorder/packages/shared/app-events.ts`, `templates/preorder/packages/node/state-machine.ts` (the `data.emit(AppEvents.PreorderPlaced, ...)` calls), and `templates/preorder/packages/frontend/client/src/pages/LaunchpadDetail.tsx` (the `EventManager.Instance.subscribe` useEffect).

### 4. Entry Point (`main.dev.ts` / `main.mainnet.ts`)

Separate entry points per environment. Each imports its corresponding config file.

```ts
import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { config } from "./config.dev.ts";
import { grammar } from "./grammar.ts";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { migrationTable } from "@my-template/database";

main(function* () {
  yield* init();
  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "my-template",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });
  yield* suspend();
});
```

**StartConfig fields**:

| Field | Required | Description |
|-------|----------|-------------|
| `appName` | Yes | Application identifier |
| `appVersion` | Yes | Semantic version (`"1.0.0"`) |
| `syncInfo` | Yes | From `toSyncProtocolWithNetwork(config)` |
| `appStateTransitions` | Yes | The STM router function |
| `migrations` | Yes | SQL migration table |
| `grammar` | Yes | Grammar definition |
| `apiRouter` | No | Fastify route registration |
| `userDefinedPrimitives` | No | Custom primitive constructors (see Custom Primitives) |
| `snapshotConfig` | No | Periodic DB snapshot settings |

### 5. API Routes (`api.ts`)

API routes use `runPreparedQuery` with pgtyped-generated queries from `@my-template/database`. No raw SQL strings — all database access goes through the typed query layer.

```ts
import { runPreparedQuery } from "@effectstream/db";
import { getItems } from "@my-template/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get("/api/items", async (_request, reply) => {
    const result = await runPreparedQuery(
      getItems.run(undefined, dbConn),
      "/api/items",
    );
    reply.send(result);
  });
};
```

### 6. Orchestrator (`start.dev.ts`)

Lives at the project root. Manages all processes for `bun run dev`.

```ts
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),

    {
      name: "sync",
      description: "Sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
    },

    // Optional: batcher
    // {
    //   name: "batcher",
    //   description: "Transaction batcher",
    //   args: ["run", "packages/batcher/batcher.dev.ts"],
    //   waitToExit: false,
    //   type: "system-dependency",
    //   link: "http://localhost:3334",
    //   stopProcessAtPort: [3334],
    //   dependsOn: [EvmNames.GENERATE_MOD],
    // },

    // Optional: frontend
    // {
    //   name: "frontend-build",
    //   description: "Build frontend",
    //   cwd: path.join(root, "packages/frontend"),
    //   args: ["run", "build"],
    //   waitToExit: true,
    //   type: "system-dependency",
    //   critical: true,
    //   dependsOn: [EvmNames.GENERATE_MOD],
    // },
    // {
    //   name: "frontend-server",
    //   description: "Serve frontend",
    //   cwd: path.join(root, "packages/frontend"),
    //   args: ["run", "serve"],
    //   waitToExit: false,
    //   type: "system-dependency",
    //   link: "http://localhost:10599",
    //   stopProcessAtPort: [10599],
    //   dependsOn: ["frontend-build"],
    // },
  ],
} satisfies OrchestratorConfig;
```

**Launcher helpers** -- each returns a `ProcessConfig[]` and exports named constants for `dependsOn`:

| Launcher | Import path | Names export | Required package scripts |
|----------|-------------|--------------|--------------------------|
| `launchPglite()` | `@effectstream/orchestrator/launch-pglite` | `DbNames` | (none -- uses engine's PGLite) |
| `launchEvm(pkg, location)` | `@effectstream/orchestrator/launch-evm` | `EvmNames` | `build:hardhat`, `hardhat:start`, `hardhat:wait`, `deploy`, `build:mod` |
| `launchMidnight(pkg, location, opts?)` | `@effectstream/orchestrator/launch-midnight` | `MidnightNames` | `midnight-node:start/wait`, `midnight-indexer:start/wait`, `midnight-proof-server:start/wait`, `midnight-contract:deploy` |
| `launchBitcoin(pkg, location)` | `@effectstream/orchestrator/launch-bitcoin` | `BitcoinNames` | `chain:start`, `chain:wait`, `mine-blocks`, `wait-for-block` |
| `launchCardano(pkg, location)` | `@effectstream/orchestrator/launch-cardano` | `CardanoNames` | `yaci-devkit:start/wait`, `dolos:*`, `cardano:submit-tx` |
| `launchNear(pkg, location)` | `@effectstream/orchestrator/launch-near` | `NearNames` | `chain:start`, `chain:wait` |
| `launchAvail(pkg, location)` | `@effectstream/orchestrator/launch-avail` | `AvailNames` | `avail-node:start`, `avail-light-client:*` |

**Location parameter**: Each launcher accepts a `ResolveLocation` -- either `{ resolveFrom: root }` (resolve the package name via `require.resolve` from the given directory) or `{ cwd: "/absolute/path" }` (use a known directory directly). **Always use `{ cwd }` for all chains** — Bun workspace resolution with `{ resolveFrom }` breaks both locally (because `require.resolve` runs from `.bun/` cache instead of the workspace root) and in Docker (because `bun install` doesn't create workspace symlinks in `node_modules/`). The `{ cwd }` approach uses direct filesystem paths and works reliably everywhere.

**`cwd` examples for each chain launcher**:

```ts
const root = import.meta.dirname!;

// EVM
...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),

// Cardano
...launchCardano("@my-template/contracts-cardano", { cwd: path.join(root, "packages/contracts-cardano") }),

// Midnight (third arg is options like env overrides)
...launchMidnight("@my-template/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
  env: { MIDNIGHT_STORAGE_PASSWORD: "..." },
}),
```

**ProcessConfig fields**:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique process identifier |
| `description` | `string` | Human-readable label |
| `args` | `string[]` | Command arguments (default command is `bun`) |
| `command` | `string` | Override command (e.g., `"deno"`) |
| `dependsOn` | `string[]` | Process names to wait for |
| `waitToExit` | `boolean` | Wait for process to exit (vs just launch) |
| `type` | `"system-dependency" \| "secondary"` | Critical vs optional |
| `critical` | `boolean` | Whether failure triggers shutdown |
| `env` | `Record<string, string>` | Environment variables |
| `cwd` | `string` | Working directory |
| `link` | `string` | URL for status output |
| `stopProcessAtPort` | `number[]` | Ports to free before launch |
| `autoStart` | `boolean` | Include in normal start |

### 7. Database Migrations

**`packages/database/package.json`**:

```json
{
  "name": "@my-template/database",
  "version": "1.0.0",
  "exports": "./mod.ts",
  "scripts": {
    "pgtyped:update": "bun run ./node_modules/@effectstream/db/scripts/pgtyped-update.ts"
  },
  "dependencies": {
    "@effectstream/config": "<latest>",
    "@effectstream/runtime": "<latest>",
    "@effectstream/db": "<latest>",
    "@pgtyped/runtime": "2.4.2",
    "pg": "^8.14.0",
    "effection": "^3.5.0"
  },
  "devDependencies": {
    "@paima/pgtyped-cli": "^2.4.5"
  }
}
```

The `pgtyped:update` script uses `@effectstream/db/scripts/pgtyped-update.ts` which handles everything in one shot: starts PGLite, applies system migrations, applies user migrations (from `migration-order.ts`), runs pgtyped codegen, then shuts down. No need for `concurrently` or manual DB orchestration.

**How to run pgtyped generation correctly**:

The script **must** be run from `packages/database/` as the working directory. It resolves three things relative to `process.cwd()`:
1. `migration-order.ts` (or `src/migration-order.ts`) — your user migrations
2. `pgtypedconfig.json` — pgtyped configuration
3. `node_modules/@paima/pgtyped-cli/lib/index.js` — the pgtyped CLI binary

There are two ways to invoke it:

```bash
# Option A: from the monorepo root using --filter (RECOMMENDED)
bun run --filter @my-template/database pgtyped:update

# Option B: cd into the database package and run the script directly
cd packages/database && bun run pgtyped:update
```

**Common mistakes that waste hours:**

1. **Running from the wrong directory**: If you run the script from the monorepo root without `--filter`, it looks for `migration-order.ts` and `pgtypedconfig.json` in the root directory (not in `packages/database/`), silently finds nothing, and generates empty `.queries.ts` files — or fails with cryptic errors.

2. **Port 5432 already in use**: The script starts its own PGLite server on port 5432. If another PGLite or PostgreSQL instance is already running on that port (e.g., from the orchestrator or a previous run), it will fail. Kill the existing process first: `lsof -ti :5432 | xargs kill -9`.

3. **Missing `@paima/pgtyped-cli` in devDependencies**: The script shells out to `node_modules/@paima/pgtyped-cli/lib/index.js`. If the package isn't installed (it's a devDependency), the script will fail. Run `bun install` first.

4. **Forgetting to add the root convenience script**: Add `"build:pgtypes": "bun run --filter @my-template/database pgtyped:update"` to the root `package.json` so it can be invoked as `bun run build:pgtypes` from anywhere in the monorepo.

**`packages/database/pgtypedconfig.json`**:

```json
{
  "transforms": [
    { "mode": "sql", "include": "**/*.sql", "emitTemplate": "{{dir}}/{{name}}.queries.ts" }
  ],
  "srcDir": "./sql",
  "failOnError": false,
  "camelCaseColumnNames": false,
  "db": { "dbName": "postgres", "user": "postgres", "password": "postgres", "host": "localhost", "port": 5432, "ssl": false },
  "maxWorkerThreads": 1
}
```

```ts
// packages/database/migration-order.ts
import type { DBMigrations } from "@effectstream/runtime";
import initSql from "./migrations/000-init.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  { name: "000-init.sql", sql: initSql },
];
```

```sql
-- packages/database/migrations/000-init.sql
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  token_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  UNIQUE (token_id)
);
```

**pgtyped query generation**: After writing SQL migrations and query files, run the pgtyped update script to generate type-safe TypeScript queries:
```bash
bun run build:pgtypes
# This runs: bun run --filter @my-template/database pgtyped:update
```

This generates `sql/*.queries.ts` files from your `sql/*.sql` files. **These generated queries are the ONLY way to access the database in the entire codebase.** No raw SQL strings are allowed anywhere outside `packages/database/sql/*.sql` source files. The state machine, API routes, and tests must all use `PreparedQuery` objects from `@my-template/database` via `World.resolve` (in STM transitions) or `runPreparedQuery` (in API routes).

Verify the generation succeeds before proceeding to the node package — if the SQL is invalid or the schema doesn't match, downstream code will have wrong types.

**Commit the generated `.queries.ts` files.** They are required for import resolution — without them, sibling packages (`@my-template/node`) cannot import from `@my-template/database`. Re-generate them whenever you change the SQL source files.

The `mod.ts` re-exports everything:
```ts
// packages/database/mod.ts
export * from "./sql/queries.queries.ts";
export { migrationTable } from "./migration-order.ts";
```

### 8. EVM Contracts

**After creating each contract package, compile it and verify success before moving on.** For EVM: `bun run build:evm`. For Midnight: `bun run build:midnight`. Catching compilation errors early prevents cascading failures in dependent packages (node, batcher, frontend).

**`mod.ts` is auto-generated.** The orchestrator's `generate-evm-mod` step creates `packages/contracts-evm/mod.ts` during `bun run dev` (and during `bun run build:evm`). This file exports `contractAddressesEvmMain()` which reads deployed addresses from `ignition/deployments/`. Do not hand-maintain this file — it will be overwritten. The generated file also re-exports from `./build/mod.ts` and `./build/contracts.ts` (ABI bindings when forge artifacts exist).

**Solidity** -- extend `EffectstreamL2Contract`:

```solidity
// packages/contracts-evm/src/contracts/MyEffectstreamL2.sol
pragma solidity ^0.8.20;

import {EffectstreamL2Contract} from "@effectstream/evm-contracts/src/contracts/EffectstreamL2Contract.sol";

contract MyEffectstreamL2 is EffectstreamL2Contract {
    constructor(address _owner, uint256 _fee) EffectstreamL2Contract(_owner, _fee) {}
}
```

**Ignition module**:

```ts
// packages/contracts-evm/ignition/modules/effectstreamL2.ts
import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("EffectstreamL2Module", (m) => {
  const owner = m.getParameter("owner");
  const fee = m.getParameter("fee");
  const contract = m.contract("MyEffectstreamL2", [owner, fee]);
  return { contract };
});
```

**Hardhat config**:

```ts
// packages/contracts-evm/hardhat.config.ts
import type { HardhatUserConfig } from "hardhat/config";
import {
  createHardhatConfig,
  createNodeTasks,
  initTelemetry,
} from "@effectstream/evm-hardhat/hardhat-config-builder";
import { JsonRpcServerImplementation } from "@effectstream/evm-hardhat/json-rpc-server";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import fs from "node:fs";
import waitOn from "wait-on";

initTelemetry("@effectstream/log", "./package.json");

const nodeTasks = createNodeTasks({
  JsonRpcServer: {} as never,
  JsonRpcServerImplementation,
  ComponentNames, log, SeverityNumber, waitOn, fs,
});

const config: HardhatUserConfig = createHardhatConfig({
  sourcesDir: `${import.meta.dirname}/src/contracts`,
  artifactsDir: `${import.meta.dirname}/build/artifacts/hardhat`,
  cacheDir: `${import.meta.dirname}/build/cache/hardhat`,
  tasks: nodeTasks,
  solidityVersion: "0.8.30",
});

export default config;
```

---

## Multi-Environment Pattern

Templates support multiple deployment environments through file-name suffixes. Each environment-aware component has a `*.dev.ts` file (local development) and optionally a `*.mainnet.ts` file (production).

```
packages/node/config.dev.ts          # Local chains (Hardhat, local Midnight, etc.)
packages/node/config.mainnet.ts      # Real chains (Arbitrum, Midnight mainnet, etc.)
packages/node/main.dev.ts            # Imports config.dev.ts
packages/node/main.mainnet.ts        # Imports config.mainnet.ts
packages/batcher/effectstream-l2.ts   # Adapter factory (env-agnostic)
packages/batcher/batcher.dev.ts      # Entry point (dev) — passes dev vars to factories
packages/batcher/batcher.mainnet.ts  # Entry point (mainnet) — validates env vars, passes to factories
start.dev.ts                         # Orchestrator: all local services
start.mainnet.ts                     # (optional) Orchestrator: production services
```

The `dev` script uses the orchestrator to boot everything:
```json
"dev": "NODE_ENV=development bunx orchestrator start"
```

The CLI reads the start file from `package.json`:
```json
"effectstream": { "default": "start.dev.ts" }
```

Mainnet runs the node directly (no orchestrator needed since infrastructure is remote):
```json
"start:mainnet": "bun run packages/node/main.mainnet.ts"
```

**Mainnet configs validate required env vars** at the top of the file:
```ts
const EVM_RPC_URL = process.env.EVM_RPC_URL;
if (!EVM_RPC_URL) throw new Error("EVM_RPC_URL is required for mainnet");
```

---

## Batcher Package

The batcher aggregates user transactions and submits them to one or more chains. Each chain requires an adapter.

**`packages/batcher/effectstream-l2.ts`** — Adapter factory (environment-agnostic, owns chain-specific resolution):

```ts
import { EffectstreamL2DefaultAdapter } from "@effectstream/batcher-sdk";
import { contractAddressesEvmMain } from "@my-template/contracts-evm";

export interface EffectstreamL2Env {
  chainId: number;
  contractModule: string;
  privateKey: string;
  fee: bigint;
  syncProtocolName: string;
}

function getContractAddress(chainId: number, contractModule: string): `0x${string}` {
  const addresses = contractAddressesEvmMain() as Record<string, Record<string, `0x${string}`>>;
  const address = addresses[`chain${chainId}`]?.[contractModule];
  if (!address) {
    throw new Error(`Contract address not found for chain${chainId}/${contractModule}`);
  }
  return address;
}

export function createEffectstreamL2Adapter(env: EffectstreamL2Env) {
  const contractAddress = getContractAddress(env.chainId, env.contractModule);
  return new EffectstreamL2DefaultAdapter(
    contractAddress,
    env.privateKey,
    env.fee,
    env.syncProtocolName,
  );
}
```

**`packages/batcher/batcher.dev.ts`** — Entry point (passes env vars to factories, no chain-specific logic):

```ts
import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig } from "@effectstream/batcher-sdk";
import { createEffectstreamL2Adapter } from "./effectstream-l2.ts";

const batchIntervalMs = 1000;
const port = Number(process.env.BATCHER_PORT ?? "3334");

const paimaL2 = createEffectstreamL2Adapter({
  chainId: 31337,
  contractModule: "EffectstreamL2Module#MyEffectstreamL2",
  privateKey: process.env.EVM_PRIVATE_KEY ??
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  fee: 0n,
  syncProtocolName: "mainEvmRPC",
});

const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { paimaL2 },
  defaultTarget: "paimaL2",
  namespace: "",
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);

main(function* () {
  batcher.addStateTransition("startup", ({ publicConfig }) => {
    console.log(`Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms`);
  });

  batcher.addStateTransition("http:start", ({ port }) => {
    console.log(`HTTP Server ready on port ${port}`);
  });

  yield* batcher.runBatcher();
  yield* suspend();
});
```

> **Critical**: `BatcherConfig.namespace` must exactly match the `EffectstreamConfig` `appName` used by the frontend when signing transactions. The signed message includes `appName`, and the batcher validates the signature against `namespace`. A mismatch produces `401 Invalid signature` errors from the batcher's `/send-input` endpoint.

**Available adapters** (`@effectstream/batcher-sdk`):

| Adapter | Chain | Use |
|---------|-------|-----|
| `EffectstreamL2DefaultAdapter` | EVM | Submits to EffectstreamL2 contract |
| `MidnightAdapter` | Midnight | Submits to Midnight contract with ZK proofs |

---

## Supported Chains Reference

### Networks (`ConfigNetworkType`)

| Type | Description |
|------|-------------|
| `NTP` | Virtual clock (required -- one per app) |
| `EVM` | Ethereum / L2s (Viem-compatible) |
| `MIDNIGHT` | Midnight privacy protocol |
| `BITCOIN` | Bitcoin (via RPC) |
| `CARDANO` | Cardano (via CARP or UTXOrpc) |
| `AVAIL` | Avail DA layer |
| `CELESTIA` | Celestia DA layer |
| `NEAR` | NEAR protocol |
| `MINA` | Mina protocol |

### Sync Protocols (`ConfigSyncProtocolType`)

Every app requires exactly one `addMain` (the NTP clock) and one or more `addParallel` protocols.

| Type | Network | Description |
|------|---------|-------------|
| `NTP_MAIN` | NTP | Main clock (drives block-merge cadence) |
| `EVM_RPC_PARALLEL` | EVM | EVM RPC polling |
| `MIDNIGHT_PARALLEL` | MIDNIGHT | Midnight GraphQL indexer |
| `BITCOIN_RPC_PARALLEL` | BITCOIN | Bitcoin RPC polling |
| `CARDANO_CARP_PARALLEL` | CARDANO | Cardano CARP indexer |
| `CARDANO_UTXORPC_PARALLEL` | CARDANO | Cardano UTXOrpc |
| `AVAIL_PARALLEL` | AVAIL | Avail RPC + light client |
| `CELESTIA_PARALLEL` | CELESTIA | Celestia RPC |
| `NEAR_RPC_PARALLEL` | NEAR | NEAR RPC |
| `MINA_PARALLEL` | MINA | Mina SQL |

**Common sync protocol options**:

| Field | Description |
|-------|-------------|
| `startBlockHeight` | Block to start syncing from |
| `pollingInterval` | Milliseconds between polls |
| `confirmationDepth` | Blocks to wait for finality |
| `stepSize` | Blocks to fetch per poll |
| `delayMs` | Artificial delay (for mainnet sync alignment) |

### Built-in Primitives (`@effectstream/sm/builtin`)

| Primitive type | Grammar | Chain | Use |
|----------------|---------|-------|-----|
| `PrimitiveTypeEVMEffectstreamL2` | Your grammar | EVM | Game interaction contract. Parses `effectstreamSubmitGameInput` calls. |
| `PrimitiveTypeEVMERC721` | `builtinGrammars.evmErc721` | EVM | ERC-721 Transfer events |
| `PrimitiveTypeEVMERC20` | `builtinGrammars.evmErc20` | EVM | ERC-20 Transfer events |
| `PrimitiveTypeEVMERC1155` | `builtinGrammars.evmErc1155` | EVM | ERC-1155 TransferSingle events |
| `PrimitiveTypeMidnightGeneric` | `builtinGrammars.midnightGeneric` | Midnight | Generic ledger contract state |
| `PrimitiveTypeMidnightNullifierAndCommitment` | — | Midnight | Shielded nullifier (spend) + commitment (create) tracking |
| `PrimitiveTypeBitcoinAddress` | `builtinGrammars.bitcoinAddress` | Bitcoin | Watch address transactions |
| `PrimitiveTypeUtxorpcGeneric` | `builtinGrammars.utxorpcGeneric` | Cardano | Generic UTXO events |
| `PrimitiveTypeCardanoMintBurn` | `builtinGrammars.cardanoMintBurn` | Cardano | Mint/burn certificate events |
| `PrimitiveTypeCardanoTransfer` | `builtinGrammars.cardanoTransfer` | Cardano | ADA/token transfers |
| `PrimitiveTypeCardanoPoolDelegation` | `builtinGrammars.cardanoPoolDelegation` | Cardano | Stake pool delegation certificates |
| `PrimitiveTypeCardanoDelayedAsset` | `builtinGrammars.cardanoDelayedAsset` | Cardano | Delayed asset claims |
| `PrimitiveTypeCardanoProjectedNFT` | `builtinGrammars.cardanoProjectedNft` | Cardano | Projected NFT state |
| `PrimitiveTypeAvailGeneric` | `builtinGrammars.availGeneric` | Avail | Application data |
| `PrimitiveTypeCelestiaGeneric` | `builtinGrammars.celestiaGeneric` | Celestia | Blob data |
| `PrimitiveTypeNEARNEP141` | `builtinGrammars.nearNep141` | NEAR | Fungible tokens |
| `PrimitiveTypeNEARNEP171` | `builtinGrammars.nearNep171` | NEAR | NFTs |
| `PrimitiveTypeNEARNEP245` | `builtinGrammars.nearNep245` | NEAR | Multi-tokens |
| `PrimitiveTypeNEARIntent` | `builtinGrammars.nearIntent` | NEAR | DIP-4 intents |
| `PrimitiveTypeNEARGeneric` | `builtinGrammars.nearGeneric` | NEAR | NEP-297 events |
| `PrimitiveTypeNEARAccountWatch` | `builtinGrammars.nearAccountWatch` | NEAR | Function call tracking |

### Custom Primitives

Extend the `Primitive` class from `@effectstream/sm` to parse custom on-chain events. Register with `userDefinedPrimitives` in `start()`.

```ts
import { Primitive } from "@effectstream/sm";
import type { JsonObject } from "@effectstream/sm";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import { getEvmEvent } from "@effectstream/config";
import { type AddressAndType, AddressType, type EvmAddress, type EffectstreamBlockNumber, TypeboxHelpers, type StaticDecode } from "@effectstream/utils";
import { Value } from "@sinclair/typebox/value";
import { generateRawStmInput, type CommandTuple, type ParamToData } from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { Type } from "@sinclair/typebox";

const myEventAbi = [{
  type: "event",
  name: "MyEvent",
  inputs: [
    { name: "user", type: "address", indexed: true, internalType: "address" },
    { name: "value", type: "uint256", indexed: false, internalType: "uint256" },
  ],
  anonymous: false,
}] as const;

const myGrammar = [
  ["value", Type.Number()],
] as const;

class MyCustomPrimitive extends Primitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof myGrammar
> {
  readonly internalTypeName = "EVM:MY-CUSTOM";
  readonly abi = getEvmEvent(myEventAbi, "MyEvent(address,uint256)");
  override grammar = myGrammar;
  readonly contractAddress: EvmAddress;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: EvmAddress;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.contractAddress = Value.Decode(
      TypeboxHelpers.Evm.Address,
      config.contractAddress,
    );
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    txData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.EVM_RPC_PARALLEL>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: StaticDecode<CommandTuple<string, typeof myGrammar>> | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { user, value } = txData.output.payload;
    const accountingPayload: ParamToData<typeof myGrammar> = {
      value: Number(BigInt(value)),
    };
    const stateMachinePayload = this.stateMachinePrefix
      ? generateRawStmInput(this.grammar, this.stateMachinePrefix, accountingPayload)
      : null;

    return {
      isBatched: false,
      data: [{
        fromAddressAndType: { type: AddressType.EVM, address: Value.Decode(TypeboxHelpers.Evm.Address, user.toLowerCase()) },
        accountingPayload,
        stateMachinePayload,
      }],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.EVM_RPC_PARALLEL] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress as EvmAddress,
      abi: this.abi,
    } as const;
  }

  override getIntermediatePrefix(): string[] { return []; }
  override getViewPrefix(): string[] { return []; }
  override getDynamicTables = (_name: string): string | undefined => undefined;
}

// Register in start():
yield* start({
  // ...other fields...
  userDefinedPrimitives: { "EVM:MY-CUSTOM": MyCustomPrimitive },
});
```

See `e2e/evm/node.ts` for a complete working example (`EvmCounterPrimitive`).

---

## Package Naming

```
Template packages:    @{template-name}/{package}
SDK packages:         @effectstream/{package}
```

| Template package | Description |
|------------------|-------------|
| `@my-template/node` | Sync node (grammar, config, STM, API) |
| `@my-template/database` | Migrations + pgtyped queries |
| `@my-template/contracts-evm` | EVM Solidity + Hardhat + deploy |
| `@my-template/contracts-midnight` | Midnight Compact contracts |
| `@my-template/contracts-bitcoin` | Bitcoin contracts |
| `@my-template/batcher` | Transaction batcher |
| `@my-template/frontend` | Web UI |
| `@my-template/tests` | Test suite |

| SDK package | Description |
|-------------|-------------|
| `@effectstream/runtime` | HTTP/RPC server, main processing loop |
| `@effectstream/sm` | `Stm` class, `Primitive` base, builtin primitives |
| `@effectstream/config` | `ConfigBuilder`, network/sync/primitive types |
| `@effectstream/concise` | Grammar DSL, input parsing |
| `@effectstream/coroutine` | `World.promise`, `World.resolve`, Effection helpers |
| `@effectstream/db` | `getConnection`, `createScheduledData`, `runPreparedQuery` |
| `@effectstream/orchestrator` | `launchPglite`, `launchEvm`, process orchestration |
| `@effectstream/evm-hardhat` | `createHardhatConfig`, Hardhat integration |
| `@effectstream/evm-contracts` | Base Solidity contracts (`EffectstreamL2Contract`) |
| `@effectstream/midnight-contracts` | Midnight deploy, read-contract, midnight-env |
| `@effectstream/batcher-sdk` | Batcher framework, adapters, storage |
| `@effectstream/log` | `ComponentNames`, logging |

---

## Root package.json

**SDK versioning**: All `@effectstream/*` packages share a single coordinated version and are always published together. Use the latest available version for all of them (e.g., `0.100.13`). Never mix versions across `@effectstream/*` dependencies.

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "NODE_ENV=development bunx orchestrator start",
    "start:mainnet": "bun run packages/node/main.mainnet.ts",
    "test": "bun run packages/tests/run-tests.ts",
    "build:evm": "bun run --filter @my-template/contracts-evm build:mod",
    "build:pgtypes": "bun run --filter @my-template/database pgtyped:update"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.3.14",
    "@effectstream/orchestrator": "<latest>",
    "@midnightntwrk/wallet-sdk-address-format": "3.1.0",
    "wait-on": "8.0.3"
  },
  "effectstream": {
    "default": "start.dev.ts"
  }
}
```

If the template includes sub-workspaces (e.g., Midnight compiled contracts), list them explicitly:
```json
"workspaces": ["packages/*", "packages/contracts-midnight/contract-round-value"]
```
`packages/*` will NOT discover nested packages.

### `link.sh` (for monorepo development)

When a template depends on `@effectstream/*` packages that are not yet published to npm (e.g., Cardano primitives), or when you want to develop against local engine changes, add a `link.sh` script to the template root. This script symlinks workspace packages and monorepo `@effectstream/*` packages into the template's `node_modules/`:

```bash
#!/bin/bash
# link.sh — run once after bun install, before bun run dev
MONO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Link workspace packages
for pkg in packages/*/; do
  name=$(jq -r .name "$pkg/package.json" 2>/dev/null) || continue
  scope="${name%/*}"; scope="${scope#@}"
  mkdir -p "node_modules/@$scope"
  ln -sfn "$(pwd)/$pkg" "node_modules/$name"
done

# Link monorepo @effectstream/* packages
for pkg in "$MONO_ROOT"/packages/*/; do
  name=$(jq -r .name "$pkg/package.json" 2>/dev/null) || continue
  [[ "$name" == @effectstream/* ]] || continue
  mkdir -p node_modules/@effectstream
  ln -sfn "$pkg" "node_modules/$name"
done
```

This is **not mandatory** — published templates work without it. It's useful for iterating on the engine and template together, or when using primitives that aren't yet on npm.

---

## Testing

Every template includes a `packages/tests/` directory with test phases. Tests follow the same patterns as `e2e/` -- they use the orchestrator to spin up real infrastructure and assert against actual DB state.

### Test Architecture

```
packages/tests/
├── run-tests.ts              # Orchestrates all phases
├── start.test.ts           # Orchestrator config for test mode
├── helpers.ts                # assert, assertSQL utilities
├── infra/                    # Phase A: Infrastructure
│   ├── chain-ready.test.ts   # Chain nodes respond, correct chain IDs
│   └── deploy.test.ts        # Contracts deployed, addresses available
├── stm/                      # Phase B: State Machine + DB + API
│   ├── my-action.test.ts     # Submit tx -> verify DB state
│   └── api.test.ts           # Query API endpoints -> verify response
└── frontend/                 # Phase C+: Frontend
    ├── build-smoke.test.ts   # vite build succeeds
    └── render.test.ts        # Headless Chrome: React mounts, no JS errors
```

Templates may add more phases for cross-chain tests, privacy chain tests, etc. The core structure remains the same.

### Phase A: Infrastructure

Verifies that the orchestrator boots everything correctly: chain nodes respond on expected ports, contracts are deployed, sync node is healthy, blocks are being indexed.

```ts
// packages/tests/infra/chain-ready.test.ts
import { assert } from "../helpers.ts";

export async function chainReadyTest() {
  await assert("EVM chain responds on port 8545", async () => {
    const res = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const json = await res.json();
    return parseInt(json.result, 16) === 31337;
  });
}
```

```ts
// packages/tests/infra/deploy.test.ts
import { assert } from "../helpers.ts";
import { contractAddressesEvmMain } from "@my-template/contracts-evm";

export async function deployTest() {
  await assert("Contracts deployed with valid addresses", async () => {
    const addrs = contractAddressesEvmMain();
    const addr = addrs.chain31337["EffectstreamL2Module#MyEffectstreamL2"];
    return addr !== undefined && addr.startsWith("0x") && addr.length === 42;
  });
}
```

### Phase B: State Machine / DB / API

The core test loop: submit transactions on-chain, wait for the sync node to index them, then assert that (1) the STM wrote the correct values to the DB and (2) the API returns the expected responses.

```ts
// packages/tests/stm/my-action.test.ts
import { assertSQL } from "../helpers.ts";
import { createWalletClient, createPublicClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@my-template/contracts-evm";
import type { Client } from "pg";

const wallet0 = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const effectstreamL2Abi = [{
  inputs: [{ name: "data", type: "bytes" }],
  name: "effectstreamSubmitGameInput",
  outputs: [],
  stateMutability: "payable",
  type: "function",
}] as const;

export async function createRoomTest(db: Client) {
  const addresses = contractAddressesEvmMain();
  const contractAddr = addresses.chain31337["EffectstreamL2Module#MyEffectstreamL2"];
  const walletClient = createWalletClient({ account: wallet0, chain: hardhat, transport: http() });
  const publicClient = createPublicClient({ chain: hardhat, transport: http() });

  const hash = await walletClient.writeContract({
    address: contractAddr,
    abi: effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [toHex(JSON.stringify(["createRoom", "test-room", 4]))],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  await assertSQL(
    "createRoom: room written to DB with correct fields",
    db,
    `SELECT room_name, max_players, creator FROM rooms WHERE room_name = 'test-room';`,
    (res) => res.rows.length >= 1,
    (res) => {
      const room = res.rows[0];
      return room.room_name === "test-room"
          && room.max_players === 4
          && room.creator === wallet0.address.toLowerCase();
    },
  );
}
```

```ts
// packages/tests/stm/api.test.ts
import { assert } from "../helpers.ts";

const API_PORT = 9999;

export async function apiTest() {
  await assert("GET /api/items returns data", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/items`);
    const items = await res.json();
    return Array.isArray(items) && items.length > 0;
  });
}
```

### Phase C+: Frontend

Two-tier frontend testing: build verification and headless browser render test.

**Build smoke test** -- verify the Vite build succeeds:

```ts
// packages/tests/frontend/build-smoke.test.ts
import { assert } from "../helpers.ts";
import path from "path";

export async function frontendBuildTest() {
  await assert("Frontend vite build exits successfully", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "--filter", "@my-template/frontend", "build"],
      { cwd: path.resolve(import.meta.dirname!, "../../.."), stdout: "pipe", stderr: "pipe" },
    );
    return (await proc.exited) === 0;
  });
}
```

**Render test** -- launch headless Chrome via `playwright-core`, verify React mounts and no fatal JS errors:

```ts
// packages/tests/frontend/render.test.ts
import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;

export async function frontendRenderTest() {
  const executablePath = process.env["CHROME_PATH"] || findChrome();
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();

  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));

  await page.goto(`http://localhost:${FRONTEND_PORT}/`, { waitUntil: "load", timeout: 15_000 });
  await page.waitForSelector(".container", { timeout: 10_000 });

  await assert("Frontend React app mounts", async () => {
    return (await page.$(".container")) !== null;
  });

  await assert("Frontend has no fatal JS errors", async () => {
    return jsErrors.length === 0;
  });

  await browser.close();
}
```

Add `playwright-core` to `packages/tests/package.json`. The test uses `playwright-core` (not `@playwright/test`) to avoid bundling browsers -- it finds Chrome/Chromium on the host via `findChrome()` or the `CHROME_PATH` env var.

**Full lifecycle E2E tests with `@playwright/test`**: For templates with browser-side wallet interactions (e.g., Cardano templates using Lucid), use `@playwright/test` in `packages/frontend/e2e/` instead of `playwright-core` in `packages/tests/`. This provides a proper test runner, assertions, and parallel test execution. Structure tests in groups: (1) **App structure** — verify layout, elements, dark theme, that the frontend makes no POST/PATCH/DELETE to the API; (2) **API health** — verify GET endpoints return expected shapes; (3) **Browser wallet lifecycle** — connect wallet → mint → lock → unlock → claim through the UI. Use `data-testid` attributes on all interactive elements. Key patterns:
- Clear `localStorage` at test start to prevent auto-reconnect interference
- Use `page.getByText("Locked", { exact: true })` to avoid matching substrings (e.g., "Unlocked" also contains "Locked")
- Set generous timeouts for blockchain operations (60s for TX confirmation, 30s for time-lock expiry)
- Use `test.setTimeout(300_000)` for the full lifecycle test
- Playwright E2E tests (alternative) -- for templates with richer UIs, use `@playwright/test` with a dedicated config in `packages/frontend/`. This gives proper test reporting, retries, and `data-testid` matchers out of the box:

```ts
// packages/frontend/playwright.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  retries: 0,
  use: { baseURL: "http://localhost:10599", headless: true },
  projects: [    { name: "chromium", use: { browserName: "chromium", headless: true } } ],
});
```

```ts
// packages/frontend/e2e/app.spec.ts
import { test, expect } from "@playwright/test";

test("dashboard loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
});

test("mint NFT flow", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("connect-evm-btn").click();
  await expect(page.getByTestId("evm-address")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("mint-nft-btn").click();
  await expect(page.getByText("NFT minted!")).toBeVisible({ timeout: 30_000 });
});
```

Add `@playwright/test` to `packages/frontend/package.json`. The test runner (`run-tests.ts`) launches Playwright after Phase B:

```ts
// In run-tests.ts Phase C
const frontendDir = path.resolve(import.meta.dirname!, "../frontend");
await Bun.spawn(["bunx", "playwright", "install", "chromium"], { cwd: frontendDir }).exited;
const exitCode = await Bun.spawn(
  ["bunx", "playwright", "test", "--config", "playwright.config.ts"],
  { cwd: frontendDir, stdout: "inherit", stderr: "inherit" },
).exited;
await assert("Playwright E2E tests pass", async () => exitCode === 0);
```

### Test Runner (`run-tests.ts`)

Orchestrates the full lifecycle: start infra, wait for readiness, run all phases, shut down.

```ts
// packages/tests/run-tests.ts
import { anyError, printSummary } from "./helpers.ts";
import pg from "pg";
import path from "path";
import type { Client } from "pg";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ORCHESTRATOR_PORT = 4747;
const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);

const CLI_PATH = path.resolve(import.meta.dirname!, "../../node_modules/@effectstream/orchestrator/src/cli.ts");
const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./start.test.ts");

let proc: ReturnType<typeof Bun.spawn> | null = null;

async function startInfra() {
  proc = Bun.spawn(["bun", CLI_PATH, "start", LAUNCHER_PATH], {
    cwd: path.resolve(import.meta.dirname!, "../.."),
    stdout: "inherit", stderr: "inherit",
    env: { ...process.env },
  });
}

async function stopInfra() {
  try { await fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, { method: "POST" }); } catch {}
  await delay(2000);
  proc?.kill();
}

async function waitForProcess(name: string, opts: { waitForExit?: boolean; timeoutMs?: number } = {}) {
  const { waitForExit = false, timeoutMs = 120_000 } = opts;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/processes`);
      const data = await res.json() as any;
      const p = data.processes?.find((p: any) => p.name === name);
      if (p) {
        if (waitForExit && p.status === "done") return;
        if (!waitForExit && (p.status === "running" || p.status === "done")) return;
      }
    } catch {}
    await delay(500);
  }
  throw new Error(`Process "${name}" did not ${waitForExit ? "complete" : "start"} within ${timeoutMs / 1000}s`);
}

async function test() {
  let db: Client | null = null;
  try {
    await startInfra();
    // Wait for orchestrator health
    // ...

    // Phase A: Infrastructure
    await waitForProcess("generate-evm-mod", { waitForExit: true });
    const { chainReadyTest } = await import("./infra/chain-ready.test.ts");
    const { deployTest } = await import("./infra/deploy.test.ts");
    await chainReadyTest();
    await deployTest();

    // Wait for sync node
    await waitForProcess("sync");

    // Phase B: State Machine / DB / API
    db = new pg.Client({ host: "localhost", port: 5432, user: "postgres", password: "postgres", database: "postgres" });
    await db.connect();
    const { createRoomTest } = await import("./stm/my-action.test.ts");
    const { apiTest } = await import("./stm/api.test.ts");
    await createRoomTest(db);
    await apiTest();

    // Phase C: Frontend (if exists)
    // const { frontendBuildTest } = await import("./frontend/build-smoke.test.ts");
    // await frontendBuildTest();

    printSummary();
  } catch (e) {
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfra();
    if (anyError()) process.exit(1);
    process.exit(0);
  }
}

test();
```

### Test Launcher (`start.test.ts`)

Separate orchestrator config for tests -- typically the same chain infrastructure but with debug endpoints enabled and no frontend.

```ts
// packages/tests/start.test.ts
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

const root = path.resolve(import.meta.dirname!, "../..");

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
    {
      name: "sync",
      description: "Sync node (test mode)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
    },
  ],
} satisfies OrchestratorConfig;
```

### Test Helpers

Reusable assertion utilities (same pattern as `e2e/shared/engine/`):

```ts
// packages/tests/helpers.ts
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;

export async function assert(name: string, check: () => Promise<boolean>): Promise<void> {
  process.stdout.write(`  [TEST] ${name}...`);
  try {
    if (await check()) {
      console.log(" PASS");
      passCount++;
    } else {
      console.log(" FAIL");
      failCount++;
      throw new Error(`Assertion failed: ${name}`);
    }
  } catch (e) {
    console.log(" FAIL");
    failCount++;
    throw e;
  }
}

export async function assertSQL<T>(
  name: string,
  db: any,
  query: string,
  waitUntil: (res: { rows: T[] }) => boolean,
  check: (res: { rows: T[] }) => boolean,
  timeoutMs = 20_000,
): Promise<void> {
  process.stdout.write(`  [TEST] ${name}...`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await db.query(query);
    if (waitUntil(res)) {
      if (check(res)) {
        console.log(" PASS");
        passCount++;
        return;
      } else {
        console.log(" FAIL");
        failCount++;
        throw new Error(`Check failed: ${name}`);
      }
    }
    await delay(200);
  }
  console.log(" TIMEOUT");
  failCount++;
  throw new Error(`Timed out waiting: ${name}`);
}

export function printSummary() {
  console.log(`\nResults: ${passCount} passed, ${failCount} failed`);
}

export function anyError() {
  return failCount > 0 || (passCount + failCount) === 0;
}
```

### Running Tests

Every template with tests has a `"test"` script in its root `package.json`:

```bash
# Run a single template's tests
cd templates/preorder && bun run test

# Run ALL template tests (serial — they share ports)
bun run templates/run-template-tests.ts

# Run specific templates only
bun run templates/run-template-tests.ts preorder shinkai-v2
```

The runner (`templates/run-template-tests.ts`) auto-discovers every template directory that has a `"test"` script in its `package.json`, runs them serially, and prints a pass/fail summary at the end.

**Adding tests to a new template:**

1. Create `packages/tests/` following the [Test Architecture](#test-architecture) above
2. Add the `"test"` script to the template's root `package.json`:
   ```json
   { "scripts": { "test": "bun run packages/tests/run-tests.ts" } }
   ```
3. Verify with `cd templates/<name> && bun run test`
4. The runner will pick it up automatically — no registration needed

---

## Docker / Containerization

Each template includes a Dockerfile for containerized development and testing. The container runs the full dev stack (orchestrator → chain nodes → sync → frontend) or the e2e test suite.

### Base Image & System Dependencies

Use `oven/bun:1` (Debian trixie with latest Bun). **Do not** use `oven/bun:1-ubuntu` — it does not exist.

All Dockerfiles need these system packages:

```dockerfile
FROM oven/bun:1

RUN apt-get update && apt-get install -y \
    curl \
    lsof \
    iproute2 \
    unzip \
    procps \
    && rm -rf /var/lib/apt/lists/*
```

- `procps` is required — the orchestrator uses `kill` for process shutdown, which is not in the base image
- `lsof` and `iproute2` are used by orchestrator health checks
- Node.js is required for postinstall scripts and Hardhat:

```dockerfile
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
```

### Chain-Specific Dependencies

**EVM templates** (any template with `packages/contracts-evm/`): Install Foundry (arch-aware) and pre-cache solc for Hardhat:

```dockerfile
# Foundry (arch-aware)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then FOUNDRY_ARCH="arm64"; else FOUNDRY_ARCH="amd64"; fi && \
    curl -L "https://github.com/foundry-rs/foundry/releases/download/v1.3.0-rc1/foundry_v1.3.0-rc1_alpine_${FOUNDRY_ARCH}.tar.gz" -o foundry.tar.gz \
    && tar -xzf foundry.tar.gz \
    && mv anvil cast chisel forge /usr/local/bin/ \
    && rm -rf foundry.tar.gz

# Pre-download solc 0.8.30 (Bun's broken webstreams polyfill prevents runtime download)
RUN mkdir -p /root/.cache/hardhat-nodejs/compilers-v3/wasm && \
    curl -fsSL "https://binaries.soliditylang.org/wasm/list.json" \
      -o /root/.cache/hardhat-nodejs/compilers-v3/wasm/list.json && \
    curl -fsSL "https://binaries.soliditylang.org/wasm/soljson-v0.8.30+commit.73712a01.js" \
      -o /root/.cache/hardhat-nodejs/compilers-v3/wasm/soljson-v0.8.30+commit.73712a01.js && \
    if [ "$(uname -m)" != "aarch64" ]; then \
      mkdir -p /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64 && \
      curl -fsSL "https://binaries.soliditylang.org/linux-amd64/list.json" \
        -o /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/list.json && \
      curl -fsSL "https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01" \
        -o /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01 && \
      chmod +x /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01; \
    fi
```

**Midnight templates** (any template with `packages/contracts-midnight/`): Install Compact compiler. Also add `xz-utils` to system deps:

```dockerfile
# Add xz-utils to the apt-get install line
RUN apt-get update && apt-get install -y \
    curl lsof iproute2 xz-utils unzip procps \
    && rm -rf /var/lib/apt/lists/*

# Compact compiler
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN compact update 0.31.0
```

### Workspace Symlinks (Critical)

**Bun on Linux does NOT create workspace symlinks in `node_modules/`**. This means sibling packages (e.g., `@my-template/database`) won't be resolvable by name. Every Dockerfile must include this workaround after `bun install`:

```dockerfile
RUN bun install
# Bun on Linux doesn't create workspace symlinks — create them manually
RUN bun -e " \
  const fs = require('fs'); const path = require('path'); \
  const pkg = JSON.parse(fs.readFileSync('package.json','utf8')); \
  for (const pattern of pkg.workspaces || []) { \
    const glob = new Bun.Glob(pattern); \
    for (const dir of glob.scanSync({onlyFiles:false})) { \
      const p = path.join(dir,'package.json'); \
      if (!fs.existsSync(p)) continue; \
      const wp = JSON.parse(fs.readFileSync(p,'utf8')); \
      if (!wp.name) continue; \
      const [scope,name] = wp.name.startsWith('@') ? wp.name.split('/') : [null,wp.name]; \
      const target = path.resolve(dir); \
      const linkDir = scope ? path.join('node_modules',scope) : 'node_modules'; \
      fs.mkdirSync(linkDir,{recursive:true}); \
      const link = path.join(linkDir,name); \
      if (!fs.existsSync(link)) { fs.symlinkSync(target,link); console.log(link+' -> '+target); } \
    } \
  }"
```

This has been verified as still required with Bun 1.3.13. Without it, imports like `@my-template/database` will fail with `Cannot find module`.

### Build Steps & CMD

After install + symlinks, run any required build steps:

```dockerfile
# EVM templates
RUN bun run build:evm

# Midnight templates
RUN bun run build:midnight
```

The default CMD starts the full dev stack:

```dockerfile
ENV NODE_ENV=development
CMD ["bunx", "orchestrator", "start", "--config", "start.dev.ts"]
```

Tests run by overriding CMD: `docker run <image> bun run test`

### Port Exposure

Expose ports based on template services:

| Service | Port | Templates |
|---------|------|-----------|
| Frontend | 10599 | All |
| Sync API | 9999 | All |
| Orchestrator | 4747 | All |
| Batcher | 3334 | EVM + batcher templates |
| Hardhat EVM | 8545 | EVM templates |
| Hardhat EVM (parallel) | 8546 | Multi-EVM templates |
| Midnight node | 9944 | Midnight templates |
| Midnight indexer | 8088 | Midnight templates |
| Midnight proof server | 6300 | Midnight templates |

### .dockerignore

Each template needs a `.dockerignore` to exclude build artifacts:

```
node_modules
.orchestrator-logs
batcher-data
*.log
CLAUDE.md
.git
```

Add chain-specific exclusions:
- EVM: `packages/contracts-evm/build`, `packages/contracts-evm/ignition/deployments`, `packages/contracts-evm/mod.ts`
- Midnight: compiled contract artifacts in `packages/contracts-midnight/`

### README Docker Section

Append to each template README:

```markdown
## Docker

```sh
# If running on macOS Apple Silicon
export DOCKER_DEFAULT_PLATFORM=linux/amd64

# Build
docker build -f ./Dockerfile . -t <template-name>

# Run (dev mode — starts full stack)
docker run -p <port-mappings> <template-name>

# Run tests inside container
docker run <template-name> bun run test
```
```

### Orchestrator Config: `cwd` Not `resolveFrom`

In both `start.dev.ts` and `start.test.ts`, always use `{ cwd }` to locate contract packages — never `{ resolveFrom }`. The `resolveFrom` option uses `require.resolve` which goes through Bun's `.bun/` cache and fails in Docker:

```typescript
// WRONG — breaks in Docker
...launchEvm("@my-template/contracts-evm", { resolveFrom: root }),

// CORRECT — works everywhere
...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
```

---

## Checklist for New Templates

Build incrementally — verify each step compiles/works before moving to the next.

- [ ] Root `package.json` with `"workspaces": ["packages/*"]` and `"effectstream": { "default": "start.dev.ts" }`
- [ ] `start.dev.ts` (root) -- orchestrator config with `launchPglite` + chain launchers
- [ ] `packages/contracts-{chain}/` -- contracts for each chain used
- [ ] **Each contract package compiles successfully** (e.g., `bun run build:evm`, `bun run build:midnight`)
- [ ] `packages/database/` -- migrations + pgtyped `.sql` query files
- [ ] **`bun run build:pgtypes` generates `.queries.ts` files successfully**
- [ ] `packages/database/mod.ts` re-exports generated queries + migrations
- [ ] **No raw SQL anywhere outside `packages/database/sql/*.sql`** — only pgtyped `PreparedQuery` objects
- [ ] `packages/node/grammar.ts` -- grammar with Typebox schemas and/or builtin grammars
- [ ] `packages/node/config.dev.ts` -- ConfigBuilder (NTP main + at least one parallel)
- [ ] `packages/node/state-machine.ts` -- `Stm` with transitions for each grammar key (uses `World.resolve` with generated queries)
- [ ] `packages/node/main.dev.ts` -- `init -> withEffectstreamStaticConfig -> start -> suspend`
- [ ] `packages/node/api.ts` -- at least one query endpoint (uses `runPreparedQuery` with generated queries)
- [ ] `packages/tests/run-tests.ts` -- test runner with phases
- [ ] `packages/tests/start.test.ts` -- test orchestrator config
- [ ] `packages/tests/infra/` -- chain health + deploy verification
- [ ] `packages/tests/stm/` -- submit tx on-chain, verify DB state + API responses
- [ ] `packages/tests/frontend/` -- build smoke test + Playwright render test (if frontend exists)
- [ ] `README.md` following the canonical structure (see [Template README](#11-template-readme))
- [ ] `Dockerfile` — see [Docker / Containerization](#docker--containerization)
- [ ] `.dockerignore` — exclude `node_modules`, logs, build artifacts
- [ ] `bun run dev` works end-to-end
- [ ] `bun run test` passes all phases
- [ ] `docker build` succeeds
- [ ] `docker run <image> bun run test` passes all phases

For mainnet support, add:
- [ ] `packages/node/config.mainnet.ts` -- env var validation + real chain configs
- [ ] `packages/node/main.mainnet.ts` -- imports mainnet config
- [ ] `"start:mainnet"` script in root `package.json`

---

## Migrating from `@paimaexample/*` Templates

All existing templates (chess, dice, minimal, rock-paper-scissors, multi-chain-token-transfer, night-bitcoin, world-map-2d, evm-midnight) use the old `@paimaexample/*` SDK with a nested directory structure. This section provides the step-by-step transformations an agent must perform.

### Step 1: Package Namespace Rename

Replace all `@paimaexample/*` imports with `@effectstream/*`:

| Old (`@paimaexample/*`) | New (`@effectstream/*`) |
|------------------------|------------------------|
| `@paimaexample/runtime` | `@effectstream/runtime` |
| `@paimaexample/sm` | `@effectstream/sm` |
| `@paimaexample/config` | `@effectstream/config` |
| `@paimaexample/concise` | `@effectstream/concise` |
| `@paimaexample/coroutine` | `@effectstream/coroutine` |
| `@paimaexample/db` | `@effectstream/db` |
| `@paimaexample/crypto` | `@effectstream/crypto` |
| `@paimaexample/log` | `@effectstream/log` |
| `@paimaexample/utils` | `@effectstream/utils` |
| `@paimaexample/orchestrator` | `@effectstream/orchestrator` |
| `@paimaexample/evm-hardhat` | `@effectstream/evm-hardhat` |
| `@paimaexample/evm-contracts` | `@effectstream/evm-contracts` |
| `@paimaexample/batcher` | `@effectstream/batcher-sdk` |
| `@paimaexample/midnight-contracts` | `@effectstream/midnight-contracts` |

Also update internal template package names: `@chess/*`, `@dice/*`, etc. → `@my-template/*` (or whatever the new template name is).

### Step 2: Flatten Directory Structure

Transform the nested layout into the flat layout:

```
OLD:                                    → NEW:
packages/client/node/                   → packages/node/
packages/client/node/src/main.ts        → packages/node/main.dev.ts
packages/client/node/src/state-machine.ts → packages/node/state-machine.ts
packages/client/node/src/api.ts         → packages/node/api.ts
packages/client/node/scripts/start.ts   → start.dev.ts (project root)
packages/client/database/               → packages/database/
packages/client/batcher/                → packages/batcher/
packages/shared/data-types/src/grammar.ts → packages/node/grammar.ts
packages/shared/data-types/src/localhostConfig.ts → packages/node/config.dev.ts
packages/shared/contracts/evm/          → packages/contracts-evm/
packages/shared/contracts/midnight/     → packages/contracts-midnight/
packages/shared/contracts/bitcoin/      → packages/contracts-bitcoin/
packages/frontend/                      → packages/frontend/
```

After flattening:
- Delete `packages/client/` wrapper directory entirely
- Delete `packages/shared/` wrapper directory entirely
- Delete `packages/shared/data-types/` (merged into `packages/node/`)
- Delete `packages/shared/utils/` if it exists (merge needed utilities into node)

### Step 3: Remove the Round Executor / Match Executor / Tick abstraction

Templates chess, dice, and rock-paper-scissors have a layered abstraction in `packages/shared/game-logic/`:

```
OLD architecture (to be removed entirely):
  tick.ts              → processTick(): applies one move to matchState, returns TickEvents
  round_executor.ts    → wraps processTick into a round-level loop (.tick(), .endState())
  match_executor.ts    → wraps round_executor into multi-round matches
  mod.ts               → initRoundExecutor(), extractMatchEnvironment(), buildMatchState()
```

The state machine (`transition.ts`) calls this indirectly:
```ts
// OLD: state-machine calls transition.ts which calls round executor
const executor = initRoundExecutor(lobby, round, matchState, moves, prando);
const newState = executor.endState();  // runs all ticks to completion
```

**This entire abstraction layer must be removed.** In the new SDK, game logic lives directly in the STM transition — no round executors, no tick events, no match executors.

**How to migrate** (using chess as example):

```ts
// NEW: game logic directly in the STM transition
stm.addStateTransition("submitMoves", function* (data) {
  const { parsedInput, signerAddress: player, blockHeight, randomGenerator } = data;
  const { lobbyID, pgnMove, roundNumber } = parsedInput;

  // Read current state from DB
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: lobbyID });
  if (!lobby || lobby.lobby_state !== "active") return;

  // Validate move using chess.js directly (was in chess-logic.ts)
  const chess = new Chess();
  chess.load(lobby.latest_match_state);
  try { chess.move(pgnMove); } catch { return; } // invalid move

  // Apply the move — no tick/round executor needed
  const newFen = chess.fen();

  // Persist move
  yield* World.resolve(insertMove, { lobby_id: lobbyID, round: roundNumber, wallet: player, move_pgn: pgnMove });

  // Update match state
  yield* World.resolve(updateMatchState, { lobby_id: lobbyID, latest_match_state: newFen });

  // Check game over — was in round_executor.endState()
  if (chess.isGameOver()) {
    yield* World.resolve(endMatch, { lobby_id: lobbyID });
    // Schedule stats update
    yield* World.resolve(createScheduledData, { ... });
  } else {
    // Create next round
    yield* World.resolve(insertNewRound, { ... });
    // Schedule zombie timeout
    yield* World.resolve(createScheduledData, { block_height: blockHeight + lobby.round_length, ... });
  }
});
```

**What to keep vs remove:**

| Keep (move to `packages/node/`) | Remove entirely |
|--------------------------------|-----------------|
| Pure chess logic: `isValidMove`, `gameOver`, `updateBoard` | `round_executor.ts` |
| Rating calculation: `calculateRatingChange` | `match_executor.ts` |
| Helper types: `MatchState`, `MatchEnvironment` | `tick.ts` / `processTick` |
| Validation: `validateSubmittedMove` | `initRoundExecutor` / `buildMatchState` |
| | `extractMatchEnvironment` |
| | The `[PreparedQuery, params]` tuple pattern |

**The `[PreparedQuery, params]` tuple pattern must also be removed.** The old transitions return `SQLUpdate[]` (arrays of `[query, params]` tuples) which are then iterated and resolved. In the new SDK, yield directly:

```ts
// OLD: returns tuples to be resolved later
const result: SQLUpdate[] = await createdLobby(user, blockHeight, input, prando);
for (const [query, params] of result) {
  yield* World.resolve(query, params);
}

// NEW: yield directly inside the transition
yield* World.resolve(insertLobby, { lobby_id: id, creator: user, ... });
yield* World.resolve(insertRound, { lobby_id: id, round: 1, ... });
```

This eliminates the indirection layer (`transition.ts` → `persist/*.ts` → SQL tuples → state-machine.ts resolves them). All DB writes happen inline in the STM transition.

### Step 4: Merge remaining game-logic helpers

After removing the executor abstraction, pure helper functions (chess validation, rating math, etc.) should be moved into `packages/node/` as local utilities — either in `state-machine.ts` directly or a `game-helpers.ts` file if they're substantial.

- `chess-logic.ts` functions (`isValidMove`, `gameOver`, `updateBoard`, `calculateRatingChange`) → keep, move to node
- `types.ts` (MatchState, MatchEnvironment, etc.) → simplify and move to node
- Delete the `packages/shared/game-logic/` package entirely

### Step 5: Rename `PaimaSTM` → `Stm`

```ts
// OLD
import { PaimaSTM } from "@paimaexample/sm";
const stm = new PaimaSTM(grammar);

// NEW
import { Stm } from "@effectstream/sm";
const stm = new Stm<typeof grammar, {}>(grammar);
```

The `Stm` class now takes type parameters for type-safe `parsedInput` in transitions.

### Step 6: Update ConfigBuilder

The `ConfigBuilder` API is largely the same, but imports change and the config should be in a separate `config.dev.ts` file (not embedded in `data-types`):

```ts
// OLD (in packages/shared/data-types/src/localhostConfig.ts)
import { ConfigBuilder, ConfigNetworkType, ConfigSyncProtocolType } from "@paimaexample/config";

// NEW (in packages/node/config.dev.ts)
import { ConfigBuilder, ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
```

Also:
- Add a `config.mainnet.ts` with env var validation (see Multi-Environment Pattern section)
- The `addViemNetwork` helper replaces manual EVM network config objects

### Step 7: Move Start Script to Root

```ts
// OLD: packages/client/node/scripts/start.ts
import { launchEvm } from "@paimaexample/orchestrator/launch-evm";
// Used programmatic start()

// NEW: start.dev.ts (project root)
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
// Uses export default { ... } satisfies OrchestratorConfig
```

The new orchestrator uses `export default` config pattern, not a programmatic `start()` call.

### Step 8: Update Entry Point

```ts
// OLD: packages/client/node/src/main.ts
import { init, start } from "@paimaexample/runtime";
import { config } from "@my-template/data-types/localhostConfig";
import { grammar } from "@my-template/data-types/grammar";
import { appStateTransitions } from "./state-machine.ts";

// NEW: packages/node/main.dev.ts
import { init, start } from "@effectstream/runtime";
import { config } from "./config.dev.ts";
import { grammar } from "./grammar.ts";
import { appStateTransitions } from "./state-machine.ts";
```

Everything is now local imports within `packages/node/` — no cross-package imports for grammar/config.

### Step 9: Update `package.json` Workspaces

```json
// OLD (various patterns)
"workspaces": ["packages/client/*", "packages/shared/*", "packages/shared/**/*", "packages/frontend"]

// NEW
"workspaces": ["packages/*"]
```

Add the `effectstream.default` field and update all scripts:
```json
{
  "scripts": {
    "dev": "NODE_ENV=development bunx orchestrator start",
    "start:mainnet": "bun run packages/node/main.mainnet.ts",
    "test": "bun run packages/tests/run-tests.ts"
  },
  "effectstream": { "default": "start.dev.ts" }
}
```

### Step 10: Frontend Server Migration

Old templates use different servers:
- **Oak** (evm-midnight, multi-chain, night-bitcoin): Replace with Fastify + `@fastify/static`
- **http-server** (dice, rps, world-map-2d): Replace with Fastify + `@fastify/static`
- **Express**: Replace with Fastify + `@fastify/static`

The frontend server is typically <20 lines:
```ts
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";

const server = Fastify();
server.register(fastifyStatic, { root: path.join(import.meta.dirname!, "../client/dist") });
server.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
await server.listen({ port: 10599, host: "0.0.0.0" });
```

The frontend framework itself (React, vanilla JS, etc.) is agnostic — keep whatever the template already uses.

### Step 11: Remove `@ts-rest` (if present)

Chess uses `@ts-rest/core` for typed API contracts. Replace with plain Fastify routes in `packages/node/api.ts`:

```ts
// OLD: @ts-rest contract + router
import { initServer } from "@ts-rest/fastify";
const s = initServer();
const router = s.router(contract, { ... });

// NEW: plain Fastify
export const apiRouter: StartConfigApiRouter = async (server, dbConn) => {
  server.get("/api/endpoint", async (req, reply) => { ... });
};
```

### Step 12: Batcher Migration

The batcher API supports two patterns (both valid):

**Pattern A — Config-based** (adapters in config object):
```ts
const config: BatcherConfig = {
  adapters: { myAdapter },
  defaultTarget: "myAdapter",
  batchingCriteria: { myAdapter: { criteriaType: "time", timeWindowMs: 1000 } },
  // ...
};
const batcher = createNewBatcher(config, storage);
```

**Pattern B — Fluent** (add adapters after creation):
```ts
const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: 1000,
  enableHttpServer: true,
  // ... (no adapters field)
};
const batcher = createNewBatcher(config, storage);
batcher
  .addBlockchainAdapter("myAdapter", adapter, { criteriaType: "time", timeWindowMs: 1000 })
  .setDefaultTarget("myAdapter");
```

Pattern B is preferred for new templates — it separates configuration from adapter wiring and makes it easier to conditionally add adapters (e.g., skip Midnight adapter when `DISABLE_MIDNIGHT=true`).

### Step 13: Migrate Custom Primitives (if present)

The `multi-chain-token-transfer` template has a `packages/shared/custom-primitive-mct-erc1155/` package. In the new layout, custom primitives are defined inline in `packages/node/` (typically in the same file as the state machine, or a dedicated `primitives.ts` file) and registered via `userDefinedPrimitives` in the `start()` config.

- Move the primitive class from its own package into `packages/node/`
- Update it to extend `Primitive` from `@effectstream/sm` (see Custom Primitives section)
- Register it in `main.dev.ts`: `yield* start({ ..., userDefinedPrimitives: { "EVM:MY-TYPE": MyPrimitive } })`
- Delete the old standalone package

### Step 14: Add Tests Package

Old templates have no tests. Create `packages/tests/` from scratch following the Testing section of this document.

### Migration Checklist (per template)

Build incrementally — verify each step compiles/works before moving to the next. Do not proceed past a step that fails.

- [ ] Rename all `@paimaexample/*` → `@effectstream/*` in every `package.json` and `.ts` file
- [ ] Flatten `packages/client/node/` → `packages/node/`
- [ ] Flatten `packages/client/database/` → `packages/database/`
- [ ] Flatten `packages/shared/contracts/{chain}/` → `packages/contracts-{chain}/`
- [ ] **Compile each contract package and verify success** (e.g., `bun run build:evm`, `bun run build:midnight`)
- [ ] Merge `packages/shared/data-types/` into `packages/node/` (grammar.ts, config.dev.ts)
- [ ] Set database script to `"pgtyped:update": "bun run ./node_modules/@effectstream/db/scripts/pgtyped-update.ts"`
- [ ] **Run `bun run build:pgtypes` to generate typed queries and verify success**
- [ ] Commit the generated `sql/*.queries.ts` files (required for sibling package imports)
- [ ] **Ensure no raw SQL anywhere outside `packages/database/sql/*.sql`** — replace all raw queries with pgtyped `PreparedQuery` objects from `@my-template/database`
- [ ] Remove round executor / match executor / tick abstraction (inline game logic into STM transitions)
- [ ] Remove `[PreparedQuery, params]` tuple pattern (yield `World.resolve` directly with generated queries)
- [ ] Move pure helper functions (validation, math) from `game-logic` into `packages/node/`
- [ ] Delete `packages/shared/game-logic/` entirely
- [ ] Delete `packages/shared/utils/` (merge needed utilities)
- [ ] Delete `packages/shared/` and `packages/client/` wrapper directories
- [ ] Rename `PaimaSTM` → `Stm` with proper type parameters
- [ ] Move `scripts/start.ts` → root `start.dev.ts` (export default pattern)
- [ ] Create `main.dev.ts` and `main.mainnet.ts` (split from single `main.ts`)
- [ ] Create `config.dev.ts` and `config.mainnet.ts` (split from `localhostConfig.ts`)
- [ ] Update root `package.json` (workspaces, scripts, `effectstream.default`, `build:pgtypes`)
- [ ] Replace Oak/http-server/Express with Fastify (frontend server)
- [ ] Remove `@ts-rest` if present (replace with plain Fastify routes)
- [ ] Migrate custom primitives into `packages/node/` (if present)
- [ ] Create `packages/batcher/` with adapter factories + `batcher.{env}.ts` entry points (if batcher exists)
- [ ] Create `packages/tests/` with phases A, B, C
- [ ] Verify `bun run dev` works
- [ ] Verify `bun run test` passes

---

## Migration Notes & Best Practices

### Multi-chain Templates (Midnight, Bitcoin, etc.)

**Nested workspace for compiled contracts**: Midnight Compact contracts generate code into a subdirectory (`src/managed/`). The contract subpackage must remain a separate workspace with a self-referencing `workspace:*` dependency. List it explicitly in root `workspaces`:
```json
"workspaces": ["packages/*", "packages/contracts-midnight/contract-round-value"]
```
`packages/*` will NOT discover nested packages.

**Required npm scripts for `launchMidnight`**: The `contracts-midnight` package must expose these scripts (the orchestrator `launchMidnight` helper requires them):
- `midnight-node:start`, `midnight-node:wait`
- `midnight-indexer:start`, `midnight-indexer:wait`
- `midnight-proof-server:start`, `midnight-proof-server:wait`
- `midnight-contract:deploy`

**Midnight scripts must match the working e2e patterns**: The scripts in `contracts-midnight/package.json` have several non-obvious requirements. Use the `e2e/shared/contracts/midnight/package.json` as the source of truth:
- Use `bun ./node_modules/.bin/npm-midnight-node` (direct path), NOT `bunx @effectstream/npm-midnight-node` (`bunx` may fail to resolve the binary)
- The same applies to `npm-midnight-indexer` and `npm-midnight-proof-server`
- `midnight-node:start` requires `--port 30333` (explicit P2P port) — without it the node may crash
- `midnight-node:start` requires `MIDNIGHT_STORAGE_PASSWORD` env var — the node needs it for storage initialization
- The deploy script also needs `MIDNIGHT_STORAGE_PASSWORD` — pass it via `launchMidnight`'s `opts.env`:
```ts
launchMidnight("@my-template/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
  env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
})
```

**`MIDNIGHT_STORAGE_PASSWORD` complexity requirements**: The `@midnight-ntwrk/midnight-js-level-private-state-provider` validates the password against complexity rules — it must contain at least 3 of: uppercase letters, lowercase letters, digits, special characters. A simple all-lowercase password like `yourpasswordmypassword` will fail. Use something like `YourPasswordMy1!`.

**Compact compiler and runtime version alignment**: The Compact compiler version (set in the `compact compile +X.Y.Z` script) determines the output format. The `compact-runtime` npm dependency must match — compiled output asserts it at import time via `checkRuntimeVersion(...)`. If the `compact-js` SDK library expects `provableCircuits` (which was added in runtime `0.15.0`), older compiler output (e.g. `0.11.0`) will fail at deploy time with `undefined is not an object (evaluating 'Object.keys(contract.provableCircuits)')`. Pin to exact versions from the compatibility matrix:
```json
// contract-round-value/package.json script:
"compact": "compact compile +0.31.0 src/counter.compact src/managed"

// contracts-midnight/package.json dependencies (exact, no ranges):
"@midnight-ntwrk/compact-runtime": "0.16.0",
"@midnight-ntwrk/compact-js": "2.5.1",
"@midnight-ntwrk/ledger-v8": "8.1.0"
```

**Midnight SDK compatibility matrix**: All `@midnight-ntwrk/*` packages (compiler, runtime, wallet SDK, midnight-js, ledger, indexer) must use versions from the same compatibility set. Mismatched versions cause hard-to-debug errors like "Failed to decode ledger event payload", "Could not deserialize Ledger Event", or `provableCircuits` being undefined. Always check the official compatibility matrix before updating any Midnight dependency: https://github.com/midnightntwrk/midnight-sdk/blob/main/COMPATIBILITY.md

**Pin ALL Midnight package versions to exact values** — no `^` or `~` ranges. Midnight versions are exact for mainnet; even a minor bump can introduce incompatibilities across the SDK surface. As of 2026-07-29 (midnight-node 1.0.0 era) the stable set is:

| Package group | Version |
|---|---|
| Compact compiler (`compactc`) | `+0.31.0` |
| `@midnight-ntwrk/compact-runtime` | `0.16.0` |
| `@midnight-ntwrk/compact-js` | `2.5.1` |
| `@midnight-ntwrk/midnight-js-*` (contracts, types, utils, providers, etc.) | `4.1.1` |
| `@midnight-ntwrk/ledger-v8` | `8.1.0` |
| `onchain-runtime` → `npm:@midnight-ntwrk/onchain-runtime-v3` | `3.0.0` |
| `@midnightntwrk/wallet-sdk-facade` | `4.1.0` |
| `@midnightntwrk/wallet-sdk-abstractions` | `2.1.0` |
| `@midnightntwrk/wallet-sdk-hd` | `3.0.3` |
| `@midnightntwrk/wallet-sdk-shielded` | `3.0.2` |
| `@midnightntwrk/wallet-sdk-dust-wallet` | `4.2.0` |
| `@midnightntwrk/wallet-sdk-unshielded-wallet` | `3.1.0` |
| `@midnightntwrk/wallet-sdk-address-format` | `3.1.2` |
| `@midnightntwrk/wallet-sdk-capabilities` | `3.3.1` |
| `@midnight-ntwrk/dapp-connector-api` | `4.0.1` |
| Node (binaries) | `1.0.0` |
| Indexer (binaries) | `4.3.3` |
| Proof Server (binaries) | `ledger-8.1.0` |

Notes:
- The wallet SDK moved npm scope from `@midnight-ntwrk/wallet-sdk-*` (hyphenated) to `@midnightntwrk/wallet-sdk-*` (no hyphen). The ledger, midnight-js, and compact packages remain on the old `@midnight-ntwrk` scope.
- `@midnight-ntwrk/zswap` no longer exists in this stack — zswap types (`ZswapSecretKeys`, transactions, etc.) are re-exported from `@midnight-ntwrk/ledger-v8`.
- The legacy `@midnight-ntwrk/wallet` / `wallet-api` (5.0.0) packages are replaced by the `@midnightntwrk/wallet-sdk-*` facade stack.
- The old `@midnight-ntwrk/ledger` and `@midnight-ntwrk/ledger-v6` packages are deprecated. Use `@midnight-ntwrk/ledger-v8`. Similarly, `onchain-runtime-v1` is replaced by `onchain-runtime-v3`.
- `@midnight-ntwrk/compact-js` must stay on `2.5.1` — `2.5.3+` switched its ledger dependency to `ledger-v9` (the node 2.0 pre-release line).
- The tree must resolve exactly ONE copy of `@midnight-ntwrk/ledger-v8`; two copies give two `LedgerParameters` class identities and proving fails with `expected instance of LedgerParameters`. Use a root `overrides` entry if your resolver keeps a duplicate.

**Compact runtime Map objects require iterator access**: Midnight Compact's `Map<K, V>` type compiles to JavaScript objects that have `member()`, `lookup()`, `isEmpty()`, `size()`, and `[Symbol.iterator]()` methods — but `Object.entries()` and `Object.keys()` return the method names as keys, not the map data. When accessing Map data in STM handlers, always iterate via `[Symbol.iterator]()` or use `member(key)` + `lookup(key)`. If you serialize Compact state to JSON (e.g., the `MidnightGenericPrimitive`'s `makeJsonSafe()` pipeline), you must detect and iterate these Maps explicitly — `JSON.stringify` will drop function values silently, producing empty `{}`.

**`MidnightGenericPrimitive` `ledgerSchema` option**: The `MidnightGenericPrimitive` accepts an optional `ledgerSchema` that maps Compact ledger field names to types (`uint8`–`uint128`, `bytes`, `boolean`, `option`, `map`). When provided, the primitive parses raw `StateValue` arrays into named fields. Schema keys must be in Compact declaration order — the parser maps each key to the corresponding positional index. Without `ledgerSchema`, the raw `payload` object is passed through (after `makeJsonSafe` serialization).

**Cardano pool delegation certificates carry no ADA amount**: The `cardanoPoolDelegation` primitive emits `{ address, pool, epoch }` — the staking credential hash, pool keyhash, and epoch number. Delegation certificates on Cardano do not include the delegated ADA amount. To determine how much ADA is delegated, query the wallet's UTxO balance separately (e.g., via Lucid's `utxosAt(address)` or Blockfrost API).

**Deploy script import path**: The `@effectstream/midnight-contracts` package exports `./deploy` (not `./deploy-ledger6` or other legacy names). `DeployConfig` is exported from `./types`:
```ts
import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
```

**WASM runtime workaround**: `@midnight-ntwrk/onchain-runtime` must be imported at the top of `main.ts` before any other Midnight imports. Without this, the WASM module fails to initialize at runtime. When `DISABLE_MIDNIGHT=true`, guard this import:
```ts
if (!isEnvTrue("DISABLE_MIDNIGHT")) {
  await import("@midnight-ntwrk/onchain-runtime");
}
```

**`DISABLE_MIDNIGHT` dynamic import pattern**: Multi-chain templates should support running without optional chain toolchains. Any top-level import from a Midnight package (contract types, SDK modules) will fail if the Compact compiler output (`managed/`) doesn't exist. Convert these to conditional dynamic imports:
```ts
const midnightEnabled = !isEnvTrue("DISABLE_MIDNIGHT");
const midnight = midnightEnabled
  ? await (async () => {
      const { readMidnightContract } = await import("@effectstream/midnight-contracts/read-contract");
      const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
      const CounterContract = await import("@my-template/midnight-contract/contract");
      return { readMidnightContract, midnightNetworkConfig, CounterContract };
    })()
  : null;
```
Apply this pattern in `config.ts`, `main.ts`, and batcher configs. Use `critical: midnightEnabled` on frontend/batcher processes so they don't shut down the orchestrator when Midnight is disabled.

**Managed directory stubs for `DISABLE_MIDNIGHT` mode**: The Midnight contract package's `_index.ts` re-exports from `./managed/contract/index.js` (Compact compiler output). For the frontend to build without the compiler, create stubs:
- `src/managed/contract/index.js` -- minimal `Contract` class and `ledger` function that throw "not compiled" errors
- `src/managed/contract/index.d.ts` -- type stubs matching the generated contract interface
- `src/managed/keys/.gitkeep` and `src/managed/zkir/.gitkeep` -- empty directories for `viteStaticCopy`

These stubs are overwritten when `bun run build:midnight` runs the real Compact compiler.

### EVM Contracts

**Forge build required for TypeScript ABI generation**: The `@effectstream/evm-hardhat/builder` script reads contract artifacts exclusively from `build/artifacts/forge/`, not from `build/artifacts/hardhat/`. This means Foundry (`forge`) must be installed and `forge build` must run before the builder can generate `build/mod.ts` with ABI exports. The `contracts-evm` package should include both build scripts:
```json
"build:forge": "bun run swap:remappings:forge && forge build",
"build:hardhat": "bun run swap:remappings:hardhat && bun ./node_modules/.bin/hardhat compile"
```
The orchestrator's `launchEvm` only runs `build:hardhat` (for deployment), so forge artifacts should either be pre-built or the `build:hardhat` script should also trigger `build:forge`. Without forge artifacts, `build/mod.ts` will be `export {}` and frontend imports like `erc721dev` will fail.

**Remappings depth must be `--depth=0`**: The `swap:remappings:forge` and `swap:remappings:hardhat` scripts accept a `--depth` flag that controls how many `../` levels to prepend when resolving `node_modules/`. Always use `--depth=0`:
```json
"swap:remappings:forge": "bun ./node_modules/@effectstream/evm-hardhat/src/remappings/remappings-forge.ts --depth=0",
"swap:remappings:hardhat": "bun ./node_modules/@effectstream/evm-hardhat/src/remappings/remappings-hardhat.ts --depth=0"
```
Higher depth values (e.g., `--depth 4`) generate paths like `../../../../node_modules/` which break in Docker where the app is at `/app/` (only 2 levels deep). Using `--depth=0` works everywhere.

**Builder must use dynamic import, not `bun run`**: The `build:mod` script runs the `@effectstream/evm-hardhat/builder` to generate `mod.ts` from forge artifacts. Use `bun -e 'await import(...)'` — not `bun run @effectstream/evm-hardhat/builder`:
```json
"build:mod": "(bun run deploy:standalone || true) && bun -e 'await import(\"@effectstream/evm-hardhat/builder\")'",
```
`bun run <package>` fails in Docker because the package bin entry isn't resolvable through Bun's `.bun/` cache. The dynamic import works everywhere.

**Solidity contract rename**: The SDK renamed `PaimaL2Contract.sol` to `EffectstreamL2Contract.sol`. Update imports:
```solidity
// Old
import {PaimaL2Contract} from "@effectstream/evm-contracts/src/contracts/PaimaL2Contract.sol";
// New
import {EffectstreamL2Contract} from "@effectstream/evm-contracts/src/contracts/EffectstreamL2Contract.sol";
```

### Cardano Templates (YACI DevKit + Dolos)

**Local Cardano dev stack**: `launchCardano` starts three services: (1) **YACI DevKit** — a local Cardano devnet with a faucet at `localhost:10000` and a web UI at `localhost:8090`, (2) **Dolos** — a lightweight Cardano node that exposes UTxO-RPC (gRPC at `localhost:50051`) and a Blockfrost-compatible API at `localhost:3000`, (3) **cardano-submit-tx** — a one-shot process that submits initial transactions (e.g., stake delegation to bootstrap the pool).

**Lucid Evolution for Cardano wallets**: Use `@lucid-evolution/lucid` + `@lucid-evolution/provider` for wallet creation, transaction building, and delegation. `Lucid.new()` connects to the Dolos Blockfrost provider at `http://localhost:3000`. For dev wallets, `generateSeedPhrase()` creates a new wallet; fund it via the YACI faucet (`POST http://localhost:10000/local-cluster/api/addresses/topup`). YACI faucet topups take ~5 seconds to produce UTxOs.

**YACI faucet field name is `adaAmount`**: The topup endpoint expects `{ address, adaAmount }`, NOT `{ address, amount }`. Using the wrong field name returns HTTP 400.

**Lucid provider overrides for YACI+Dolos**: Dolos does not support tx evaluation (`evaluateTx`), and YACI's submit endpoint requires `application/cbor` content type. Override both on the Blockfrost provider:
```ts
const provider = new Blockfrost(DOLOS_URL, "dev");
provider.evaluateTx = async () => {
  return [{ redeemer_tag: "spend", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } }];
};
provider.submitTx = async (tx: string): Promise<string> => {
  const res = await fetch(`${YACI_URL}/local-cluster/api/tx/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/cbor" },
    body: hexToBytes(tx),
  });
  if (!res.ok) throw new Error(`TX submit failed (${res.status}): ${await res.text()}`);
  return (await res.text()).replace(/^"|"$/g, "");
};
```

**YACI POSIX vs wall-clock time mismatch**: On YACI devnet, `genesis.systemStart` (used for on-chain POSIX time via the Shelley genesis) differs from `devnet.startTime` (used for Lucid's `SLOT_CONFIG_NETWORK["Custom"].zeroTime`). The offset between them (typically several hours) must be accounted for when comparing on-chain timestamps (e.g., `for_how_long` from the Hololocker) against `Date.now()`. Compute the offset as `systemStartMs - slotConfig.zeroTime` and subtract it from on-chain POSIX values to get wall-clock time:
```ts
const epochOffset = systemStartMs - SLOT_CONFIG_NETWORK["Custom"].zeroTime;
const wallClockMs = cardanoPosixMs - epochOffset;
```
Failing to account for this offset causes time-lock comparisons to fail — e.g., `canClaim` will never be true because the on-chain timestamp appears hours in the future.

**YACI genesis pool**: YACI DevKit creates one genesis stake pool. Its pool hash is `7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57` (bech32: `pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy`). Use this for delegation tests. The `cardanoPoolDelegation` primitive detects delegations to this pool via UTxO-RPC certificate scanning.

**Five Cardano primitives**: The SDK provides five Cardano-specific primitives beyond `utxorpcGeneric`. All use the `CARDANO_UTXORPC_PARALLEL` sync protocol via Dolos:

| Primitive | Grammar fields | Use case |
|-----------|---------------|----------|
| `CardanoPoolDelegation` | `address` (staking cred hash), `pool` (pool keyhash), `epoch` | Detect stake delegations — useful for eligibility/governance |
| `CardanoMintBurn` | `policy`, `asset`, `quantity` | Track native token minting and burning |
| `CardanoTransfer` | `address`, `amount`, ... | Track ADA/token transfers |
| `CardanoDelayedAsset` | ... | Delayed asset claim tracking |
| `CardanoProjectedNFT` | ... | Projected NFT state changes |

**ProjectedNFT primitive emits duplicate entries**: The `CardanoProjectedNFT` primitive inserts each lock event twice (once for the UTxO consumed, once for the UTxO produced). Frontends querying the `cardano_projected_nft` table must deduplicate by `(current_tx_id, current_output_index, status)` to avoid showing each lock card twice.

### Orchestrator Migration

**Export-default pattern, not programmatic start**: Orchestrator configs use `export default { ... } satisfies OrchestratorConfig`. The CLI invokes the config file directly. There is no programmatic `start()` function -- the `dev` script must call the CLI:
```
"dev": "NODE_ENV=development bunx orchestrator start"
```

The CLI reads the start file from `package.json`'s `effectstream.default` field, or you can pass it as an argument:
```
bunx orchestrator start start.dev.ts
```

**Process dependencies**: Use the named constants from launchers (`DbNames.PGLITE_WAIT`, `EvmNames.GENERATE_MOD`, `MidnightNames.CONTRACT_DEPLOY`) in `dependsOn` arrays. These ensure correct startup ordering.

**Test vs dev orchestrator config**: Keep a separate `start.test.ts` in `packages/tests/` with `ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true"` and no TUI/frontend processes. Tests need stdout logging, not multiplexed terminal output.

### Bun Runtime Limitations

**MQTT broker (`ws.createWebSocketStream`)**: Bun does not implement `createWebSocketStream` from the `ws` module. The MQTT event broker (`aedes-server-factory`) uses this internally. The broker starts successfully, but crashes asynchronously when a WebSocket client connects.

The fix is a `typeof Bun` guard in `@effectstream/runtime`'s `main.ts` that skips `EventBroker.createServer()` entirely under Bun. Once Bun ships WebSocket stream support, remove the guard.

**Frontend BlockWatcher HTTP polling fallback**: Since the MQTT broker is skipped under Bun, the frontend's `BlockWatcher` will silently fail — `latestBlock` never updates, so `waitForBlock()` hangs forever. The fix is a `VITE_IS_BUN=true` env var (set in `packages/frontend/.env`) that switches BlockWatcher to poll the `/block-heights` REST endpoint every 2 seconds instead of using MQTT subscriptions.

### General Best Practices

**Flat layout is non-negotiable**: No `client/`, `shared/`, `src/` wrapper directories inside packages. Grammar, config, state machine, API all live directly in `packages/node/`.

**One grammar, one config, one STM per node**: Don't split these across packages. They are tightly coupled and belong together.

**Multi-environment files use name suffixes**: `config.dev.ts`, `config.mainnet.ts` -- not subdirectories, not environment variables that switch at runtime.

**Start file lives at the project root**: Not inside `packages/node/`. The orchestrator config references relative paths to all packages, so it belongs at the top level.

**pgtyped `srcDir` must match the new layout**: When flattening `database/src/sql/` to `database/sql/`, update `pgtypedconfig.json` accordingly (`"srcDir": "./sql"` not `"./src/sql"`).

**No raw SQL outside the database package**: The only place raw SQL strings are allowed is in `packages/database/sql/*.sql` files and `packages/database/migrations/*.sql` files. Everywhere else — state machine transitions, API routes, tests — must use pgtyped-generated `PreparedQuery` objects imported from `@my-template/database`. Use `World.resolve(queryFn, params)` in STM transitions and `runPreparedQuery(queryFn.run(params, dbConn), label)` in API routes. Run `bun run build:pgtypes` after any schema or query change and verify the generation succeeds before continuing.

**Compile contracts before building dependent packages**: After creating or modifying a contract package, run its compilation script (`bun run build:evm`, `bun run build:midnight`, etc.) and verify it succeeds. Contract compilation generates artifacts (ABIs, addresses, TypeScript bindings) that downstream packages depend on. A failed compilation will cascade into confusing errors in the node, batcher, and frontend packages.

**Test every template**: Every template must have `packages/tests/` with at minimum Phase A (infra) and Phase B (STM/DB) tests. Phase C (frontend) is required if a frontend exists. The `bun run test` script must be present in the root `package.json`.

**Contract address resolution happens after deploy**: Tests and sync nodes that import `contractAddressesEvmMain()` or `readMidnightContract()` must only run after the `generate-evm-mod` / `midnight-contract` processes complete. Use `dependsOn` in the orchestrator and `waitForProcess` in test runners.

**No `workspace:*` in package dependencies**: Bun workspaces resolve sibling packages by name automatically. Do not add `"@my-template/database": "workspace:*"` to sibling package.json files — it's unnecessary and can cause resolution issues with some Bun versions. Just import `@my-template/database` directly; Bun finds it via the root workspace declaration.

### SDK Class & Module Renames

Several classes and exports were renamed from the `Paima*` prefix to `Effectstream*` or shorter names. These will cause build failures if not updated:

| Old name | New name | Package |
|----------|----------|---------|
| `PaimaL2Contract.sol` | `EffectstreamL2Contract.sol` | `@effectstream/evm-contracts` |
| `PaimaEngineConfig` | `EffectstreamConfig` | `@effectstream/wallets` |
| `PaimaEventManager` | `EventManager` | `@effectstream/event-client` |
| `PaimaL2DefaultAdapter` | `EffectstreamL2DefaultAdapter` | `@effectstream/batcher-sdk` |

Use `grep -r "PaimaL2\|PaimaEngine\|PaimaEvent\|PaimaSTM"` across your template to find remaining references.

### Frontend Vite Issues

**Do NOT use `vite-plugin-top-level-await`**: This plugin depends on Node.js internals that are not available in Bun, causing the frontend build to fail when Node.js is not installed. It is also unnecessary — Vite's `build.target: "esnext"` already supports top-level await natively in modern browsers. Remove both the import and plugin call from `vite.config.ts`, and remove `vite-plugin-top-level-await` from `package.json` dependencies.

**`stream/web` polyfill**: The `vite-plugin-node-stdlib-browser` rewrites `node:stream` to `stream-browserify`, but `stream-browserify/web` doesn't exist. Midnight SDK packages (via `fetch-blob`) require `node:stream/web`. Add a custom Vite plugin before the node polyfills plugin:
```ts
{
  name: "fix-stream-web",
  enforce: "pre",
  resolveId(source) {
    if (source.endsWith("stream-browserify/web") || source === "stream/web" || source === "node:stream/web") {
      return path.resolve(import.meta.dirname!, "stream-web-shim.mjs");
    }
  },
},
```
The shim re-exports native browser web streams (`globalThis.ReadableStream`, etc.).

**`node-fetch` in the browser bundle**: The Midnight SDK pulls in `node-fetch`, which does `require("fs").promises` at module init. Even though `vite-plugin-node-stdlib-browser` replaces `fs` with `memfs`, `memfs` returns `null` for `.promises`, crashing React before it can mount. The fix is to alias `node-fetch` to a shim that re-exports the browser's native `fetch`:
```ts
// vite.config.ts resolve.alias:
"node-fetch": path.resolve(import.meta.dirname!, "native-fetch-shim.mjs"),
```
```js
// native-fetch-shim.mjs
export default globalThis.fetch;
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response;
```
This bug is invisible to build-smoke tests (the build succeeds) -- it only shows up in headless browser tests or when a user opens the page. This is why the Playwright render test exists.

### Bun + Symlinked Packages

**`bunx` cannot resolve subpath exports from symlinked packages**: When using `link.sh` for monorepo development, `bunx @effectstream/evm-hardhat/remappings-hardhat` will fail with a "git clone" error because Bun tries to interpret the subpath as a git URL. Use direct file paths instead:
```json
"swap:remappings:hardhat": "bun ./node_modules/@effectstream/evm-hardhat/src/remappings/remappings-hardhat.ts --depth=0"
```
This applies to any `bunx` call with a `/` subpath when the package is symlinked.

**`wait-on` must be a direct root dependency**: The `launchPglite()` helper runs `./node_modules/.bin/wait-on tcp:5432`. Bun only hoists binaries to `node_modules/.bin/` for direct dependencies. If `wait-on` is only a transitive dependency (e.g. from `@effectstream/evm-hardhat`), the binary won't exist and `pglite-wait` will fail with "Module not found". Add it to the root `package.json`:
```json
"dependencies": {
  "wait-on": "8.0.3"
}
```

**`@midnightntwrk/wallet-sdk-address-format` is a phantom dependency**: The `@midnight-ntwrk/midnight-js-utils` package imports `@midnightntwrk/wallet-sdk-address-format` at runtime but does not declare it in its own `package.json`. The dependency chain is: `@effectstream/orchestrator` → `@effectstream/db` → `@effectstream/sync` → `@midnight-ntwrk/midnight-js-indexer-public-data-provider` → `@midnight-ntwrk/midnight-js-utils` → (undeclared) `@midnightntwrk/wallet-sdk-address-format`. In the effectstream monorepo this works because the package gets hoisted, but standalone templates fail at runtime with `Cannot find module '@midnightntwrk/wallet-sdk-address-format'`. **Every template must add this to the root `package.json`**:
```json
"dependencies": {
  "@midnightntwrk/wallet-sdk-address-format": "3.1.0"
}
```

### Testing

**Test launcher needs the same `DISABLE_*` treatment as `start.ts`**: The `packages/tests/start.test.ts` must conditionally skip optional chain launchers and their `dependsOn` entries, just like the dev orchestrator config. Otherwise tests will fail when the chain toolchain isn't installed.

**Test runner CLI path**: The test runner should resolve the orchestrator CLI via `node_modules`, not a relative path to the monorepo's `packages/build-tools/`:
```ts
const CLI_PATH = path.resolve(import.meta.dirname!, "../../node_modules/@effectstream/orchestrator/src/cli.ts");
```

### Orchestrator Launchers

**BUG: `launchCardano()` always includes `CARDANO_SUBMIT_TX`**: The `launchCardano()` helper returns a process that runs `submit-tx.ts` (initial ADA topup). In dev mode, if the frontend handles wallet funding (e.g., via a Faucet button calling YACI's topup API), these infrastructure transactions create unwanted events in the database. Filter out the process and remove it from `dependsOn`:

```ts
// start.dev.ts — exclude submit-tx from dev mode
...launchCardano("@my-template/contracts-cardano", {
  cwd: path.join(root, "packages/contracts-cardano"),
}).filter((p) => p.name !== CardanoNames.CARDANO_SUBMIT_TX),

{
  name: "sync",
  dependsOn: [
    DbNames.PGLITE_WAIT,
    EvmNames.GENERATE_MOD,
    // CardanoNames.CARDANO_SUBMIT_TX,  // removed — not needed in dev
    CardanoNames.DOLOS_MINIBF_WAIT,
  ],
},
```

Keep `CARDANO_SUBMIT_TX` in `start.test.ts` if tests need pre-funded wallets. Ideally `launchCardano()` should accept an option to exclude the submit-tx step.
---

## Migrating from `@paima/*` (paima-engine-v1) Templates

The oldest template format uses `@paima/sdk` and `@paima/node-sdk` (Node.js runtime) with flat top-level workspaces (`api/`, `db/`, `middleware/`, `state-transition/`, etc.) and `@game/*` package prefixes. This section covers migration from this format to effectstream-v2.

### Version lineage

| Era | SDK prefix | Runtime | Workspace pattern | Package prefix |
|-----|-----------|---------|-------------------|----------------|
| paima-engine-v1 | `@paima/sdk`, `@paima/node-sdk` | Node.js | flat top-level (`api/`, `db/`, etc.) | `@game/*` |
| effectstream-v1 | `@paimaexample/*` | Deno/Bun | nested (`packages/client/`, `packages/shared/`) | `@chess/*`, `@dice/*` |
| effectstream-v2 | `@effectstream/*` | Bun | flat `packages/*` | `@my-template/*` |

### Key differences from effectstream-v1 migration

The existing "Migrating from `@paimaexample/*` Templates" section covers v1→v2 for the Deno/Bun era. Paima-engine-v1 templates have additional patterns that must be handled:

| Aspect | paima-engine-v1 | effectstream-v1 |
|--------|-----------------|-----------------|
| Middleware | Full `@paima/sdk/mw-core` — bundled JS, `postConciseData`, `buildBackendQuery` | Thin wrapper (already being phased out) |
| Frontend integration | `document.Paima` injected global | Import-based |
| Parser | `PaimaParser` string grammar (`"ai = ai\|target\|id\|response"`) | Same but newer API |
| API layer | TSOA controllers with generated routes | `@ts-rest` or plain routes |
| Game logic | Varies (often a separate package with just helpers) | `round_executor` / `match_executor` |
| Build | esbuild + tsc per workspace | Bun native |
| STF | `gameStateTransitionRouter(blockHeight)` returning async functions | Same pattern |

### Step 1: Eliminate Middleware

The middleware package (`@game/middleware`) is entirely replaced by:

1. **Write operations** → `sendTransaction` from `@effectstream/wallets` in the frontend:
```ts
// OLD: middleware/endpoints/write.ts
const conciseBuilder = builder.initialize(undefined);
conciseBuilder.setPrefix('ai');
conciseBuilder.addValue({ value: String(target) });
conciseBuilder.addValue({ value: String(id) });
conciseBuilder.addValue({ value: String(response) });
const result = await postConciseData(conciseBuilder.build(), errorFxn);

// NEW: frontend direct call
import { sendTransaction } from "@effectstream/wallets";
await sendTransaction(wallet, ["ai", target, id, response], paimaConfig, "wait-effectstream-processed");
```

2. **Read operations** → Direct `fetch` to the sync node API:
```ts
// OLD: middleware/endpoints/queries.ts
const query = buildBackendQuery('game/', { game_id: String(gameId) });
const res = await fetch(query);

// NEW: frontend direct call
const res = await fetch(`http://localhost:9999/api/game?game_id=${gameId}`);
```

Delete the entire `middleware/` package. Its complexity (error handling, wallet mode switching, concise builder) is now handled by `@effectstream/wallets`.

### Step 2: Remove TSOA API → Plain Fastify

Old v1 templates use TSOA for type-safe API routes with code generation (`tsoa.json`, `RegisterRoutes`, `io-ts` validators). Replace with plain Fastify routes in `packages/node/api.ts`:

```ts
// OLD: api/src/index.ts
import { RegisterRoutes } from './tsoa/routes.js';
export default RegisterRoutes;

// NEW: packages/node/api.ts
export const apiRouter: StartConfigApiRouter = async (server, dbConn) => {
  server.get("/api/game", async (request, reply) => {
    const { game_id } = request.query as { game_id: string };
    const result = await runPreparedQuery(getGameById.run({ id: parseInt(game_id, 10) }, dbConn), "/api/game");
    reply.send({ stats: result[0] ?? null });
  });
};
```

Delete `api/`, `tsoa.json`, and any generated `routes.ts` files.

### Step 3: Remove `document.Paima` Global

Paima-engine-v1 frontends access the SDK through a global injected by the bundled middleware JS:
```ts
// OLD: frontend/src/paima.ts
export const paima = (document as any).Paima as PaimaMW;
```

Replace with direct imports:
```ts
// NEW: frontend/src/config.ts
import { EffectstreamConfig } from "@effectstream/wallets";
export const paimaConfig = new EffectstreamConfig("my-app", "mainEvmRPC", contractAddr, chain, undefined, batcherUrl, true);

// NEW: frontend/src/screens.ts
import { walletLogin, sendTransaction, WalletMode } from "@effectstream/wallets";
const wallet = await walletLogin(paimaConfig, WalletMode.EvmInjected);
await sendTransaction(wallet, ["newGame"], paimaConfig, "wait-effectstream-processed");
```

### Step 4: PaimaParser Grammar → Typebox Grammar

```ts
// OLD: state-transition/src/stf/v1/parser.ts
const myGrammar = `
    newGame = g|*x
    ai = ai|target|id|response
    tick = tick|n
`;
const parserCommands = {
  ai: { target: PaimaParser.NCharsParser(0, 100), id: PaimaParser.NumberParser(1, 100000), response: PaimaParser.NCharsParser(0, 1000) },
};

// NEW: packages/node/grammar.ts
import { Type } from "@sinclair/typebox";
export const grammar = {
  newGame: [],
  ai: [
    ["target", Type.String({ maxLength: 100 })],
    ["id", Type.Number({ minimum: 1 })],
    ["response", Type.String({ maxLength: 1000 })],
  ],
  tick: [["n", Type.Number({ minimum: 0 })]],
} as const satisfies GrammarDefinition;
```

Note: The old grammar uses prefix aliases (`g` for `newGame`) — in effectstream-v2, the JSON array uses the full grammar key name as the first element.

### Step 5: STF → Stm Class

```ts
// OLD: state-transition/src/stf/v1/index.ts
export default async function (inputData: SubmittedChainData, blockHeight: number, randomnessGenerator: Prando, dbConn: Pool): Promise<SQLUpdate[]> {
  const input = parse(inputData.inputData);
  switch (input.input) {
    case 'newGame': return await newGameCommand(input, user, userData);
    case 'ai': return await aiCommand(input, user, blockHeight, dbConn);
  }
}

// NEW: packages/node/state-machine.ts
const stm = new Stm<typeof grammar, {}>(grammar);
stm.addStateTransition("newGame", function* (data) {
  const { signerAddress: user } = data;
  yield* World.resolve(createGlobalUserState, { wallet: user });
  yield* World.resolve(newGame, { wallet: user });
});
```

Key changes:
- No `Pool` parameter — use `yield* World.resolve(query, params)` for all DB access
- No `SQLUpdate[]` return — yield directly inside the generator
- No `parse()` function — the Stm class handles parsing via the grammar definition
- No `switch` statement — each grammar key gets its own `addStateTransition`
- Async operations use `yield* World.promise()` instead of `await`

### Step 6: Move Workspace Layout to `packages/*`

```
OLD:                          → NEW:
api/                         → (deleted — merged into packages/node/api.ts)
db/                          → packages/database/
game-logic/                  → (deleted — inline into state-machine.ts)
middleware/                  → (deleted — replaced by @effectstream/wallets)
state-transition/            → packages/node/state-machine.ts
utils/                       → (deleted — merge constants into packages/node/)
frontend/                    → packages/frontend/
contracts/evm/               → packages/contracts-evm/
shinkai/ (or other helpers)  → packages/node/{helper-name}.ts
```

### Step 7: `@paima/sdk` Subpath → `@effectstream/*` Packages

The `@paima/sdk` package used subpath exports that don't map 1:1:

| Old (`@paima/sdk/*`) | New (`@effectstream/*`) |
|---------------------|------------------------|
| `@paima/sdk/concise` | `@effectstream/concise` |
| `@paima/sdk/utils` | `@effectstream/utils` |
| `@paima/sdk/mw-core` | `@effectstream/wallets` (frontend) |
| `@paima/sdk/providers` | `@effectstream/wallets` |
| `@paima/sdk/prando` | Built-in via `data.randomGenerator` in STM transitions |
| `@paima/node-sdk/db` | `@effectstream/db` |
| `@paima/node-sdk` | `@effectstream/runtime` + `@effectstream/sm` |

### Migration Checklist (paima-engine-v1 specific)

- [ ] Delete `middleware/` entirely — replaced by `@effectstream/wallets` in frontend
- [ ] Delete `api/` + `tsoa.json` — replaced by `packages/node/api.ts` (plain Fastify)
- [ ] Delete `game-logic/` — inline helpers into state machine or node package
- [ ] Delete `utils/` — merge constants (`GAME_NAME`, version) into node package
- [ ] Move `db/` → `packages/database/` (update pgtyped config, paths)
- [ ] Move `state-transition/` logic → `packages/node/state-machine.ts`
- [ ] Move `contracts/evm/` → `packages/contracts-evm/`
- [ ] Move `frontend/` → `packages/frontend/` (modernize build to Vite)
- [ ] Remove `document.Paima` global — use direct `@effectstream/wallets` imports
- [ ] Convert PaimaParser string grammar → Typebox `GrammarDefinition`
- [ ] Convert `gameStateTransitionRouter` + `switch` → `Stm.addStateTransition` per key
- [ ] Convert `SQLUpdate[]` tuple returns → direct `yield* World.resolve()` calls
- [ ] Convert `createScheduledData(string, block)` → `createScheduledData(JSON.stringify([...]), block)`
- [ ] Replace `esbuild` + `tsc` build tooling with Bun native resolution
- [ ] Replace `axios` / `node-fetch` / custom HTTP clients with native `fetch`
- [ ] Add `packages/batcher/` with adapter factory pattern
- [ ] Add `packages/tests/` with phases A + B
- [ ] Create `start.dev.ts` at project root
- [ ] Update root `package.json` (workspaces, `effectstream.default`, scripts)
- [ ] Verify `bun run dev` + `bun run test`

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
| Midnight | `contracts-midnight/` | Compact compiler (`+0.30.0`) | `launchMidnight` |
| Bitcoin | `contracts-bitcoin/` | None (scripts only) | `launchBitcoin` |
| Cardano | `contracts-cardano/` | None (Yaci devkit) | `launchCardano` |
| NEAR | `contracts-near/` | Rust → WASM | `launchNear` |
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

### 8. Tests

- [ ] Create `packages/tests/start.test.ts` (test orchestrator config) — [Test Launcher](#test-launcher-starttestts)
- [ ] Create `packages/tests/helpers.ts` with `assert` / `assertSQL` — [Test Helpers](#test-helpers)
- [ ] Create `packages/tests/infra/` Phase A tests (chain health, deploy) — [Phase A: Infrastructure](#phase-a-infrastructure)
- [ ] Create `packages/tests/stm/` Phase B tests (submit tx, verify DB + API) — [Phase B: State Machine / DB / API](#phase-b-state-machine--db--api)
- [ ] Create `packages/tests/frontend/` Phase C tests (if frontend exists) — [Phase C+: Frontend](#phase-c-frontend)
- [ ] Create `packages/tests/run-tests.ts` orchestrating all phases — [Test Runner](#test-runner-run-teststs)

### 9. Multi-environment

- [ ] Add `config.mainnet.ts` with env var validation — [Multi-Environment Pattern](#multi-environment-pattern)
- [ ] Add `main.mainnet.ts` importing mainnet config — [Multi-Environment Pattern](#multi-environment-pattern)
- [ ] Add `batcher/batcher.mainnet.ts` — [Multi-Environment Pattern](#multi-environment-pattern)
- [ ] Add `"start:mainnet"` script to root `package.json` — [Multi-Environment Pattern](#multi-environment-pattern)

### 10. Verify

- [ ] `bun run dev` boots the full stack end-to-end — [Checklist for New Templates](#checklist-for-new-templates)
- [ ] `bun run test` passes all phases — [Checklist for New Templates](#checklist-for-new-templates)

### 11. Template README

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
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
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

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
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
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { migrationTable } from "@my-template/database";

main(function* () {
  yield* init();
  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "my-template",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
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
| `gameStateTransitions` | Yes | The STM router function |
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
    ...launchEvm("@my-template/contracts-evm", { resolveFrom: root }),

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

**Location parameter**: Each launcher accepts a `ResolveLocation` -- either `{ resolveFrom: root }` (resolve the package name via `require.resolve` from the given directory) or `{ cwd: "/absolute/path" }` (use a known directory directly).

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
| `PrimitiveTypeMidnightNullifier` | — | Midnight | Nullifier tracking |
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

**SDK versioning**: All `@effectstream/*` packages share a single coordinated version and are always published together. Use the latest available version for all of them (e.g., `0.100.12`). Never mix versions across `@effectstream/*` dependencies.

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
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@my-template/contracts-evm", { resolveFrom: import.meta.dirname! }),
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
- [ ] `bun run dev` works end-to-end
- [ ] `bun run test` passes all phases

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
import { gameStateTransitions } from "./state-machine.ts";

// NEW: packages/node/main.dev.ts
import { init, start } from "@effectstream/runtime";
import { config } from "./config.dev.ts";
import { grammar } from "./grammar.ts";
import { gameStateTransitions } from "./state-machine.ts";
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
launchMidnight("@my-template/contracts-midnight", { resolveFrom: root }, {
  env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
})
```

**`MIDNIGHT_STORAGE_PASSWORD` complexity requirements**: The `@midnight-ntwrk/midnight-js-level-private-state-provider` validates the password against complexity rules — it must contain at least 3 of: uppercase letters, lowercase letters, digits, special characters. A simple all-lowercase password like `yourpasswordmypassword` will fail. Use something like `YourPasswordMy1!`.

**Compact compiler and runtime version alignment**: The Compact compiler version (set in the `compact compile +X.Y.Z` script) determines the output format. The `compact-runtime` npm dependency must match. If the `compact-js` SDK library expects `provableCircuits` (which was added in runtime `0.15.0`), older compiler output (e.g. `0.11.0`) will fail at deploy time with `undefined is not an object (evaluating 'Object.keys(contract.provableCircuits)')`. Pin to exact versions from the compatibility matrix:
```json
// contract-round-value/package.json script:
"compact": "compact compile +0.30.0 src/counter.compact src/managed"

// contracts-midnight/package.json dependencies (exact, no ranges):
"@midnight-ntwrk/compact-runtime": "0.15.0",
"@midnight-ntwrk/compact-js": "2.5.0",
"@midnight-ntwrk/ledger-v8": "8.0.3"
```

**Midnight SDK compatibility matrix**: All `@midnight-ntwrk/*` packages (compiler, runtime, wallet SDK, midnight-js, ledger, indexer) must use versions from the same compatibility set. Mismatched versions cause hard-to-debug errors like "Failed to decode ledger event payload", "Could not deserialize Ledger Event", or `provableCircuits` being undefined. Always check the official compatibility matrix before updating any Midnight dependency: https://github.com/midnightntwrk/midnight-sdk/blob/main/COMPATIBILITY.md

**Pin ALL `@midnight-ntwrk/*` versions to exact values** — no `^` or `~` ranges. Midnight versions are exact for mainnet; even a minor bump can introduce incompatibilities across the SDK surface. As of 2026-04-07 the stable set is:

| Package group | Version |
|---|---|
| Compact compiler (`compactc`) | `+0.30.0` |
| `compact-runtime` | `0.15.0` |
| `compact-js` | `2.5.0` |
| `midnight-js-*` (contracts, types, utils, providers, etc.) | `4.0.4` |
| `ledger-v8` | `8.0.3` |
| `onchain-runtime` → `npm:@midnight-ntwrk/onchain-runtime-v3` | `3.0.0` |
| `wallet-sdk-facade` | `3.0.0` |
| `wallet-sdk-abstractions` | `2.0.0` |
| `wallet-sdk-hd` | `3.0.1` |
| `wallet-sdk-shielded` | `2.1.0` |
| `wallet-sdk-dust-wallet` | `3.0.0` |
| `wallet-sdk-unshielded-wallet` | `2.1.0` |
| `wallet-sdk-address-format` | `3.1.0` |
| `wallet` / `wallet-api` | `5.0.0` |
| `dapp-connector-api` | `4.0.1` |
| `zswap` | `4.0.0` |
| Node (Docker) | `0.22.x` |
| Indexer (Docker) | `4.0.x` |
| Proof Server (Docker) | `8.0.3` |

Note: the old `@midnight-ntwrk/ledger` and `@midnight-ntwrk/ledger-v6` packages are deprecated. Use `@midnight-ntwrk/ledger-v8`. Similarly, `onchain-runtime-v1` is replaced by `onchain-runtime-v3`.

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

**YACI genesis pool**: YACI DevKit creates one genesis stake pool. Its pool hash is `7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57` (bech32: `pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy`). Use this for delegation tests. The `cardanoPoolDelegation` primitive detects delegations to this pool via UTxO-RPC certificate scanning.

**Five Cardano primitives**: The SDK provides five Cardano-specific primitives beyond `utxorpcGeneric`. All use the `CARDANO_UTXORPC_PARALLEL` sync protocol via Dolos:

| Primitive | Grammar fields | Use case |
|-----------|---------------|----------|
| `CardanoPoolDelegation` | `address` (staking cred hash), `pool` (pool keyhash), `epoch` | Detect stake delegations — useful for eligibility/governance |
| `CardanoMintBurn` | `policy`, `asset`, `quantity` | Track native token minting and burning |
| `CardanoTransfer` | `address`, `amount`, ... | Track ADA/token transfers |
| `CardanoDelayedAsset` | ... | Delayed asset claim tracking |
| `CardanoProjectedNFT` | ... | Projected NFT state changes |

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

### Testing

**Test launcher needs the same `DISABLE_*` treatment as `start.ts`**: The `packages/tests/start.test.ts` must conditionally skip optional chain launchers and their `dependsOn` entries, just like the dev orchestrator config. Otherwise tests will fail when the chain toolchain isn't installed.

**Test runner CLI path**: The test runner should resolve the orchestrator CLI via `node_modules`, not a relative path to the monorepo's `packages/build-tools/`:
```ts
const CLI_PATH = path.resolve(import.meta.dirname!, "../../node_modules/@effectstream/orchestrator/src/cli.ts");
```

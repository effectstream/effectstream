# Chess v2 Migration Plan (Reference Only)

Migrate `templates/chess/` → `templates/chess-v2/` following the canonical template specification in `templates/README.md`.

---

## Overview

| Aspect | Old (`chess/`) | New (`chess-v2/`) |
|--------|---------------|-------------------|
| SDK | `@paimaexample/*` 0.3.116 | `@effectstream/*` 0.100.12 |
| Layout | Nested (`client/`, `shared/`) | Flat (`packages/*`) |
| STM | `PaimaSTM` + `SQLUpdate[]` tuples | `Stm` + `World.resolve` inline |
| Game logic | Round/match executors + tick.ts | Inline in STM transitions |
| API | `@ts-rest/fastify` + contract pkg | Plain Fastify routes |
| Orchestrator | Programmatic `start()` | `export default {} satisfies OrchestratorConfig` |
| Batcher | `PaimaL2DefaultAdapter` | `EffectstreamL2DefaultAdapter` |
| Frontend server | Oak | Fastify + `@fastify/static` |
| Tests | None | Full test suite (phases A/B/C) |
| Multi-env | Single `main.ts` | `main.dev.ts` + `main.mainnet.ts` |

---

## Step 0: Scaffold

Create the root structure and install dependencies.

### 0.1 Create `chess-v2/package.json`

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "NODE_ENV=development bunx orchestrator start",
    "start:mainnet": "bun run packages/node/main.mainnet.ts",
    "test": "bun run packages/tests/run-tests.ts",
    "build:evm": "bun run --filter @chess-v2/contracts-evm build:mod",
    "build:pgtypes": "bun run --filter @chess-v2/database pgtyped:update"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.3.14",
    "@effectstream/evm-contracts": "0.100.12",
    "@effectstream/orchestrator": "0.100.12",
    "wait-on": "8.0.3"
  },
  "effectstream": {
    "default": "start.dev.ts"
  },
  "devDependencies": {
    "@types/bun": "^1.3.13"
  }
}
```

### 0.2 Create directory structure

```
chess-v2/
├── package.json
├── start.dev.ts
├── packages/
│   ├── node/
│   ├── database/
│   ├── contracts-evm/
│   ├── batcher/
│   ├── frontend/
│   └── tests/
```

### 0.3 Run `bun install`

**VERIFY**: `bun install` completes without errors.

---

## Step 1: Orchestrator (`start.dev.ts`)

Create the orchestrator config at the project root. This defines what services the template needs.

### 1.1 Create `chess-v2/start.dev.ts`

```ts
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite().map(p =>
      p.name === "pglite" ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } } : p
    ),
    ...launchEvm("@chess-v2/contracts-evm", { resolveFrom: root }),

    {
      name: "sync",
      description: "Chess sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
    },

    {
      name: "batcher",
      description: "Transaction batcher (EVM)",
      args: ["run", "packages/batcher/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [EvmNames.GENERATE_MOD],
    },

    {
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [EvmNames.GENERATE_MOD],
    },

    {
      name: "frontend-server",
      description: "Serve frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "serve"],
      waitToExit: false,
      type: "system-dependency",
      critical: true,
      link: "http://localhost:10599",
      stopProcessAtPort: [10599],
      dependsOn: ["frontend-build"],
    },
  ],
} satisfies OrchestratorConfig;
```

---

## Step 2: Contracts (`packages/contracts-evm/`)

Copy the EVM contracts from the old template, updating SDK references.

### 2.1 Create `packages/contracts-evm/package.json`

Source: `chess/packages/shared/contracts/evm/package.json`

Changes:
- Rename package: `@chess/evm-contracts` → `@chess-v2/contracts-evm`
- Replace `@paimaexample/evm-contracts` → `@effectstream/evm-contracts` at `0.100.12`
- Replace `@paimaexample/evm-hardhat` → `@effectstream/evm-hardhat` at `0.100.12`
- Replace `@paimaexample/log` → `@effectstream/log` at `0.100.12`
- Keep all other deps (OpenZeppelin, Hardhat, Ignition, etc.) at same versions

### 2.2 Copy contract source files

Copy from `chess/packages/shared/contracts/evm/`:
- `src/contracts/MyPaimaL2.sol` → rename contract and imports:
  ```solidity
  // OLD
  import {PaimaL2Contract} from "@paimaexample/evm-contracts/src/contracts/PaimaL2Contract.sol";
  contract MyPaimaL2Contract is PaimaL2Contract {
  
  // NEW
  import {EffectstreamL2Contract} from "@effectstream/evm-contracts/src/contracts/EffectstreamL2Contract.sol";
  contract MyEffectstreamL2 is EffectstreamL2Contract {
  ```
- `src/contracts/ERC721Dev.sol` — keep as-is (no Paima imports)
- `src/contracts/Counter.sol` — keep as-is
- `src/contracts/MyPaimaErc20ev.sol` — remove (not needed, chess doesn't use ERC-20)
- `src/contracts/MyOpenZepplinErc20Dev.sol` — remove (not needed)

### 2.3 Update Ignition modules

- `ignition/modules/paimaL2.ts` → `ignition/modules/effectstreamL2.ts`
  - Rename module: `"PaimaL2ContractModule"` → `"EffectstreamL2Module"`
  - Rename contract: `"MyPaimaL2Contract"` → `"MyEffectstreamL2"`
- `ignition/modules/erc721dev.ts` — keep as-is
- `ignition/modules/counter.ts` — keep if tests use it, else remove
- Remove `ignition/modules/erc20dev.ts`, `ignition/modules/oz-erc20dev.ts`

### 2.4 Update `deploy.ts`

- Remove ERC-20 deployment
- Update contract references to new Ignition module names
- Replace `@paimaexample/evm-hardhat` imports → `@effectstream/evm-hardhat`

### 2.5 Update `hardhat.config.ts`

Replace imports:
```ts
// OLD
import { createHardhatConfig, createNodeTasks, initTelemetry } from "@paimaexample/evm-hardhat/hardhat-config-builder";
import { JsonRpcServerImplementation } from "@paimaexample/evm-hardhat/json-rpc-server";
import { ComponentNames, log, SeverityNumber } from "@paimaexample/log";

// NEW
import { createHardhatConfig, createNodeTasks, initTelemetry } from "@effectstream/evm-hardhat/hardhat-config-builder";
import { JsonRpcServerImplementation } from "@effectstream/evm-hardhat/json-rpc-server";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
```

### 2.6 **COMPILE AND VERIFY**

```bash
bun run build:evm
```

**VERIFY**: Compilation succeeds. `build/mod.ts` is generated with contract addresses and ABIs.

---

## Step 3: Database (`packages/database/`)

### 3.1 Create `packages/database/package.json`

```json
{
  "name": "@chess-v2/database",
  "version": "1.0.0",
  "exports": "./mod.ts",
  "scripts": {
    "_pgtyped:my-sql": "bunx @effectstream/db/db-wait && bunx @effectstream/db/apply-migrations && bun run sql-to-ts.ts && pgtyped -c ./pgtypedconfig.json",
    "pgtyped:update": "concurrently --raw --kill-others \"bunx @effectstream/db/db-up\" \"bun run _pgtyped:my-sql\""
  },
  "dependencies": {
    "@effectstream/config": "0.100.12",
    "@effectstream/runtime": "0.100.12",
    "@effectstream/db": "0.100.12",
    "@pgtyped/runtime": "2.4.2",
    "pg": "^8.14.0",
    "effection": "3.5.0"
  },
  "devDependencies": {
    "@paima/pgtyped-cli": "^2.4.5",
    "concurrently": "9.1.2"
  }
}
```

### 3.2 Copy and restructure files

From `chess/packages/client/database/`:

```
OLD: src/migrations/database.sql  → NEW: migrations/000-init.sql
OLD: src/sql/select.sql           → NEW: sql/select.sql
OLD: src/sql/insert.sql           → NEW: sql/insert.sql
OLD: src/sql/update.sql           → NEW: sql/update.sql
OLD: src/common.ts                → NEW: common.ts
OLD: pgtypedconfig.json           → NEW: pgtypedconfig.json (update srcDir)
OLD: sql-to-ts.ts                 → NEW: sql-to-ts.ts
```

### 3.3 Create `packages/database/migration-order.ts`

```ts
import type { DBMigrations } from "@effectstream/runtime";
import initSql from "./migrations/000-init.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  { name: "000-init.sql", sql: initSql },
];
```

### 3.4 Create `packages/database/mod.ts`

```ts
export * from "./sql/select.queries.ts";
export * from "./sql/insert.queries.ts";
export * from "./sql/update.queries.ts";
export * from "./common.ts";
export { migrationTable } from "./migration-order.ts";
```

### 3.5 Update `pgtypedconfig.json`

Change `srcDir` from `"./src/sql"` to `"./sql"`.

### 3.6 **GENERATE TYPED QUERIES AND VERIFY**

```bash
bun run build:pgtypes
```

**VERIFY**: `sql/select.queries.ts`, `sql/insert.queries.ts`, `sql/update.queries.ts` are generated successfully.

**RULE**: From this point forward, NO raw SQL strings anywhere in the codebase outside `packages/database/sql/*.sql` and `packages/database/migrations/*.sql`. All database access must use pgtyped `PreparedQuery` objects exported from `@chess-v2/database`.

---

## Step 4: Node — Grammar (`packages/node/grammar.ts`)

### 4.1 Create `packages/node/package.json`

```json
{
  "name": "@chess-v2/node",
  "version": "1.0.0",
  "exports": {
    ".": "./main.dev.ts"
  },
  "scripts": {
    "check": "tsc --noEmit main.dev.ts"
  },
  "dependencies": {
    "@effectstream/runtime": "0.100.12",
    "@effectstream/sm": "0.100.12",
    "@effectstream/config": "0.100.12",
    "@effectstream/concise": "0.100.12",
    "@effectstream/coroutine": "0.100.12",
    "@effectstream/db": "0.100.12",
    "@effectstream/log": "0.100.12",
    "@effectstream/utils": "0.100.12",
    "@sinclair/typebox": "^0.34.30",
    "chess.js": "^1.4.0",
    "fastify": "^5.4.0",
    "pg": "^8.14.0",
    "effection": "^3.5.0"
  }
}
```

### 4.2 Create `packages/node/grammar.ts`

Copy directly from `chess/packages/shared/data-types/src/grammar.ts`, only changing the import:

```ts
import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  createdLobby: [
    ["numOfRounds", Type.Number()],
    ["roundLength", Type.Number()],
    ["playTimePerPlayer", Type.Number()],
    ["isHidden", Type.Boolean({ default: false })],
    ["isPractice", Type.Boolean({ default: false })],
    ["botDifficulty", Type.Number()],
    ["playerOneIsWhite", Type.Boolean({ default: true })],
  ],
  joinLobby: [
    ["lobbyID", Type.String()],
  ],
  closeLobby: [
    ["lobbyID", Type.String()],
  ],
  submitMoves: [
    ["lobbyID", Type.String()],
    ["roundNumber", Type.Number()],
    ["pgnMove", Type.String()],
  ],
  z: [
    ["lobbyID", Type.String()],
  ],
  u: [
    ["user", Type.String()],
    ["result", Type.String()],
    ["ratingChange", Type.Number()],
  ],
  sb: [
    ["lobbyID", Type.String()],
    ["roundNumber", Type.Number()],
  ],
} as const satisfies GrammarDefinition;
```

---

## Step 5: Node — Config (`packages/node/config.dev.ts`)

### 5.1 Create `packages/node/config.dev.ts`

```ts
import { contractAddressesEvmMain } from "@chess-v2/contracts-evm";
import { PrimitiveTypeEVMEffectstreamL2 } from "@effectstream/sm/builtin";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { hardhat } from "viem/chains";
import { grammar } from "./grammar.ts";

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("chess-v2"))
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
  .buildDeployments((builder) => builder)
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
          name: "mainEvmRPC",
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
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "Chess_EffectstreamL2",
          type: PrimitiveTypeEVMEffectstreamL2,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain()
              .chain31337["EffectstreamL2Module#MyEffectstreamL2"],
          paimaL2Grammar: grammar,
        }),
      )
  )
  .build();
```

---

## Step 6: Node — State Machine (`packages/node/state-machine.ts`)

This is the core migration. The old architecture uses:
1. `PaimaSTM` → transitions call async functions that return `SQLUpdate[]` tuples
2. Round executor abstraction (`initRoundExecutor`, `processTick`, `endState`)
3. Persist functions that build `[PreparedQuery, params]` tuples

The new architecture:
1. `Stm` with inline `World.resolve` calls
2. Chess logic called directly (no executor indirection)
3. No `SQLUpdate[]` — yield directly

### 6.1 Create `packages/node/chess-helpers.ts`

Move pure chess helper functions from `@chess/game-logic` and `@chess/utils`:

```ts
import type { Color } from "chess.js";
import { Chess } from "chess.js";

export type Timer = {
  player_one_blocks_left: number;
  player_two_blocks_left: number;
};

export type MatchEnvironment = {
  user1: { wallet: string; color: Color };
  user2: { wallet: string; color: Color };
};

export type ConciseResult = "w" | "l" | "t";
export type ExpandedResult = "win" | "loss" | "tie";

export function gameOver(fenBoard: string): boolean {
  const chess = new Chess();
  chess.load(fenBoard);
  return chess.isGameOver();
}

export function didPlayerWin(
  playerColor: Color,
  fen: string,
  opponentTimeLeft: number,
): boolean {
  const chess = new Chess();
  chess.load(fen);
  const isProperWin = chess.isCheckmate() && chess.turn() !== playerColor;
  const isTimeoutWin = !chess.isDraw() && opponentTimeLeft <= 0;
  return isProperWin || isTimeoutWin;
}

export function matchResults(
  fenBoard: string,
  matchEnvironment: MatchEnvironment,
  blocksLeft: Timer,
): [ConciseResult, ConciseResult] {
  const user1won = didPlayerWin(
    matchEnvironment.user1.color,
    fenBoard,
    blocksLeft.player_two_blocks_left,
  );
  if (user1won) return ["w", "l"];

  const user2won = didPlayerWin(
    matchEnvironment.user2.color,
    fenBoard,
    blocksLeft.player_one_blocks_left,
  );
  if (user2won) return ["l", "w"];

  return ["t", "t"];
}

export function isValidMove(fenBoard: string, move: string): boolean {
  const chess = new Chess();
  chess.load(fenBoard);
  try {
    chess.move(move);
    return true;
  } catch {
    return false;
  }
}

export function applyMove(fenBoard: string, move: string): string {
  const chess = new Chess();
  chess.load(fenBoard);
  chess.move(move);
  return chess.fen();
}

export function initialState(): string {
  return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
}

export function extractMatchEnvironment(lobby: {
  lobby_creator: string;
  player_two: string | null;
  player_one_iswhite: boolean;
}): MatchEnvironment {
  return {
    user1: {
      wallet: lobby.lobby_creator,
      color: lobby.player_one_iswhite ? "w" : "b",
    },
    user2: {
      wallet: lobby.player_two!,
      color: lobby.player_one_iswhite ? "b" : "w",
    },
  };
}

export function updateTimer(
  round: { player_one_blocks_left: number; player_two_blocks_left: number; starting_block_height: number; round_within_match: number },
  blockHeight: number,
  playerOneStarts: boolean,
): Timer {
  const elapsedBlocks = blockHeight - round.starting_block_height;
  const playerOneTurn = isPlayerOneTurn(round.round_within_match, playerOneStarts);
  return {
    player_one_blocks_left: Math.max(round.player_one_blocks_left - (playerOneTurn ? elapsedBlocks : 0), 0),
    player_two_blocks_left: Math.max(round.player_two_blocks_left - (playerOneTurn ? 0 : elapsedBlocks), 0),
  };
}

export function isPlayerOneTurn(round: number, playerOneStarts: boolean): boolean {
  return (round % 2 === 1 && playerOneStarts) || (round % 2 === 0 && !playerOneStarts);
}

export function currentPlayer(round: number, lobby: { lobby_creator: string; player_two: string | null; player_one_iswhite: boolean }): string {
  if (!lobby.player_two) return lobby.lobby_creator;
  return isPlayerOneTurn(round, lobby.player_one_iswhite) ? lobby.lobby_creator : lobby.player_two;
}

const K_FACTOR = 32;
export function calculateRatingChange(
  playerRating: number,
  opponentRating: number,
  result: ConciseResult,
  kFactor = K_FACTOR,
): number {
  const resultScore = result === "w" ? 1 : result === "l" ? 0 : 0.5;
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(kFactor * (resultScore - expectedScore));
}

export function expandResult(result: ConciseResult): ExpandedResult {
  if (result === "w") return "win";
  if (result === "l") return "loss";
  return "tie";
}
```

### 6.2 Create `packages/node/chess-ai.ts`

Copy `chess/packages/client/node/src/state-machine/persist/ai.ts` directly, only changing chess.js import (already correct). No SDK imports needed — this is pure logic.

### 6.3 Create `packages/node/state-machine.ts`

This is the major rewrite. All game logic is inlined into STM transitions using `World.resolve` with pgtyped queries.

```ts
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { AddressType } from "@effectstream/utils";
import { newScheduledHeightData, removeScheduledBlockData } from "@effectstream/db";
import { Chess } from "chess.js";
import {
  createLobby,
  startMatch,
  closeLobby,
  endMatch,
  newRound,
  newMatchMove,
  executedRound,
  newFinalState,
  updateLatestMatchState,
  newStats,
  updateStats,
  getLobbyById,
  getRoundData,
  getUserStats,
} from "@chess-v2/database";
import { grammar } from "./grammar.ts";
import {
  gameOver,
  isValidMove,
  applyMove,
  initialState,
  extractMatchEnvironment,
  matchResults,
  updateTimer,
  currentPlayer,
  calculateRatingChange,
  expandResult,
  type ConciseResult,
  type Timer,
} from "./chess-helpers.ts";
import { calculateBestMove } from "./chess-ai.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

// ─── Create Lobby ───────────────────────────────────────────────────────────

stm.addStateTransition("createdLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress: player, randomGenerator } = data;
  const lobby_id = randomGenerator.nextString(12);

  yield* World.resolve(createLobby, {
    lobby_id,
    num_of_rounds: Math.min(Math.floor(parsedInput.numOfRounds), 10),
    round_length: Math.min(Math.floor(parsedInput.roundLength), 100),
    play_time_per_player: Math.min(Math.floor(parsedInput.playTimePerPlayer), 100),
    current_round: 0,
    created_at: new Date(),
    creation_block_height: blockHeight,
    hidden: parsedInput.isHidden,
    practice: parsedInput.isPractice,
    bot_difficulty: parsedInput.botDifficulty,
    lobby_creator: player!,
    player_one_iswhite: parsedInput.playerOneIsWhite,
    player_two: null,
    lobby_state: "open",
    latest_match_state: new Chess().fen(),
  });

  yield* World.resolve(newStats, {
    stats: { wallet: player!, wins: 0, ties: 0, losses: 0, rating: 0 },
  });

  if (parsedInput.isPractice) {
    yield* activateLobby(lobby_id, "0x0", blockHeight, parsedInput.playTimePerPlayer, parsedInput.roundLength);
    yield* World.resolve(newStats, {
      stats: { wallet: "0x0", wins: 0, ties: 0, losses: 0, rating: 0 },
    });
    if (!parsedInput.playerOneIsWhite) {
      yield* scheduleBotMove(lobby_id, 1, blockHeight + 1);
    }
  }
});

// ─── Join Lobby ─────────────────────────────────────────────────────────────

stm.addStateTransition("joinLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress: player } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby) return;
  if (lobby.player_two || lobby.lobby_state !== "open" || lobby.lobby_creator === player) return;

  yield* activateLobby(parsedInput.lobbyID, player!, blockHeight, lobby.play_time_per_player, lobby.round_length);
  yield* World.resolve(newStats, {
    stats: { wallet: player!, wins: 0, ties: 0, losses: 0, rating: 0 },
  });
});

// ─── Close Lobby ────────────────────────────────────────────────────────────

stm.addStateTransition("closeLobby", function* (data) {
  const { parsedInput, signerAddress: player } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby) return;
  if (lobby.player_two || lobby.lobby_state !== "open" || lobby.lobby_creator !== player) return;
  yield* World.resolve(closeLobby, { lobby_id: lobby.lobby_id });
});

// ─── Submit Moves ───────────────────────────────────────────────────────────

stm.addStateTransition("submitMoves", function* (data) {
  const { blockHeight, parsedInput, signerAddress: player, randomGenerator } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby || lobby.lobby_state !== "active") return;

  const lobby_players = [lobby.lobby_creator, lobby.player_two];
  if (!lobby_players.includes(player!)) return;

  const [round] = yield* World.resolve(getRoundData, {
    lobby_id: lobby.lobby_id,
    round_number: parsedInput.roundNumber,
  });
  if (!round) return;
  if (parsedInput.roundNumber !== lobby.current_round) return;
  if (!isValidMove(lobby.latest_match_state, parsedInput.pgnMove)) return;

  yield* World.resolve(newMatchMove, {
    new_move: {
      lobby_id: parsedInput.lobbyID,
      wallet: player!,
      round: lobby.current_round,
      move_pgn: parsedInput.pgnMove,
    },
  });

  yield* executeRound(blockHeight, lobby, parsedInput.pgnMove, round);

  if (lobby.practice) {
    yield* scheduleBotMove(lobby.lobby_id, lobby.current_round + 1, blockHeight + 1);
  }
});

// ─── Zombie Round (scheduled) ───────────────────────────────────────────────

stm.addStateTransition("z", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby || !lobby.player_two) return;

  const [round] = yield* World.resolve(getRoundData, {
    lobby_id: lobby.lobby_id,
    round_number: lobby.current_round,
  });
  if (!round) return;

  const pgnMove = calculateBestMove(lobby.latest_match_state, 0);
  if (pgnMove) {
    const player = currentPlayer(round.round_within_match, lobby);
    yield* World.resolve(newMatchMove, {
      new_move: { lobby_id: lobby.lobby_id, wallet: player, round: lobby.current_round, move_pgn: pgnMove },
    });
    yield* executeRound(blockHeight, lobby, pgnMove, round);
    if (lobby.practice) {
      yield* scheduleBotMove(lobby.lobby_id, lobby.current_round + 1, blockHeight + 1);
    }
  } else {
    yield* executeRound(blockHeight, lobby, null, round);
  }
});

// ─── User Stats Update (scheduled) ─────────────────────────────────────────

stm.addStateTransition("u", function* (data) {
  const { parsedInput } = data;
  const [stats] = yield* World.resolve(getUserStats, { wallet: parsedInput.user });
  if (!stats) return;
  yield* World.resolve(updateStats, {
    stats: {
      wallet: parsedInput.user,
      wins: parsedInput.result === "w" ? stats.wins + 1 : stats.wins,
      losses: parsedInput.result === "l" ? stats.losses + 1 : stats.losses,
      ties: parsedInput.result === "t" ? stats.ties + 1 : stats.ties,
      rating: stats.rating + parsedInput.ratingChange,
    },
  });
});

// ─── Bot Move (scheduled) ───────────────────────────────────────────────────

stm.addStateTransition("sb", function* (data) {
  const { blockHeight, parsedInput } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby || !lobby.practice) return;

  const [round] = yield* World.resolve(getRoundData, {
    lobby_id: lobby.lobby_id,
    round_number: parsedInput.roundNumber,
  });
  if (!round) return;
  if (parsedInput.roundNumber !== lobby.current_round) return;

  const pgnMove = calculateBestMove(lobby.latest_match_state, lobby.bot_difficulty);
  if (!pgnMove) return;
  if (!isValidMove(lobby.latest_match_state, pgnMove)) return;

  yield* World.resolve(newMatchMove, {
    new_move: { lobby_id: parsedInput.lobbyID, wallet: "0x0", round: lobby.current_round, move_pgn: pgnMove },
  });

  yield* executeRound(blockHeight, lobby, pgnMove, round);
});

// ─── Shared Helpers ─────────────────────────────────────────────────────────

function* activateLobby(lobbyId: string, joiner: string, blockHeight: number, playTime: number, roundLength: number) {
  yield* World.resolve(startMatch, { lobby_id: lobbyId, player_two: joiner });
  const timer: Timer = { player_one_blocks_left: playTime, player_two_blocks_left: playTime };
  yield* createNewRound(lobbyId, 0, initialState(), timer, roundLength, blockHeight);
}

function* createNewRound(lobbyId: string, currentRound: number, matchState: string, timeLeft: Timer, roundLength: number, blockHeight: number) {
  const nextRound = currentRound + 1;
  yield* World.resolve(newRound, {
    lobby_id: lobbyId,
    round_within_match: nextRound,
    match_state: matchState,
    player_one_blocks_left: timeLeft.player_one_blocks_left,
    player_two_blocks_left: timeLeft.player_two_blocks_left,
    starting_block_height: blockHeight,
    execution_block_height: null,
  });
  const playerTimeLeft = nextRound % 2 === 1 ? timeLeft.player_one_blocks_left : timeLeft.player_two_blocks_left;
  const roundTime = Math.min(roundLength, playerTimeLeft);
  yield* World.resolve(newScheduledHeightData, {
    from_address: "0x0",
    from_address_type: AddressType.NONE,
    future_block_height: blockHeight + roundTime,
    input_data: JSON.stringify(["z", lobbyId]),
  });
}

function* executeRound(blockHeight: number, lobby: any, pgnMove: string | null, roundData: any) {
  const newFen = pgnMove ? applyMove(lobby.latest_match_state, pgnMove) : lobby.latest_match_state;

  yield* World.resolve(updateLatestMatchState, { lobby_id: lobby.lobby_id, latest_match_state: newFen });
  yield* World.resolve(executedRound, { lobby_id: lobby.lobby_id, round: lobby.current_round, execution_block_height: blockHeight });

  // Delete zombie round if not same block
  if (lobby.round_length) {
    const zombieBlock = roundData.starting_block_height + lobby.round_length;
    if (zombieBlock !== blockHeight) {
      yield* World.resolve(removeScheduledBlockData, {
        block_height: zombieBlock,
        input_data: JSON.stringify(["z", lobby.lobby_id]),
      });
    }
  }

  const timer = updateTimer(roundData, blockHeight, lobby.player_one_iswhite);
  const hasTimeout = timer.player_one_blocks_left === 0 || timer.player_two_blocks_left === 0;
  const isFinal = lobby.num_of_rounds && lobby.current_round >= lobby.num_of_rounds;

  if (gameOver(newFen) || isFinal || hasTimeout) {
    yield* finalizeMatch(blockHeight, lobby, timer, newFen);
  } else {
    yield* createNewRound(lobby.lobby_id, lobby.current_round, newFen, timer, lobby.round_length, blockHeight);
  }
}

function* finalizeMatch(blockHeight: number, lobby: any, timer: Timer, fenBoard: string) {
  yield* World.resolve(endMatch, { lobby_id: lobby.lobby_id });

  if (lobby.practice) return;

  const matchEnv = extractMatchEnvironment(lobby);
  const results = matchResults(fenBoard, matchEnv, timer);
  const elapsedBlocks = [
    lobby.play_time_per_player - timer.player_one_blocks_left,
    lobby.play_time_per_player - timer.player_two_blocks_left,
  ];

  yield* World.resolve(newFinalState, {
    final_state: {
      lobby_id: lobby.lobby_id,
      player_one_iswhite: matchEnv.user1.color === "w",
      player_one_wallet: matchEnv.user1.wallet,
      player_one_result: expandResult(results[0]),
      player_one_elapsed_time: elapsedBlocks[0],
      player_two_wallet: matchEnv.user2.wallet,
      player_two_result: expandResult(results[1]),
      player_two_elapsed_time: elapsedBlocks[1],
      positions: fenBoard,
    },
  });

  const [user1Stats] = yield* World.resolve(getUserStats, { wallet: matchEnv.user1.wallet });
  const [user2Stats] = yield* World.resolve(getUserStats, { wallet: matchEnv.user2.wallet });
  const ratingChange = calculateRatingChange(user1Stats.rating, user2Stats.rating, results[0]);

  yield* scheduleStatsUpdate(matchEnv.user1.wallet, results[0], ratingChange, blockHeight + 1);
  yield* scheduleStatsUpdate(matchEnv.user2.wallet, results[1], -ratingChange, blockHeight + 1);
}

function* scheduleStatsUpdate(wallet: string, result: ConciseResult, ratingChange: number, blockHeight: number) {
  yield* World.resolve(newScheduledHeightData, {
    from_address: wallet,
    from_address_type: AddressType.NONE,
    future_block_height: blockHeight,
    input_data: JSON.stringify(["u", wallet, result, String(ratingChange)]),
  });
}

function* scheduleBotMove(lobbyId: string, round: number, blockHeight: number) {
  yield* World.resolve(newScheduledHeightData, {
    from_address: "0x0",
    from_address_type: AddressType.NONE,
    future_block_height: blockHeight,
    input_data: JSON.stringify(["sb", lobbyId, String(round)]),
  });
}

// ─── Export ─────────────────────────────────────────────────────────────────

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
```

---

## Step 7: Node — API Routes (`packages/node/api.ts`)

Replace `@ts-rest/fastify` with plain Fastify routes. Remove the `@chess/api-contract` package entirely.

### 7.1 Create `packages/node/api.ts`

```ts
import { runPreparedQuery } from "@effectstream/db";
import { getLatestProcessedBlockHeight } from "@effectstream/db";
import {
  getLobbyById,
  getRoundData,
  getLobbyRounds,
  getPaginatedOpenLobbies,
  searchPaginatedOpenLobbies,
  getAllPaginatedUserLobbies,
  getUserStats,
  getUserRatingPosition,
  getFinalState,
  getRoundMoves,
  getMovesByLobby,
  getMatchSeeds,
  getRandomLobby,
  getRandomActiveLobby,
} from "@chess-v2/database";
import { updateTimer, type Timer } from "./chess-helpers.ts";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {

  server.get("/api/lobby_state", async (request, reply) => {
    const { lobbyID } = request.query as { lobbyID: string };
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    if (!lobby) return reply.send({ lobby: null });

    const [[roundData], [latestBlock], lobbyRounds] = await Promise.all([
      getRoundData.run({ lobby_id: lobbyID, round_number: lobby.current_round }, dbConn),
      getLatestProcessedBlockHeight.run(undefined, dbConn),
      getLobbyRounds.run({ lobby_id: lobbyID }, dbConn),
    ]);

    const latestRound = lobbyRounds[lobbyRounds.length - 1];
    const timer = latestRound
      ? updateTimer(latestRound, latestBlock.block_height, lobby.player_one_iswhite)
      : { player_one_blocks_left: lobby.play_time_per_player, player_two_blocks_left: lobby.play_time_per_player };

    reply.send({
      lobby: {
        ...lobby,
        round_start_height: roundData?.starting_block_height || 0,
        remaining_blocks: {
          w: lobby.player_one_iswhite ? timer.player_one_blocks_left : timer.player_two_blocks_left,
          b: lobby.player_one_iswhite ? timer.player_two_blocks_left : timer.player_one_blocks_left,
        },
      },
    });
  });

  server.get("/api/open_lobbies", async (request, reply) => {
    const { wallet, count, page } = request.query as { wallet: string; count: string; page: string };
    const lobbies = await getPaginatedOpenLobbies.run(
      { wallet: wallet.toLowerCase(), count: Number(count || 10), page: Number(page || 0) },
      dbConn,
    );
    reply.send({ lobbies });
  });

  server.get("/api/search_open_lobbies", async (request, reply) => {
    const { wallet, searchQuery, count, page } = request.query as any;
    const lobbies = await searchPaginatedOpenLobbies.run(
      { wallet: wallet.toLowerCase(), search_query: searchQuery, count: Number(count || 10), page: Number(page || 0) },
      dbConn,
    );
    reply.send({ lobbies });
  });

  server.get("/api/user_lobbies", async (request, reply) => {
    const { wallet, count, page } = request.query as { wallet: string; count: string; page: string };
    const lobbies = await getAllPaginatedUserLobbies.run(
      { wallet: wallet.toLowerCase(), count: Number(count || 10), page: Number(page || 0) },
      dbConn,
    );
    reply.send({ lobbies });
  });

  server.get("/api/user_stats", async (request, reply) => {
    const { wallet } = request.query as { wallet: string };
    const [stats] = await getUserStats.run({ wallet: wallet.toLowerCase() }, dbConn);
    if (!stats) return reply.send({ stats: null });
    const [ratingPosition] = await getUserRatingPosition.run({ rating: stats.rating }, dbConn);
    reply.send({ stats, rank: ratingPosition?.rank ?? undefined });
  });

  server.get("/api/match_winner", async (request, reply) => {
    const { lobbyID } = request.query as { lobbyID: string };
    const [finalState] = await getFinalState.run({ lobby_id: lobbyID }, dbConn);
    reply.send({ result: finalState ?? null });
  });

  server.get("/api/round_status", async (request, reply) => {
    const { lobbyID, round } = request.query as { lobbyID: string; round: string };
    const [roundData] = await getRoundData.run({ lobby_id: lobbyID, round_number: Number(round) }, dbConn);
    const moves = await getRoundMoves.run({ lobby_id: lobbyID, round_number: Number(round) }, dbConn);
    reply.send({ round: roundData, moves });
  });

  server.get("/api/round_executor", async (request, reply) => {
    const { lobbyID, round } = request.query as { lobbyID: string; round: string };
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    const [roundData] = await getRoundData.run({ lobby_id: lobbyID, round_number: Number(round) }, dbConn);
    const moves = await getRoundMoves.run({ lobby_id: lobbyID, round_number: Number(round) }, dbConn);
    reply.send({ lobby, round: roundData, moves });
  });

  server.get("/api/match_executor", async (request, reply) => {
    const { lobbyID } = request.query as { lobbyID: string };
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    const rounds = await getLobbyRounds.run({ lobby_id: lobbyID }, dbConn);
    const moves = await getMovesByLobby.run({ lobby_id: lobbyID }, dbConn);
    const seeds = await getMatchSeeds.run({ lobby_id: lobbyID }, dbConn);
    reply.send({ lobby, rounds, moves, seeds });
  });

  server.get("/api/random_lobby", async (_request, reply) => {
    const [lobby] = await getRandomLobby.run(undefined, dbConn);
    reply.send({ lobby: lobby ?? null });
  });

  server.get("/api/random_active_lobby", async (_request, reply) => {
    const [lobby] = await getRandomActiveLobby.run(undefined, dbConn);
    reply.send({ lobby: lobby ?? null });
  });
};
```

---

## Step 8: Node — Entry Points

### 8.1 Create `packages/node/main.dev.ts`

```ts
import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import { toSyncProtocolWithNetwork, withEffectstreamStaticConfig } from "@effectstream/config";
import { config } from "./config.dev.ts";
import { grammar } from "./grammar.ts";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { migrationTable } from "@chess-v2/database";

main(function* () {
  yield* init();
  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "chess-v2",
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

### 8.2 Create `packages/node/main.mainnet.ts`

```ts
import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import { toSyncProtocolWithNetwork, withEffectstreamStaticConfig } from "@effectstream/config";
import { config } from "./config.mainnet.ts";
import { grammar } from "./grammar.ts";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { migrationTable } from "@chess-v2/database";

main(function* () {
  yield* init();
  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "chess-v2",
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

### 8.3 Create `packages/node/config.mainnet.ts`

```ts
import { contractAddressesEvmMain } from "@chess-v2/contracts-evm";
import { PrimitiveTypeEVMEffectstreamL2 } from "@effectstream/sm/builtin";
import { ConfigBuilder, ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import { grammar } from "./grammar.ts";

const EVM_RPC_URL = process.env.EVM_RPC_URL;
if (!EVM_RPC_URL) throw new Error("EVM_RPC_URL is required for mainnet");
const EVM_START_BLOCK = Number(process.env.EVM_START_BLOCK ?? "0");

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("chess-v2"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({ name: "ntp", type: ConfigNetworkType.NTP, startTime: new Date().getTime(), blockTimeMS: 1000 })
      .addNetwork({ name: "evmMain", type: ConfigNetworkType.EVM, chainId: Number(process.env.EVM_CHAIN_ID ?? "1"), rpcUrl: EVM_RPC_URL })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain((networks) => networks.ntp, () => ({
        name: "mainNtp", type: ConfigSyncProtocolType.NTP_MAIN, chainUri: "", startBlockHeight: 1, pollingInterval: 1000,
      }))
      .addParallel((networks) => networks.evmMain, (network) => ({
        name: "mainEvmRPC", type: ConfigSyncProtocolType.EVM_RPC_PARALLEL, chainUri: EVM_RPC_URL,
        startBlockHeight: EVM_START_BLOCK, pollingInterval: 2000, confirmationDepth: 12, stepSize: 100,
      }))
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => syncProtocols.mainEvmRPC,
      () => ({
        name: "Chess_EffectstreamL2", type: PrimitiveTypeEVMEffectstreamL2, startBlockHeight: EVM_START_BLOCK,
        contractAddress: process.env.EFFECTSTREAM_L2_ADDRESS as `0x${string}`,
        paimaL2Grammar: grammar,
      }),
    )
  )
  .build();
```

---

## Step 9: Batcher (`packages/batcher/`)

### 9.1 Create `packages/batcher/package.json`

```json
{
  "name": "@chess-v2/batcher",
  "version": "1.0.0",
  "exports": "./main.dev.ts",
  "dependencies": {
    "@effectstream/batcher-sdk": "0.100.12",
    "effection": "^3.5.0"
  }
}
```

### 9.2 Create `packages/batcher/config.dev.ts`

```ts
import { contractAddressesEvmMain } from "@chess-v2/contracts-evm";
import { FileStorage, type BatcherConfig, EffectstreamL2DefaultAdapter } from "@effectstream/batcher-sdk";

const batchIntervalMs = 1000;

const effectstreamL2 = new EffectstreamL2DefaultAdapter(
  contractAddressesEvmMain().chain31337["EffectstreamL2Module#MyEffectstreamL2"],
  process.env.EVM_PRIVATE_KEY ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  0n,
  "mainEvmRPC",
);

export const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { effectstreamL2 },
  defaultTarget: "effectstreamL2",
  namespace: "",
  batchingCriteria: {
    effectstreamL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port: Number(process.env.BATCHER_PORT ?? "3334"),
};

export const storage = new FileStorage("./batcher-data");
```

### 9.3 Create `packages/batcher/main.dev.ts`

```ts
import { main, suspend } from "effection";
import { createNewBatcher } from "@effectstream/batcher-sdk";
import { config, storage } from "./config.dev.ts";

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

### 9.4 Create mainnet variants

- `packages/batcher/config.mainnet.ts` — same structure with env var validation
- `packages/batcher/main.mainnet.ts` — imports mainnet config

---

## Step 10: Frontend (`packages/frontend/`)

### 10.1 Replace Oak server with Fastify

Create `packages/frontend/server/main.ts`:

```ts
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";

const server = Fastify();
server.register(fastifyStatic, { root: path.join(import.meta.dirname!, "../client/dist") });
server.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
await server.listen({ port: 10599, host: "0.0.0.0" });
console.log("Frontend server listening on http://localhost:10599");
```

### 10.2 Update `packages/frontend/package.json`

- Remove `@oak/oak` dependency
- Add `fastify`, `@fastify/static`
- Remove `@ts-rest/core`
- Replace `@paimaexample/*` → `@effectstream/*` at 0.100.12
- Update scripts:
  ```json
  "scripts": {
    "dev": "bunx vite --port 10599",
    "build": "bunx vite build",
    "serve": "bun run server/main.ts"
  }
  ```

### 10.3 Update frontend API client

Replace the `@ts-rest` client (`src/api/endpoints/queries.ts`) with plain `fetch` calls:

```ts
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:9999";

export async function apiGetLobbyState(lobbyID: string) {
  const res = await fetch(`${API_BASE}/api/lobby_state?lobbyID=${lobbyID}`);
  return res.json();
}

export async function apiGetOpenLobbies(wallet: string, count = 10, page = 0) {
  const res = await fetch(`${API_BASE}/api/open_lobbies?wallet=${wallet}&count=${count}&page=${page}`);
  return res.json();
}
// ... etc for all endpoints
```

### 10.4 Update `PaimaEngineConfig.ts`

Replace `@paimaexample/wallets` references → `@effectstream/wallets`.

### 10.5 Remove `@chess/api-contract` usage

- Delete all imports from `@chess/api-contract`
- Replace `initClient` pattern with direct fetch calls

---

## Step 11: Tests (`packages/tests/`)

### 11.1 Create `packages/tests/package.json`

```json
{
  "name": "@chess-v2/tests",
  "version": "1.0.0",
  "dependencies": {
    "pg": "^8.14.0",
    "viem": "2.37.3"
  }
}
```

### 11.2 Create `packages/tests/helpers.ts`

Standard `assert` / `assertSQL` / `printSummary` / `anyError` helpers (copy from README template).

### 11.3 Create `packages/tests/launcher.cli.ts`

```ts
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@chess-v2/contracts-evm", { resolveFrom: import.meta.dirname! }),
    {
      name: "sync",
      description: "Chess sync node (test)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
    },
    {
      name: "batcher",
      description: "Batcher (test)",
      args: ["run", "packages/batcher/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [EvmNames.GENERATE_MOD],
    },
  ],
} satisfies OrchestratorConfig;
```

### 11.4 Create Phase A tests (`packages/tests/infra/`)

- `chain-ready.test.ts` — EVM responds on 8545, chain ID 31337
- `deploy.test.ts` — Contract addresses are valid `0x...` strings

### 11.5 Create Phase B tests (`packages/tests/stm/`)

- `create-lobby.test.ts` — Submit `createdLobby` tx, verify lobby in DB
- `join-lobby.test.ts` — Submit `joinLobby`, verify lobby becomes active + round created
- `submit-moves.test.ts` — Submit valid chess move, verify board state updates
- `api.test.ts` — Query all API endpoints, verify responses

### 11.6 Create Phase C tests (`packages/tests/frontend/`)

- `build-smoke.test.ts` — `bunx vite build` exits 0
- `render.test.ts` — Playwright opens localhost:10599, React mounts

### 11.7 Create `packages/tests/run-tests.ts`

Standard orchestrator-based test runner (see README for the pattern).

---

## Step 12: Verify

### 12.1 `bun install`

Run from `chess-v2/` root.

### 12.2 `bun run dev`

**VERIFY**: Full stack boots — PGLite, Hardhat, contracts deploy, sync node starts, batcher starts, frontend builds and serves.

### 12.3 `bun run test`

**VERIFY**: All phases pass.

---

## Deleted Packages (do NOT migrate)

| Old package | Reason |
|-------------|--------|
| `packages/shared/game-logic/` | Round executor/tick abstraction eliminated; pure logic moved to `packages/node/chess-helpers.ts` |
| `packages/shared/data-types/` | Grammar → `packages/node/grammar.ts`, config → `packages/node/config.dev.ts`, types → deleted (Typebox response schemas were only for @ts-rest) |
| `packages/shared/utils/` | `updateTimer`, `currentPlayer` moved to `chess-helpers.ts` |
| `packages/shared/api/` | @ts-rest contract deleted — replaced by plain Fastify routes |
| `packages/client/` directory | Flattened into `packages/` |
| `packages/shared/` directory | Flattened/merged into `packages/node/` and `packages/contracts-evm/` |

---

## Key Architectural Decisions

1. **No `SQLUpdate[]` tuples** — All DB writes use `yield* World.resolve(query, params)` inline.

2. **No round executor / match executor / tick.ts** — Chess move application is a single `applyMove()` call. The round executor indirection added no value for chess (1 move per round = 1 tick per round).

3. **No `@ts-rest`** — The typed contract added complexity (3 packages: contract definition, server router, frontend client) for something that plain Fastify routes + fetch achieve directly.

4. **No `getConnection()` in state machine** — The old code called `getConnection()` to get a pool for DB reads inside transitions. The new code uses `World.resolve` for all DB access.

5. **AI/bot logic preserved** — `chess-ai.ts` is pure computation with no SDK dependencies. Kept as-is.

6. **Elo rating preserved** — `calculateRatingChange` moved to `chess-helpers.ts`, same K-factor=32.

7. **Scheduled data preserved** — Zombie rounds (`z`), stats updates (`u`), and bot moves (`sb`) all use `newScheduledHeightData` from `@effectstream/db` (same underlying mechanism, just called inline instead of building tuples).

8. **pgtyped queries are the ONLY database access** — No raw SQL anywhere. All queries come from `@chess-v2/database` which re-exports the pgtyped-generated `.queries.ts` files.

---

## Execution Order & Verification Gates

```
Step 0: Scaffold         → VERIFY: bun install succeeds
Step 1: Orchestrator     → (no standalone verification — needs contracts)
Step 2: Contracts        → VERIFY: bun run build:evm succeeds
Step 3: Database         → VERIFY: bun run build:pgtypes succeeds
Step 4: Grammar          → (no standalone verification)
Step 5: Config           → (no standalone verification)
Step 6: State Machine    → (no standalone verification — needs full stack)
Step 7: API Routes       → (no standalone verification)
Step 8: Entry Points     → (no standalone verification)
Step 9: Batcher          → (no standalone verification)
Step 10: Frontend        → (no standalone verification)
Step 11: Tests           → VERIFY: test structure exists
Step 12: Full Verify     → VERIFY: bun run dev + bun run test
```

Do not proceed past a step that fails its verification gate.

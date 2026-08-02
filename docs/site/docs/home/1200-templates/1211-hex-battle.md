---
title: "Hex Battle"
description: "A turn-based hex-grid tactics game whose rules live in one standalone package, imported unchanged by both the sync node and the browser client."
sidebar_label: "Hex Battle"
sidebar_position: 2
---

<!-- Generated from templates/hex-battle/README.md by docs/site/scripts/sync-template-readmes.ts. Do not edit directly. -->

> Template: **[`templates/hex-battle`](https://github.com/effectstream/effectstream/tree/main/templates/hex-battle)**

Hex Battle is a multiplayer strategy game on a cube-coordinate hex board. Two to five players create or join a lobby, take turns spending gold to place units and buildings, move units to capture neutral and enemy tiles, and the last player standing wins. Every turn is an input read off an EVM `EffectstreamL2` contract and resolved deterministically by the sync node; a player who stops responding is skipped by a scheduled timeout so a match can never stall.

The template exists to show one thing: how to share a game engine between the deterministic server and the interactive client without duplicating it. The board, the units, the movement and combat rules, the serialization format and the AI opponent all live in `packages/engine`, a dependency-free TypeScript package that the node and the frontend both import. It is also a worked example of porting a Paima v1 game — see [`MIGRATION.md`](https://github.com/effectstream/effectstream/blob/main/templates/hex-battle/MIGRATION.md) for the record of that migration.

## What this template shows

**One rules package, two consumers.** `packages/engine` has no dependencies at all — its `package.json` declares none, and its modules import only each other. That is what makes it safe to load on both sides. `packages/engine/src/index.ts` says so explicitly (the `packages/node/engine` it names is where the code used to live, before the split):

<!-- allow-missing: packages/node/engine -->

```ts
// Promoted out of the sync node (`packages/node/engine`) into a shared workspace
// package so BOTH the sync node (deterministic on-chain state transitions) and
// the frontend (canvas game + offline practice/AI mode) consume the exact same
// engine.
```

On the node side, `packages/node/game-helpers.ts` imports the deterministic surface and nothing else:

```ts
import {
  Tile, GameMap, Player, Game, CreateGame, Moves,
  type UnitType, type BuildingType,
} from "@hex-battle/engine";
```

On the client side, `packages/frontend/src/frontend/game/game_screen.ts` imports `Tile, Game, Moves, Unit, Building, Hex` from the same package, and `packages/frontend/src/random-game.ts` additionally pulls in `AIPlayer` — the one class the node deliberately never touches, because an AI player has no wallet and never appears in on-chain state.

**The wire format is the engine's own, so it round-trips.** When a player ends a turn, `game_screen.ts` calls `this.game.moves[this.game.turn].serializePaima()` and posts the result. The node parses that same string with `parseMove()` in `packages/node/game-helpers.ts` and feeds it back through `Moves.deserializePaima()` — the engine's own deserializer, in `packages/engine/src/moves.ts`. Client and server cannot disagree about what `"A0#0"` or `"0#0#1#-1"` means, because only one file defines it.

**Determinism is preserved by what the engine deliberately does not do.** `Game.import()` in `packages/engine/src/game.ts` always rehydrates a plain `Player`, never an `AIPlayer`:

```ts
const players: Player[] = gameData.players.map((p: Player) => {
  // The on-chain (deterministic) engine has no AI players — every player is
  // a human wallet, so we always rehydrate a human Player.
  const player = new Player(p.id, p.gold, p.wallet);
```

Board and player setup in `packages/engine/src/create-game.ts` takes a `RandomGenerator` interface (`nextInt(min, max)`) as a parameter rather than calling `Math.random()`, so the node passes the block-seeded `randomGenerator` while the frontend's `RandomGame` passes a `Math.random()`-backed shim for offline play. Same code path, different entropy source, and the on-chain path stays replayable.

**The client uses the engine before there is any game.** `cmd_create` in `packages/frontend/src/frontend/lobby_screen.ts` builds a throwaway `RandomGame` purely to generate a connected hex map, then submits its tile coordinates as the `map` field of `createLobby`. The map generator therefore runs in the browser, but the map itself is on-chain input — the node only has to validate the coordinate list, not reproduce the generator.

**Practice mode is the same game with local players.** `cmd_practice` in the same file constructs a `RandomGame` with one human and N `AIPlayer`s and hands it to the ordinary `GameScreen`. No backend, no wallet, no transactions — but the identical rules, because it is the identical engine.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `@effectstream/sm` state machine (`Stm`) | `packages/node/state-machine.ts` | Five transitions: lobby creation, join, moves, surrender and timeout |
| Typed grammar (`@effectstream/concise` + TypeBox) | `packages/node/grammar.ts` | Validating the scalar fields of all five on-chain commands |
| `PrimitiveTypeEVMEffectstreamL2` | `packages/node/config.dev.ts` | Reading player inputs out of the deployed L2 contract |
| NTP main sync protocol (`ConfigSyncProtocolType.NTP_MAIN`) | `packages/node/config.dev.ts` | One-second wall-clock blocks — the unit turn timeouts count in |
| Parallel EVM sync (`ConfigSyncProtocolType.EVM_RPC_PARALLEL`) | `packages/node/config.dev.ts` | Attaching the EVM chain alongside the time-based main chain |
| Scheduled inputs (`createScheduledData`) | `packages/node/state-machine.ts` | The `zombieScheduledData` turn timeout that skips an absent player |
| Deterministic randomness (`randomGenerator`) | `packages/node/state-machine.ts` | 12-character lobby IDs, player order and starting-tile assignment |
| World effect system (`@effectstream/coroutine`) | `packages/node/state-machine.ts` | `yield* World.resolve(...)` around every database read and write |
| Migrations + pgtyped queries (`@effectstream/db`) | `packages/database/` | Typed SQL over lobbies, players, rounds and the leaderboard |
| Custom API router (`StartConfigApiRouter`) | `packages/node/api.ts` | Ten Fastify read endpoints backing the client |
| Wallet connection (`@effectstream/wallets`) | `packages/frontend/src/wallet/wallet_store.ts` | Injected wallets plus a generated, faucet-funded browser wallet |
| Self-sequenced writes (`sendTransaction`) | `packages/frontend/src/paima/middleware.ts` | Posting inputs straight to the L2 contract — this template has no batcher |
| `EffectstreamL2Contract` | `packages/contracts-evm/src/contracts/MyEffectstreamL2.sol` | The on-chain mailbox every game input passes through |
| Orchestrator (`@effectstream/orchestrator`) | `start.dev.ts` | Bringing up PGlite, Hardhat, contract deployment, the sync node and the frontend |

## Quick start

Prerequisites:

- [Bun](https://bun.sh)
- [Foundry](https://www.getfoundry.sh/) — `forge` must be on your `PATH`, because the contract build in `packages/contracts-evm` runs `forge build` before Hardhat compiles and Ignition deploys.

No Docker or external Postgres is needed: the local stack runs an embedded PGlite database.

```sh
bun install
bun run dev
```

`bun run dev` runs `bunx orchestrator start`, which reads `start.dev.ts` (declared as `effectstream.default` in `package.json`) and brings the stack up in dependency order: PGlite, a Hardhat node, contract compilation and deployment, then the sync node, the frontend bundle and the frontend server.

| Service | URL |
| --- | --- |
| Frontend (the game) | http://localhost:10599 |
| Sync node API | http://localhost:9999 |
| Hardhat EVM node | http://localhost:8545 |
| PGlite (Postgres wire protocol) | `localhost:5432` |
| Orchestrator API | http://localhost:4747 |

A local two-player match is two browser tabs: wallet identity is kept in per-tab `sessionStorage` by `packages/frontend/src/wallet/wallet_store.ts`, so each tab connects its own wallet and the second tab joins through the `/?lobby=<id>` link.

Other root scripts:

```sh
bun run build:evm       # compile the contracts and regenerate the TypeScript bindings
bun run build:pgtypes   # regenerate pgtyped types from packages/database/src/sql/
bun run check           # typecheck the node package
bun run test            # full orchestrated test suite
bun run test:practice   # offline practice-AI smoke test (no backend, no browser)
bun run test:launch     # frontend launch check only
```

## Project structure

```
hex-battle/
├── start.dev.ts           orchestrator process graph for the local stack
├── MIGRATION.md           record of the port from paima-engine-v1
└── packages/
    ├── engine/            @hex-battle/engine — dependency-free hex rules, shared by node and frontend
    ├── node/              @hex-battle/node — config, grammar, state machine, API, engine wrappers
    ├── database/          @hex-battle/database — migration and pgtyped queries
    ├── contracts-evm/     @hex-battle/contracts-evm — MyEffectstreamL2.sol, Hardhat/Forge, Ignition
    ├── frontend/          @hex-battle/frontend — canvas game, wallet UI, Fastify static server
    └── tests/             @hex-battle/tests — orchestrated infra / STM / API / frontend suite
```

Inside `packages/engine/src/`:

| File | Purpose |
| --- | --- |
| `hex.ts`, `tile.ts`, `map.ts` | Cube (q/r/s) coordinates, tiles and the board, including `GameMap.RingMap` |
| `unit.ts`, `building.ts` | Unit and building types, costs and strengths |
| `player.ts` | A player: id, gold, wallet, alive flag |
| `game.ts` | Turn order, movement, capture, `endTurn`, and `Game.export` / `Game.import` |
| `create-game.ts` | Seeded new-game setup: player order and starting tile assignment |
| `moves.ts` | Actions plus `serializePaima()` / `deserializePaima()` — the shared wire format |
| `player.ai.ts` | `AIPlayer`, the client-only minimax/heuristic opponent |
| `name.ts` | Wallet-seeded display names |

Inside `packages/node/`:

| File | Purpose |
| --- | --- |
| `grammar.ts` | The five input commands and their TypeBox field types |
| `config.dev.ts` | Local networks, sync protocols and the L2 primitive |
| `state-machine.ts` | All five state transitions plus the zombie scheduling helper |
| `game-helpers.ts` | Field validators, the move mini-language parser, and the engine wrappers |
| `api.ts` | The Fastify read API |
| `main.dev.ts` | Entry point that calls `start(...)` from `@effectstream/runtime` |

## How it works

### Grammar

`packages/node/grammar.ts` defines five commands. TypeBox constrains the scalars; the composite fields stay strings because they carry mini-languages TypeBox cannot express.

| Command | Fields | Purpose |
| --- | --- | --- |
| `createLobby` | `numOfPlayers`, `units`, `buildings`, `gold`, `initTiles`, `map`, `timeLimit`, `roundLimit` | Open a lobby with a board and starting resources |
| `joinLobby` | `lobbyID` | Join by 12-character lobby ID |
| `submitMoves` | `lobbyID`, `roundNumber`, `move` | Submit one round's actions |
| `surrender` | `lobbyID` | Resign the match |
| `zombieScheduledData` | `lobbyID`, `roundNumber`, `count?` | Engine-scheduled timeout that skips a stalled turn |

```ts
submitMoves: [
  ["lobbyID", LobbyID],
  ["roundNumber", Type.Number({ minimum: 0, maximum: 9999 })],
  ["move", Type.String()],
],
```

The `move` string is the comma-joined action list the engine produces: `"A0#0"` places unit `A` at cube coordinate `(0, 0)`, `"0#0#1#-1"` moves a unit from one tile to another, `"surrender"` resigns. `parseMove()` in `packages/node/game-helpers.ts` turns it into the JSON action array `Moves.deserializePaima()` expects, and returns `null` — rejecting the whole submission — on any malformed token.

### State machine

`packages/node/state-machine.ts` registers the five transitions on one `Stm`. Each guards first, then writes.

`createLobby` runs the validators that the grammar cannot, and abandons the input if any fails:

```ts
if (!validateUnits(parsedInput.units)) return;
if (!validateBuildings(parsedInput.buildings)) return;
const coords = parseMap(parsedInput.map);
if (!coords) return;

const lobby_id = randomGenerator.nextString(12);
```

`joinLobby` adds the player and, when the last seat fills, builds the game through the shared engine and arms the first timeout:

```ts
if (players.length + 1 === lobby.num_of_players) {
  const wallets = [...players.map((p: any) => p.player_wallet), user];
  const game = startGame(/* … */ randomGenerator as any);

  yield* World.resolve(updateLobbyGameState, {
    lobby_id: lobbyID,
    game_state: Game.export(game),
    current_round: 0,
  });
  // …
  yield* scheduleZombie(lobbyID, 0, 0, blockHeight);
}
```

`submitMoves` re-reads the lobby, checks membership and the round number, applies the move through the engine, and rejects the submission as a whole if any action is illegal:

```ts
const game = applyMove(state.game_state, user, moveActions, parsedInput.roundNumber);
if (!game) return; // illegal move — rejected as a whole
```

On a winner it closes the lobby and updates win/loss rows; otherwise it schedules the next timeout.

The timeout itself is an ordinary scheduled input:

```ts
yield* createScheduledData(
  JSON.stringify(["zombieScheduledData", lobbyId, turn, count]),
  { blockHeight: blockHeight + ZOMBIE_TIMEOUT_BLOCKS },
  PRECOMPILE_SOURCE,
);
```

`ZOMBIE_TIMEOUT_BLOCKS` is 120 blocks, which at the NTP block time of 1000 ms is about two minutes. Nothing cancels a pending zombie: when it fires, the transition compares `lobby.current_round` against the round it was scheduled for and discards itself if the player has since moved. After `MAX_ZOMBIE_SKIPS` consecutive skips the game ends in a draw.

### Contracts

`packages/contracts-evm/src/contracts/MyEffectstreamL2.sol` is the whole on-chain surface:

```solidity
contract MyEffectstreamL2 is EffectstreamL2Contract {
    constructor(address _owner, uint256 _fee) EffectstreamL2Contract(_owner, _fee) {}
}
```

`packages/contracts-evm/deploy.ts` deploys it with Ignition and notes why nothing else is needed: Hex Battle keys off the wallet that submits the input, so there is no per-player NFT or token. `packages/node/config.dev.ts` then points the primitive at the deployed address and hands it the grammar:

```ts
.addPrimitive(
  (syncProtocols) => syncProtocols.mainEvmRPC,
  (network, deployments, syncProtocol) => ({
    name: "HexBattle_EffectstreamL2",
    type: PrimitiveTypeEVMEffectstreamL2,
    startBlockHeight: 0,
    contractAddress:
      contractAddressesEvmMain().chain31337["EffectstreamL2Module#MyEffectstreamL2"],
    paimaL2Grammar: grammar,
  }),
)
```

### API

`packages/node/api.ts` registers ten read-only Fastify routes.

| Route | Returns |
| --- | --- |
| `GET /lobby/:lobbyId` | The lobby with its players, rounds and parsed `gameState` |
| `GET /lobby/:lobbyId/players` | The lobby's player rows |
| `GET /lobby/:lobbyId/map` | The serialized q/r/s coordinate list |
| `GET /lobby/:lobbyId/state` | Lobby state and current round (used to detect game over) |
| `GET /lobby/:lobbyId/move/:round` | The round rows for one round — how a client mirrors the opponent's turn |
| `GET /lobby/latest/:wallet` | The wallet's most recent open lobby |
| `GET /lobbies/open` | Lobbies anyone can join |
| `GET /lobbies/my/:wallet` | Open lobbies this wallet created |
| `GET /player/:wallet` | Leaderboard stats for one wallet |
| `GET /leaderboard` | Top players by wins, paged |

`packages/frontend/src/paima/middleware.ts` is the only place the client talks to either side: writes go through `sendTransaction(wallet, [<grammarKey>, ...args], config, "wait-receipt")` and reads go through plain `fetch` against those routes. Because the server assigns the lobby ID, `createLobby` submits the transaction and then polls `/lobby/latest/:wallet` until the sync node has indexed it.

The read loop in `packages/frontend/src/frontend/game/game_screen.ts` is where the shared engine pays off again: it fetches the opponent's round row and replays it locally with `Moves.deserializePaima(this.game, res.data)`, applying the same actions the node applied, against the same rules.

### Database

`packages/database/src/migrations/database.sql` defines four tables — `lobby`, `lobby_player`, `round` and `player` — alongside the engine-owned `block_heights`. The board itself is not normalized:

```sql
-- The whole hex-grid game state (tiles with q/r/s cube coords, owners, units,
-- buildings, player gold, turn, winner) is serialized into `lobby.game_state`
-- as JSON by the engine's Game.export(); the engine deserializes it again with
-- Game.import() on each move. The columns below are the indexable metadata.
```

That is the direct consequence of sharing the engine: the authoritative representation of a game is whatever `Game.export()` produces, so the database stores it verbatim and keeps columns only for the things that need indexing — lobby state, round number, creator, winner and per-player win/loss/draw counts. Queries live in `packages/database/src/sql/` and are typed with pgtyped; `bun run build:pgtypes` regenerates them.

## Configuration

The template targets the local stack out of the box and reads only a handful of environment variables:

| Variable | Read by | Effect |
| --- | --- | --- |
| `PGLITE` | `start.dev.ts`, `packages/tests/start.test.ts` | Runs the sync node against the embedded PGlite database |
| `NODE_ENV` | root `dev` script | Set to `development` before starting the orchestrator |
| `EFFECTSTREAM_API_PORT` | `packages/tests/run-tests.ts` | Sync node API port the tests poll (default `9999`) |
| `DB_PORT` | `packages/tests/run-tests.ts` | Postgres port the tests connect to (default `5432`) |
| `ENABLE_DEV_AND_DEBUG_ENDPOINTS` | `packages/tests/start.test.ts` | Enables debug endpoints on the sync node during tests |
| `CHROME_PATH` | `packages/tests/frontend/render.test.ts` and the other browser tests | Path to a Chrome/Chromium binary for the headless tests |

Networks are declared in `packages/node/config.dev.ts`: an NTP main chain at `blockTimeMS: 1000`, and the viem `hardhat` chain (id 31337) as a parallel EVM sync protocol. There is no `config.mainnet.ts` in this template. Pointing it at a real network means replacing the viem chain and RPC URL in `packages/node/config.dev.ts`, supplying the deployed contract address instead of `contractAddressesEvmMain().chain31337[...]`, and updating the two hardcoded values on the client — the `EffectstreamConfig` contract address and `API_BASE` in `packages/frontend/src/paima/middleware.ts`. The dev faucet in `packages/frontend/src/wallet/faucet.ts` no-ops off Hardhat by design, so generated browser wallets would need funding out of band.

## Testing

```sh
bun run test            # full suite: orchestrator up, four phases, orchestrator down
bun run test:practice   # offline practice AI only — no backend, no browser
bun run test:launch     # frontend launch check only
```

`packages/tests/run-tests.ts` starts its own orchestrator from `packages/tests/start.test.ts`, waits on the HTTP control API, then runs three phases and shuts everything down:

- **Phase A — infrastructure.** Waits for contract deployment, checks that the EVM chain answers `eth_chainId` with 31337, and asserts the deployed `EffectstreamL2` address is well-formed. Then waits for the sync node's `/health`.
- **Phase B — state machine, database and API.** `packages/tests/stm/actions.test.ts` submits real transactions from Hardhat accounts #0 and #1 through the L2 contract and asserts the resulting rows: a lobby is created, a second player joins and the match goes active, moves are recorded, and a surrender closes the lobby. `packages/tests/stm/api.test.ts` then asserts the read routes against that lobby — including that the parsed `gameState` carries the expected 37-tile board.
- **Phase C — frontend.** Asserts the esbuild bundle is produced, that the page renders in headless Chromium, that interactions work, and finally `packages/tests/frontend/e2e.test.ts` drives the local-JS EVM wallet through connect → render → a real `createLobby` write.

`packages/frontend/practice-ai.test.ts` runs standalone and needs nothing else: it builds a five-AI practice game and takes one full AI turn, guarding the regression where `Game.import()` rehydrating an `AIPlayer` as a plain `Player` crashed the practice bot.

## Where to go next

- [State machine](https://effectstream.github.io/docs/home/components/state-machine) — how transitions, guards and the `World` effect system fit together.
- [Grammar](https://effectstream.github.io/docs/home/components/grammar) — designing the on-chain input format your template validates.
- [Randomness](https://effectstream.github.io/docs/home/components/randomness) — why `randomGenerator` is threaded through `CreateGame` instead of `Math.random()`.
- [API](https://effectstream.github.io/docs/home/components/api) — adding read endpoints like the ten in `packages/node/api.ts`.
- [Chess](https://effectstream.github.io/docs/home/templates/chess) — the sibling turn-based game, which schedules *and cancels* its timeouts and adds a batcher.

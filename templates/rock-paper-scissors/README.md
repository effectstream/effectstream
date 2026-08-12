# Rock Paper Scissors Wars

> A best-of-N Rock Paper Scissors game where both players commit moves for the same round and the node resolves them deterministically, with timeout forfeits.

Two players meet in a lobby and play a fixed number of rounds. Each round both of them
submit a move independently — neither submission reveals anything to the other, because the
round is only resolved once the *second* move lands in the same block stream. If a player
walks away, a scheduled "zombie" input closes the round out and hands the win to whoever
did play. All of that lives in the state machine; the browser never decides anything.

This is the template to read if you are building any game with **simultaneous, independent
turns** — card battles, tactics games, betting rounds — where the interesting problem is
not the rules themselves but *when* it is safe to evaluate them. It is also a compact
example of a Paima Effectstream node: a TypeBox grammar, a `PaimaSTM` with six transitions,
pgtyped SQL, a Fastify API and a Phaser frontend, all in one Bun workspace.

![The Rock Paper Scissors lobby screen](./docs/lobby.png)

## What this template shows

**Simultaneous hidden moves, resolved by arrival order.** A move is not a state transition
that resolves a round — it is an insert into `match_moves`. Only when
`submittedMoves` sees that its own move is the second one for that round does it resolve
anything, in the same transition, atomically
(`packages/client/node/src/state-machine/v1/transition.ts`):

```ts
const allMoves = [...cachedMoves, { wallet: player, move_rps: input.move_rps }];
if (allMoves.length === 2) {
  const roundExecutionUpdates = executeRound(blockHeight, lobby, allMoves, round, randomnessGenerator);
  return [moveUpdate, ...roundExecutionUpdates];
}
return [moveUpdate];
```

There is no commit-reveal ceremony and no second round-trip. The first player's move is
already in the database, but the second player has no way to read it and then change their
own — by the time the row is visible, the round that used it has already been executed by
the same transition that made it visible.

**Zombie rounds turn absence into a move.** The engine has a fourth action beyond rock,
paper and scissors: `DID_NOT_PLAY` (`-`). `zombieRound` reruns exactly the same
`executeRound` path with whatever moves exist, and `RockPaperScissors.endRound()` converts
every still-`PENDING` slot to `-`. Because `match()` treats `-` as losing to anything and
tying with itself, a timeout needs no special-case scoring rules at all — it is the ordinary
round resolution applied to an incomplete round.

**One engine, one source of truth for the rules.**
`packages/shared/game-logic/src/rock-paper-scissor.ts` is a plain TypeScript class with no
database, no framework and no I/O: you hand it a state string, call `inputMove` /
`endRound`, and ask it `roundWinner`, `didGameEnd`, `endGameResults`. The node imports it
through the `@rock-paper-scissors/game-logic` workspace package, and the frontend bundles
the *same* source file — `packages/frontend/esbuild.js` aliases the package name straight at
it:

```js
alias: {
  '@rock-paper-scissors/game-logic': '../shared/game-logic/src/mod.ts',
},
```

so the browser's move enums, its `TickEvent` shape and its round-replay logic
(`packages/shared/game-logic/src/tick.ts`) cannot drift away from the rules the node
enforces. The package also carries `genrateRandomMove(random)`, the deterministic move
generator intended for the practice/AI opponent, in the same file as the rules it plays by.

**The whole match is one string.** `latest_match_state` is not JSON — it is two characters
per round, player one then player two, drawn from `{R, P, S, -, *}`:

```
 Round   1   2   3   4
 Player  1 2 1 2 1 2 1 2
 Example R S - S - - * *
 Winner   P1  P2   T   pending
```

`buildInitialState(rounds)` just fills an array of `2 * rounds` `PENDING` characters, a move
is a single character assignment, and the entire scoreboard is recomputed from the string in
`updateInternalState()`. That is why the early-finish rule is cheap: `gameRounds = rounds -
ties`, and a player has clinched once their wins exceed `Math.floor(gameRounds / 2)`.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `PaimaSTM` state machine (`@paimaexample/sm`) | `packages/client/node/src/state-machine.ts` | Six transitions: lobby create/join/close, move submission, zombie timeout, stats |
| Coroutine effects (`@paimaexample/coroutine`) | `packages/client/node/src/state-machine.ts` | `World.resolve` to read/write state, `World.promise` to call the async transition helpers |
| TypeBox grammar (`@paimaexample/concise`) | `packages/shared/data-types/src/grammar.ts` | Typed, bounded on-chain input encoding (`GrammarDefinition`) |
| `ConfigBuilder` + `PrimitiveTypeEVMPaimaL2` (`@paimaexample/config`, `@paimaexample/sm/builtin`) | `packages/shared/data-types/src/localhostConfig.ts` | NTP main sync protocol + parallel EVM RPC sync reading the L2 contract |
| Deterministic randomness (`@paimaexample/crypto` `Prando`) | `packages/client/node/src/state-machine/v1/transition.ts` | `randomnessGenerator.nextString(12)` generates lobby IDs identically on every node |
| Migrations + pgtyped (`@paimaexample/db`) | `packages/client/database/` | `database.sql` schema, typed prepared queries in `src/sql/*.queries.ts` |
| Fastify API router (`StartConfigApiRouter` from `@paimaexample/runtime`) | `packages/client/node/src/api.ts` | Read-only REST over lobbies, rounds, moves and stats |
| Process orchestrator (`@paimaexample/orchestrator`) | `packages/client/node/scripts/start.ts` | Hardhat, PGlite, log collector, TUI, explorer, frontend install/build/serve |
| Effectstream L2 contract (`@paimaexample/evm-contracts`) | `packages/shared/contracts/evm/src/contracts/MyPaimaL2Contract.sol` | Input mailbox; `MyPaimaL2Contract` just extends `PaimaL2Contract` |
| Wallet connect + submit (`@paimaexample/wallets`) | `packages/frontend/paimaMiddleware.src.js` | `walletLogin` and `sendTransaction` with grammar-shaped argument arrays |
| Explorer (`@paimaexample/explorer`) | `packages/client/node/scripts/start.ts` | Block/state explorer on port 10590 |

## Quick start

> [!WARNING]
> This template still depends on the unpublished `@paimaexample/*` packages and **cannot be
> installed as-is**. It is kept as a reference implementation until it is migrated to
> `@effectstream/*`. The walkthrough below still describes how it works.

Prerequisites, beyond [Bun](https://bun.sh):

- **Foundry** — `bun run build:evm` runs `forge build` before the Hardhat compile.
- **Node.js** — the Phaser frontend installs and builds with `npm`/`esbuild`, not Bun.
- **Docker** (optional) — only for the containerised run below.

```sh
# Install workspace dependencies
bun install

# Compile and deploy the EVM contracts (writes build/contractAddressesEvmMain.ts)
bun run build:evm

# Start everything: Hardhat, PGlite, the node, the explorer and the frontend
bun run dev

# Typecheck the node package
bun run check
```

`bun run dev` also installs, builds and serves the frontend for you — those are three of
the custom orchestrator processes in `packages/client/node/scripts/start.ts`.

| Service | URL |
| --- | --- |
| Frontend (Phaser) | http://localhost:8080 |
| Node API | http://localhost:9999 |
| Explorer | http://localhost:10590 |
| Hardhat EVM RPC | http://localhost:8545 |

To run the whole stack in one container:

```sh
# macOS
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t rock-paper-scissors -f Dockerfile .
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run -p 8080:8080 -p 8545:8545 -p 9999:9999 -p 10590:10590 rock-paper-scissors

# Linux
docker build -t rock-paper-scissors -f Dockerfile .
docker run -p 8080:8080 -p 8545:8545 -p 9999:9999 -p 10590:10590 rock-paper-scissors
```

The image sets `EFFECTSTREAM_STDOUT=true`, which makes `packages/client/node/scripts/start.ts` disable tmux, the
TUI and the log collector and write plain logs to stdout.

## Project structure

```
rock-paper-scissors/
├── packages/
│   ├── client/
│   │   ├── database/                        # @rock-paper-scissors/db
│   │   │   ├── src/migrations/database.sql  # Schema: lobbies, rounds, match_moves, stats
│   │   │   ├── src/sql/*.sql                # Hand-written queries
│   │   │   └── src/sql/*.queries.ts         # pgtyped-generated typed clients
│   │   └── node/                            # @rock-paper-scissors/node
│   │       ├── src/main.ts                  # Entry point: init + start(...)
│   │       ├── src/state-machine.ts         # PaimaSTM transition registration
│   │       ├── src/state-machine/v1/
│   │       │   └── transition.ts            # Async transition helpers returning SQLUpdate[]
│   │       ├── src/api.ts                   # Fastify read API
│   │       └── scripts/start.ts             # Orchestrator config for `bun run dev`
│   ├── frontend/                            # @rock-paper-scissors/frontend
│   │   ├── src/scenes/                      # Phaser scenes: Start, Wallet, Lobby, Game
│   │   ├── paimaMiddleware.src.js           # Wallet login + sendTransaction + REST calls
│   │   ├── esbuild.js                       # Bundles middleware and game; aliases game-logic
│   │   └── public/                          # Static assets served on :8080
│   └── shared/
│       ├── contracts/evm/                   # @rock-paper-scissors/evm-contracts
│       │   ├── src/contracts/MyPaimaL2Contract.sol
│       │   ├── ignition/modules/paimaL2.ts  # Deployment module
│       │   └── deploy.ts                    # Ignition deploy driver
│       ├── data-types/                      # @rock-paper-scissors/data-types
│       │   ├── src/grammar.ts               # TypeBox grammar
│       │   └── src/localhostConfig.ts       # Networks, sync protocols, primitives
│       └── game-logic/                      # @rock-paper-scissors/game-logic
│           ├── src/rock-paper-scissor.ts    # The rules engine
│           ├── src/tick.ts                  # Round-executor tick for frontend replay
│           └── src/types.ts                 # RPSActions, GameResult, TickEvent
├── Dockerfile
├── patch.sh                                 # No-op stub, kept for the Docker build
└── package.json                             # Bun workspace root
```

## How it works

### Grammar

`packages/shared/data-types/src/grammar.ts` defines every accepted input. Note that the
bounds are part of the type, so an out-of-range round or a malformed move never reaches a
transition:

```ts
const LobbyID = Type.String({ minLength: 12, maxLength: 12 });
const RPSMove = Type.Union([Type.Literal("R"), Type.Literal("P"), Type.Literal("S")]);

export const grammar = {
  createdLobby: [
    ["numOfRounds", Type.Number({ minimum: 3, maximum: 1000 })],
    ["roundLength", Type.Number({ minimum: 1, maximum: 10000 })],
    ["isHidden", Type.Optional(Type.Boolean())],
    ["isPractice", Type.Optional(Type.Boolean())],
  ],
  joinedLobby: [["lobbyID", LobbyID]],
  closedLobby: [["lobbyID", LobbyID]],
  submittedMoves: [
    ["lobbyID", LobbyID],
    ["roundNumber", Type.Number({ minimum: 1, maximum: 1000 })],
    ["move_rps", RPSMove],
  ],
  zombieScheduledData: [["lobbyID", LobbyID]],
  userScheduledData: [
    ["user", Type.String()],
    ["result", MatchResult],
  ],
} as const satisfies GrammarDefinition;
```

The same grammar object is passed to `start(...)` in `main.ts` *and* attached to the EVM
primitive as `paimaL2Grammar` in `localhostConfig.ts`, so encoding and decoding are defined
once.

### State machine

`packages/client/node/src/state-machine.ts` registers one generator per grammar key on a
`PaimaSTM`. The generators do the I/O — reading state with `World.resolve`, calling an async
helper with `World.promise`, then applying each returned `[query, params]` pair — while the
helpers in `state-machine/v1/transition.ts` stay pure functions of their arguments:

```ts
stm.addStateTransition("joinedLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress: user } = data;

  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  const results = yield* World.promise<SQLUpdate[]>(
    joinedLobby(user!, blockHeight, { input: "joinedLobby", ...parsedInput }, lobbyData)
  );

  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});
```

Every helper returns `[]` when validation fails, which is how invalid inputs are rejected:
the transition simply produces no writes. `appStateTransitions` at the bottom of the file
is the version router — both branches currently call `stm.processInput(input)`, and it is
there as the seam for adding a `v2/` transition set later.

#### `createdLobby`

Derives a 12-character lobby ID from the block's deterministic randomness, builds the
all-pending match state, and inserts the lobby as `open`:

```ts
const lobby_id = randomnessGenerator.nextString(12);
const initialMatchState = RockPaperScissors.buildInitialState(input.numOfRounds);
```

`isHidden` keeps the lobby out of `/open_lobbies`; `isPractice` suppresses the
`final_match_state` row at the end so practice games do not pollute results.

#### `joinedLobby`

Rejects the join if the lobby already has a second player, is not `open`, or if the joiner
is the creator. Otherwise it emits four writes: set `player_two` (the
`updateLobbyPlayerTwo` query also flips `lobby_state` to `'active'` in the same statement),
create round 1, and upsert a `global_user_state` row for each player. Inserting the round is
what sets `lobbies.current_round`, via the `update_current_round` trigger.

#### `closedLobby`

The escape hatch for an unanswered challenge: only the creator, only while the lobby is
still `open` and has no `player_two`, sets `lobby_state = 'closed'`.

#### `submittedMoves`

Validation runs against the engine rather than against ad-hoc conditions —
`validateSubmittedMoves` checks the lobby is `active`, the signer is one of the two players
and the round is the current one, then delegates to `rps.isValidMove(...)`, which enforces
that the game has not ended, that the player has not already moved this round, and that no
earlier round is still pending. Then the move is cached and, if it completes the pair, the
round executes immediately (see the excerpt at the top of this file).

#### `executeRound`

The shared resolution path, called by both `submittedMoves` and `zombieRound`:

```ts
const rps = new RockPaperScissors(lobby.latest_match_state as RPSSummary);
moves.forEach((move) => {
  const isPlayerOne = move.wallet === lobby.lobby_creator;
  rps.inputMove(isPlayerOne, move.move_rps as RPSActions, round.round_within_match);
});
rps.endRound(round.round_within_match);
```

It appends `"1"`, `"2"` or `"T"` to `lobbies.round_winner` (a running per-round summary),
writes back the new match-state string, stamps `rounds.execution_block_height`, and then
either creates the next round or — when `rps.didGameEnd()` — finishes the lobby and writes
`final_match_state` for non-practice games.

#### `zombieScheduledData`

The timeout path. It looks up the lobby's `current_round` and its cached moves, bails out
if the lobby is not `active`, the round is missing, or both moves are already in (meaning
the round resolved on its own), and otherwise calls `executeRound` with the incomplete move
set:

```ts
if (moves.length >= 2) {
  return [];
}
// Mark missing moves as "did not play" and execute the round
return executeRound(blockHeight, lobby, moves, round, randomnessGenerator);
```

`lobbies.round_length` is stored for this purpose, but note that **nothing in this template
currently emits the `zombieScheduledData` input** — the transition is fully implemented and
the grammar accepts it, but scheduling it after `round_length` has to be wired up before
timeouts fire on their own.

#### `userScheduledData`

Turns a `'w' | 't' | 'l'` result into an increment on `global_user_state`. Two caveats worth
knowing before you copy it: nothing emits this input either (`executeRound` writes
`final_match_state` but does not schedule the stat updates), and the helper builds its
parameter object with `wins_increment` / `losses_increment` / `ties_increment` while the
generated query in `packages/client/database/src/sql/update.queries.ts` expects `wins` / `losses` / `ties`.

### Game engine

`packages/shared/game-logic/src/rock-paper-scissor.ts` holds the rules, including the
`DID_NOT_PLAY` case that makes zombie rounds work:

```ts
private match(firstAction: RPSActionsStates, secondAction: RPSActionsStates): MatchResult {
  if (firstAction === secondAction) return RockPaperScissors.Tie;

  if (firstAction === RPSExtendedStates.DID_NOT_PLAY) return RockPaperScissors.SecondWin;
  if (secondAction === RPSExtendedStates.DID_NOT_PLAY) return RockPaperScissors.FirstWin;

  if (firstAction === RPSActions.ROCK && secondAction === RPSActions.SCISSORS)
    return RockPaperScissors.FirstWin;
  // ...
}
```

`updateInternalState()` re-scans the whole state string after every mutation, stopping at
the first `PENDING` slot, and recomputes wins, ties and whether the game is over. Ties do
not count toward the majority — the clinch threshold is over half of the *decided* rounds.

`packages/shared/game-logic/src/tick.ts` wraps the engine as a round executor: `processTick` replays one round's moves
and returns a `TickEvent` (`move1`, `move2`, `winner`) for the frontend to animate.

### Database

Five tables plus the engine-owned `block_heights`, in
`packages/client/database/src/migrations/database.sql`:

| Table | Holds |
| --- | --- |
| `lobbies` | Settings, `lobby_state` (`open`/`active`/`finished`/`closed`), `current_round`, `round_winner`, `latest_match_state` |
| `rounds` | One row per round with `starting_block_height` and, once resolved, `execution_block_height` |
| `match_moves` | Cached per-player moves, `move_rps` constrained to the `rock_paper_scissors` enum |
| `final_match_state` | Completed non-practice matches, `win`/`tie`/`loss` per player plus the final move string |
| `global_user_state` | Per-wallet `wins` / `losses` / `ties` |

`current_round` is maintained by the database rather than by the state machine:

```sql
CREATE TRIGGER update_current_round
AFTER INSERT ON rounds
FOR EACH ROW
EXECUTE FUNCTION update_lobby_round();
```

Queries live as annotated SQL in `src/sql/{select,insert,update}.sql` and are compiled to
typed clients in the matching `*.queries.ts`. Regenerate them after editing any `.sql` file:

```sh
bun run --cwd packages/client/database pgtyped:update
```

### API

`packages/client/node/src/api.ts` registers read-only Fastify routes on port 9999. Several
paths are duplicated because the Phaser frontend and the underscore-style routes grew
apart; both spellings are live.

| Route | Returns |
| --- | --- |
| `GET /lobby/:lobbyId` | One lobby row, or `null` |
| `GET /lobby/:lobbyId/rounds` | All rounds, ascending |
| `GET /lobby/:lobbyId/round/:round` | One round row |
| `GET /lobby/:lobbyId/round/:round/moves` | Cached moves for that round |
| `GET /lobby/:lobbyId/moves` | Cached moves across every round of the lobby |
| `GET /lobby/:lobbyId/final`, `GET /lobby/:lobbyId/result` | `final_match_state` row |
| `GET /open_lobbies`, `GET /lobbies/open` | Non-hidden `open` lobbies; `?page=` and `?count=` (default `0` / `10`) |
| `GET /lobbies/active` | `active` lobbies, same pagination |
| `GET /user_lobbies?wallet=` | That wallet's `open`/`active`/`finished` lobbies |
| `GET /user_stats?wallet=`, `GET /user/:walletAddress/stats` | Stats row, or a zeroed one if the wallet is unknown |

```sh
curl "http://localhost:9999/lobbies/open?page=0&count=5"
curl "http://localhost:9999/user_stats?wallet=0xf39F..."
```

### Contract and sync

`MyPaimaL2Contract.sol` is nine lines: it extends `PaimaL2Contract` from
`@paimaexample/evm-contracts` and forwards `(owner, fee)`. All the input-mailbox behaviour
is inherited. `deploy.ts` deploys it through Hardhat Ignition with `fee: 0`, and the
generated `build/contractAddressesEvmMain.ts` is what `localhostConfig.ts` reads:

```ts
.addPrimitive(
  (syncProtocols) => syncProtocols.mainEvmRPC,
  (network, deployments, syncProtocol) => ({
    name: "RockPaperScissors_PaimaL2",
    type: PrimitiveTypeEVMPaimaL2,
    startBlockHeight: 0,
    contractAddress:
      contractAddressesEvmMain().chain31337["PaimaL2ContractModule#MyPaimaL2Contract"],
    paimaL2Grammar: grammar,
  }),
)
```

The config uses an **NTP main** sync protocol with a 1000 ms block time as the clock, and
attaches the Hardhat chain as a **parallel** `EVM_RPC_PARALLEL` protocol — so block
production does not stall when the local chain is idle.

### Frontend

Phaser 3, four scenes (`Start` → `Wallet` → `Lobby` → `Game`), bundled by
`packages/frontend/esbuild.js` into `public/dist/bundle.js` and served by `http-server` on
port 8080. `paimaMiddleware.src.js` is bundled separately and is the only place that talks
to a wallet or the chain; it builds grammar-shaped argument arrays and hands them to
`sendTransaction`:

```js
async submitMoves(lobbyId, roundNumber, move) {
  const result = await sendTransaction(
    wallet,
    ["submittedMoves", lobbyId, roundNumber, move],
    paimaEngineConfig
  );
  return result;
}
```

`Lobby.ts` offers "New Battle" (`createLobby(3, 60, false, false)`) and "AI Battle"
(`createLobby(3, 60, false, true)` — a practice lobby), plus join/reconnect buttons built
from `/open_lobbies` and `/user_lobbies`. `Game.ts` polls `/lobby/:lobbyId` every two
seconds and, whenever `current_round` advances, replays the round that just finished for
the win/lose banner.

Two rough edges in the frontend, if you are reading it as a reference: `Game.ts` calls
`mw.getRoundExecutor(...)`, which `paimaMiddleware.src.js` does not currently export, and it
renders a countdown from `lobbyInfo.round_ends_in_blocks`, which is not a column the API
returns.

## Configuration

The template is wired for the local stack and reads very little from the environment:

| Variable | Set by | Effect |
| --- | --- | --- |
| `PAIMA_API_PORT` | `packages/client/node/package.json` (`dev` script, `9999`) | Port the Fastify API binds to |
| `NODE_ENV` | `dev` script (`development`) | Runtime mode |
| `EFFECTSTREAM_STDOUT` | `Dockerfile` | Disables tmux, TUI and the log collector; logs to stdout |
| `RUN_IN_DOCKER` | `Dockerfile` | Marks the containerised run |

Everything else is code. To point the node at a real network, edit
`packages/shared/data-types/src/localhostConfig.ts`: replace the `hardhat` viem chain in
`addViemNetwork`, set `chainUri` and a real `startBlockHeight` on the `mainEvmRPC` sync
protocol, and give the primitive the deployed contract address instead of reading
`contractAddressesEvmMain()`. The frontend needs the matching change in
`packages/frontend/paimaMiddleware.src.js`, where the chain and the L2 address
(`0x5FbDB2315678afecb367f032d93F642f64180aa3`, the standard first Hardhat deployment) are
hard-coded, along with the `http://localhost:9999` API base used by every `fetch` call.

`packages/shared/contracts/evm/deploy.ts` hard-codes the deployment owner and `fee: 0`;
change both before deploying anywhere real.

## Testing

This template has no automated tests — it is excluded from the repository's template test
runner (`templates/run-template-tests.ts` lists `rock-paper-scissors` commented out,
pending migration). The checks available today are:

```sh
# Typecheck the node package (tsc --noEmit over src/main.ts)
bun run check

# Full manual run: contracts, node, API, explorer and frontend
bun run build:evm && bun run dev
```

A good manual smoke test is to open http://localhost:8080 in two browser profiles with
different Hardhat accounts, create a battle in one, join it from the other, and watch
`curl http://localhost:9999/lobby/<id>` — `latest_match_state` should go from `******` to a
resolved string one round at a time.

## Where to go next

- [State machine](https://effectstream.github.io/docs/home/components/state-machine) — how transitions, `World` effects and version routing work in general.
- [Grammar](https://effectstream.github.io/docs/home/components/grammar) — the input encoding this template's TypeBox schemas compile to.
- [Randomness](https://effectstream.github.io/docs/home/components/randomness) — why `Prando` lobby IDs are safe to generate inside a transition.
- [Chess template](https://effectstream.github.io/docs/home/templates/chess) — the same lobby/round/zombie shape, on the current `@effectstream/*` layout and with a batcher, frontend and test suite.
- [`hex-battle`](https://github.com/effectstream/effectstream/tree/v-next/templates/hex-battle) — simultaneous hidden moves plus a working practice AI, already migrated off `@paimaexample/*`.

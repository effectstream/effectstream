# Rock Paper Scissors Wars (Turn-Based Multiplayer)

* **Path**: `/templates/rock-paper-scissors`
* **Highlights**: A turn-based multiplayer Rock Paper Scissors game showcasing lobby systems, round-based gameplay, and competitive match mechanics using EffectStream's L2.

The `rock-paper-scissors` template demonstrates how to build a competitive multiplayer game with lobby management, turn-based rounds, and player statistics. It's an excellent example for games requiring matchmaking, simultaneous hidden moves, and game state progression, all processed deterministically through an EffectStream L2 contract on an EVM chain.

![Rock Paper Scissors Lobby System](./1207-rock-paper-scissors.md)

## Core Concept: Turn-Based Combat with Lobbies

The goal of this template is to demonstrate a competitive multiplayer game where players create or join lobbies, play best-of-N matches, and track their win/loss records. The game implements classic Rock Paper Scissors rules with a robust lobby and round management system.

*   **Lobby System**: Players create lobbies with configurable round counts, round lengths, and visibility settings.
*   **Round-Based Gameplay**: Each match consists of multiple rounds where both players submit moves simultaneously.
*   **Hidden Moves**: Moves are committed but not revealed until both players submit their choices for a round.
*   **Automatic Execution**: When both players submit moves, the round is automatically resolved using deterministic game logic.
*   **Zombie Rounds**: If a player fails to submit a move within the time limit, they automatically forfeit the round.
*   **Player Statistics**: Track wins, losses, and ties across all completed matches.

This template serves as a foundation for:
*   Turn-based strategy games
*   Card battle games
*   Competitive puzzle games
*   Any game requiring simultaneous hidden moves

## Quick Start

```sh
# Install dependencies
npm install
deno install --allow-scripts
./patch.sh

# Build EVM contracts
deno task build:evm

# Build frontend
cd packages/frontend
npm install
node esbuild.js
cd ../..

# Start the EffectStream Node
deno task dev
```

The game will be available at:
- **Frontend**: http://localhost:8080
- **API**: http://localhost:9999
- **Explorer**: http://localhost:10590
- **Blockchain**: http://localhost:8545

### Using Test Accounts

For development, import Hardhat's test accounts into MetaMask:

1. Open MetaMask → Click account icon → **Import Account**
2. Select **Private Key** and paste one of these:
   ```
   # Account #0 (10,000 ETH)
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

   # Account #1 (10,000 ETH) - for testing multiplayer
   0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
   ```
3. Make sure MetaMask is connected to **Localhost 8545** (Chain ID: 31337)

⚠️ **Never use these private keys on a real network** - they're publicly known and only for local development.

## Docker Setup

You can run the entire stack in a single Docker container:

### Building the Docker Image

```sh
# For macOS
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t rock-paper-scissors -f Dockerfile .

# For Linux
docker build -t rock-paper-scissors -f Dockerfile .
```

### Running the Container

```sh
# For macOS
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run -p 8080:8080 -p 8545:8545 -p 9999:9999 rock-paper-scissors

# For Linux
docker run -p 8080:8080 -p 8545:8545 -p 9999:9999 rock-paper-scissors
```

The container exposes:
- **Port 8080**: Frontend
- **Port 8545**: Local EVM node (Hardhat)
- **Port 9999**: EffectStream backend API

## The Components in Action

When you run `deno task dev`, the [Process Orchestrator](../100-components/106-processes.md) sets up:
*   **Hardhat EVM Node**: Local blockchain on port 8545
*   **Development Services**: Database, log collector, TUI, and Explorer
*   **EffectStream Node**: Backend service on port 9999
*   **Frontend**: Phaser.js game interface on port 8080

## On-Chain Logic

The template uses a `EffectStream L2 Contract` deployed on the local EVM chain at `0x5FbDB2315678afecb367f032d93F642f64180aa3`. Players submit formatted input strings, and EffectStream processes them to update game state.

```solidity
// The EffectStreamL2Contract acts as an input mailbox
contract EffectStreamL2 {
    event EffectStreamGameInteraction(address indexed user, bytes input, uint256 indexed nonce);

    function submitInput(bytes calldata input) external payable {
        emit EffectStreamGameInteraction(msg.sender, input, nonce);
    }
}
```

EffectStream monitors the `EffectStreamGameInteraction` event to receive and process player inputs.

## The State Machine (`state-machine.ts`)

The State Machine implements all game logic using **generator functions** with `yield*` for structured effects.

### Grammar Definition

Input grammar is defined using TypeBox schemas in `packages/shared/data-types/src/grammar.ts`:

```typescript
export const grammar = {
  createdLobby: [
    ["numOfRounds", Type.Number({ minimum: 1, maximum: 9 })],
    ["roundLength", Type.Number({ minimum: 1 })],
    ["isHidden", ParsableBoolean],
    ["isPractice", ParsableBoolean],
  ],
  joinedLobby: [["lobbyID", Type.String()]],
  closedLobby: [["lobbyID", Type.String()]],
  submittedMoves: [
    ["lobbyID", Type.String()],
    ["roundNumber", Type.Number({ minimum: 1, maximum: 9 })],
    ["move_rps", Type.String()],
  ],
} as const satisfies GrammarDefinition;
```

### State Transitions

#### `createdLobby`
Creates a new game lobby with specified settings.

```typescript
stm.addStateTransition("createdLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;

  const result = yield* World.promise<SQLUpdate>(
    createdLobby(
      user!,
      blockHeight,
      { input: "createdLobby", ...parsedInput },
      randomGenerator
    )
  );

  yield* World.resolve(result[0], result[1]);
});
```

The transition function generates a unique lobby ID and initializes match state:

```typescript
export async function createdLobby(
  player: WalletAddress,
  blockHeight: number,
  input: CreatedLobbyInput,
  randomnessGenerator: Prando
): Promise<SQLUpdate> {
  const lobby_id = randomnessGenerator.nextString(12);
  const initialMatchState = RockPaperScissors.buildInitialState(input.numOfRounds);

  return [createLobby, {
    lobby_id,
    num_of_rounds: input.numOfRounds,
    round_length: input.roundLength,
    round_winner: "",
    created_at: new Date(),
    creation_block_height: blockHeight,
    hidden: input.isHidden,
    practice: input.isPractice,
    lobby_creator: player,
    lobby_state: "open",
    latest_match_state: initialMatchState,
  }];
}
```

#### `joinedLobby`
Allows a second player to join an open lobby, starting the match.

```typescript
stm.addStateTransition("joinedLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress: user } = data;

  // Query the lobby first
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  const results = yield* World.promise<SQLUpdate[]>(
    joinedLobby(user!, blockHeight, { input: "joinedLobby", ...parsedInput }, lobbyData)
  );

  // Execute all SQL updates
  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});
```

The join logic validates the lobby and creates the first round:

```typescript
export async function joinedLobby(
  player: WalletAddress,
  blockHeight: number,
  input: JoinedLobbyInput,
  lobby: IGetLobbyByIdResult | null
): Promise<SQLUpdate[]> {
  if (!lobby) return [];

  // Validate lobby can be joined
  if (lobby.player_two || lobby.lobby_state !== "open" || lobby.lobby_creator === player) {
    return [];
  }

  const updates: SQLUpdate[] = [];

  // Update lobby with player two
  updates.push([updateLobbyPlayerTwo, { player_two: player, lobby_id: input.lobbyID }]);

  // Create round 1
  updates.push([createRound, {
    lobby_id: input.lobbyID,
    round_within_match: 1,
    starting_block_height: blockHeight,
  }]);

  // Initialize user stats for both players
  updates.push([createUserStats, { wallet: lobby.lobby_creator }]);
  updates.push([createUserStats, { wallet: player }]);

  return updates;
}
```

#### `submittedMoves`
Handles move submission and automatic round execution when both players have submitted.

```typescript
stm.addStateTransition("submittedMoves", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;

  // Query current game state
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  const round = yield* World.resolve(getRoundData, {
    lobby_id: parsedInput.lobbyID,
    round: parsedInput.roundNumber
  });
  const roundData = round && round.length > 0 ? round[0] : null;

  const cachedMoves = yield* World.resolve(getCachedMoves, {
    lobby_id: parsedInput.lobbyID,
    round: parsedInput.roundNumber,
  });

  const results = yield* World.promise<SQLUpdate[]>(
    submittedMoves(user!, blockHeight, { input: "submittedMoves", ...parsedInput },
                   lobbyData, roundData, cachedMoves || [], randomGenerator)
  );

  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});
```

The move submission logic caches moves and automatically executes the round when both players have submitted:

```typescript
export async function submittedMoves(
  player: WalletAddress,
  blockHeight: number,
  input: SubmittedMovesInput,
  lobby: IGetLobbyByIdResult | null,
  round: IGetRoundDataResult | null,
  cachedMoves: IGetCachedMovesResult[],
  randomnessGenerator: Prando
): Promise<SQLUpdate[]> {
  if (!lobby || !round) return [];
  if (!validateSubmittedMoves(lobby, round, input, player)) return [];

  // Cache the move
  const moveUpdate: SQLUpdate = [createMove, {
    lobby_id: input.lobbyID,
    wallet: player,
    round: input.roundNumber,
    move_rps: input.move_rps,
  }];

  // Check if both players have submitted
  const allMoves = [...cachedMoves, { wallet: player, move_rps: input.move_rps }];
  if (allMoves.length === 2) {
    // Execute the round automatically
    const roundExecutionUpdates = executeRound(blockHeight, lobby, allMoves, round, randomnessGenerator);
    return [moveUpdate, ...roundExecutionUpdates];
  }

  return [moveUpdate];
}
```

#### `zombieScheduledData`
Handles round timeouts, automatically forfeiting rounds for inactive players.

```typescript
export async function zombieRound(
  blockHeight: number,
  input: ZombieScheduledDataInput,
  lobby: IGetLobbyByIdResult | null,
  round: IGetRoundDataResult | null,
  moves: IGetCachedMovesResult[],
  randomnessGenerator: Prando
): Promise<SQLUpdate[]> {
  if (!lobby || lobby.lobby_state !== 'active') return [];
  if (!round || moves.length >= 2) return [];

  // Execute round with missing moves marked as "did not play"
  return executeRound(blockHeight, lobby, moves, round, randomnessGenerator);
}
```

## Game Logic Engine

The core Rock Paper Scissors logic is implemented in `packages/shared/game-logic/src/index.ts` as a standalone, deterministic game engine:

```typescript
export class RockPaperScissors {
  state: RPSSummary;

  constructor(initialState: RPSSummary) {
    this.state = initialState;
  }

  static buildInitialState(numRounds: number): RPSSummary {
    const rounds: RPSRound[] = Array(numRounds).fill(null).map(() => ({
      p1Move: RPSMoveResult.PENDING,
      p2Move: RPSMoveResult.PENDING,
    }));
    return { rounds };
  }

  inputMove(isPlayerOne: boolean, move: RPSActions, roundNumber: number): void {
    const round = this.state.rounds[roundNumber - 1];
    if (isPlayerOne) {
      round.p1Move = move;
    } else {
      round.p2Move = move;
    }
  }

  roundWinner(roundNumber: number): [GameResult, string] {
    const round = this.state.rounds[roundNumber - 1];
    const p1 = round.p1Move;
    const p2 = round.p2Move;

    // Determine winner based on RPS rules
    if (p1 === RPSActions.ROCK && p2 === RPSActions.SCISSORS) return [GameResult.WIN, "rock beats scissors"];
    if (p1 === RPSActions.SCISSORS && p2 === RPSActions.PAPER) return [GameResult.WIN, "scissors beats paper"];
    if (p1 === RPSActions.PAPER && p2 === RPSActions.ROCK) return [GameResult.WIN, "paper beats rock"];
    // ... additional logic for ties and losses
  }

  didGameEnd(): boolean {
    // Check if all rounds are complete or a player has won majority
    const p1Wins = this.state.rounds.filter(r =>
      r.p1Move !== RPSMoveResult.PENDING && this.roundWinner(r).result === GameResult.WIN
    ).length;
    const p2Wins = this.state.rounds.filter(r =>
      r.p2Move !== RPSMoveResult.PENDING && this.roundWinner(r).result === GameResult.LOSS
    ).length;

    const majorityNeeded = Math.ceil(this.state.rounds.length / 2);
    return p1Wins >= majorityNeeded || p2Wins >= majorityNeeded;
  }
}
```

## Database Schema

The database has five main tables defined in `packages/client/database/src/migrations/database.sql`:

### `lobbies`
Stores lobby metadata and match state.

```sql
CREATE TABLE lobbies (
  lobby_id TEXT NOT NULL PRIMARY KEY,
  num_of_rounds INTEGER NOT NULL,
  round_length INTEGER NOT NULL,
  round_winner TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL,
  creation_block_height INTEGER NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  practice BOOLEAN NOT NULL DEFAULT FALSE,
  lobby_creator TEXT NOT NULL,
  player_two TEXT,
  lobby_state TEXT NOT NULL DEFAULT 'open',
  latest_match_state TEXT NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0
);
```

### `rounds`
Tracks individual rounds within matches.

```sql
CREATE TABLE rounds (
  lobby_id TEXT NOT NULL,
  round_within_match INTEGER NOT NULL,
  starting_block_height INTEGER NOT NULL,
  execution_block_height INTEGER,
  PRIMARY KEY (lobby_id, round_within_match)
);
```

### `match_moves`
Caches submitted moves before round execution.

```sql
CREATE TABLE match_moves (
  lobby_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  round INTEGER NOT NULL,
  move_rps TEXT NOT NULL,
  PRIMARY KEY (lobby_id, wallet, round)
);
```

### `global_user_state`
Tracks player statistics.

```sql
CREATE TABLE global_user_state (
  wallet TEXT NOT NULL PRIMARY KEY,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0
);
```

### `final_match_state`
Records completed match results.

```sql
CREATE TABLE final_match_state (
  lobby_id TEXT NOT NULL PRIMARY KEY,
  player_one_wallet TEXT NOT NULL,
  player_one_result TEXT NOT NULL,
  player_two_wallet TEXT NOT NULL,
  player_two_result TEXT NOT NULL,
  total_time INTEGER NOT NULL,
  game_moves TEXT NOT NULL
);
```

### Type-Safe Queries

The template uses **pgtyped** to generate TypeScript types from SQL queries. To regenerate types after modifying SQL files:

```sh
cd packages/client/database
deno task pgtyped:update
```

**Important**: Always run `deno task pgtyped:update` after converting functions from synchronous to async, as the type definitions need to be regenerated.

## API Endpoints

The backend server runs on **port 9999** and provides REST endpoints defined in `packages/client/node/src/api.ts`.

### GET `/lobby/:lobbyId`
Fetches details for a specific lobby.

**Example Request**:
```bash
curl "http://localhost:9999/lobby/abc123xyz456"
```

### GET `/lobbies/open`
Lists all open lobbies available to join.

**Query Parameters**:
| Parameter | Type   | Default | Description           |
| :-------- | :----- | :------ | :-------------------- |
| `page`    | number | 0       | Page number (0-based) |
| `count`   | number | 10      | Items per page        |

### GET `/lobbies/active`
Lists all currently active matches.

### GET `/user/:wallet/stats`
Fetches player statistics.

**Example Response**:
```json
{
  "wallet": "0xf39fd6e51aad88f6f4ce6ab8827279cffb92266",
  "wins": 5,
  "losses": 2,
  "ties": 1
}
```

### GET `/lobby/:lobbyId/result`
Gets final match results for a completed game.

### GET `/lobby/:lobbyId/moves`
Retrieves all moves submitted across all rounds.

## Frontend Architecture

The frontend uses **Phaser.js** for game rendering and UI, with wallet integration via `@paimaexample/wallets`.

### Wallet Middleware

The middleware layer (`paimaMiddleware.src.js`) bridges Phaser to the EffectStream wallet API:

```javascript
import { EffectStreamConfig, sendTransaction, walletLogin, WalletMode } from "@paimaexample/wallets";
import { hardhat } from "viem/chains";

const effectstreamConfig = new EffectStreamConfig(
  "rock-paper-scissors",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  undefined,
  false,
);

window.paimaMiddleware = {
  async userWalletLogin({ mode, preferBatchedMode }) {
    const result = await walletLogin({
      mode: mode || WalletMode.EvmInjected,
      chain: effectstreamConfig.effectstreamL2Chain,
      preferBatchedMode: preferBatchedMode ?? false,
    });
    if (!result.success) throw new Error("Wallet login failed");
    return result.result;
  },

  async createLobby(numOfRounds, roundLength, isHidden, isPractice) {
    return await sendTransaction(
      wallet,
      ["createdLobby", numOfRounds, roundLength, isHidden, isPractice],
      effectstreamConfig
    );
  },

  async joinLobby(lobbyId) {
    return await sendTransaction(wallet, ["joinedLobby", lobbyId], effectstreamConfig);
  },

  async submitMove(lobbyId, roundNumber, move) {
    return await sendTransaction(
      wallet,
      ["submittedMoves", lobbyId, roundNumber, move],
      effectstreamConfig
    );
  },
};
```

### Building the Frontend

The frontend uses esbuild with Phaser and Node.js polyfills:

```sh
cd packages/frontend
npm install
node esbuild.js  # Generates paimaMiddleware.js
```

## Architecture Highlights

### Generator Function Pattern with Async Transitions

State transitions use **generator functions** with `yield*` combined with **async transition functions**:

```typescript
// State machine uses generators
function* (data) {
  // 1. Call async transition function
  const result = yield* World.promise<SQLUpdate>(
    async transitionFunction(...)
  );

  // 2. Apply the SQL update
  yield* World.resolve(result[0], result[1]);
}

// Transition functions are async
export async function transitionFunction(...): Promise<SQLUpdate> {
  return [preparedQuery, params];
}
```

This pattern ensures:
- **Deterministic execution**: EffectStream manages all side effects
- **Testability**: Transition functions return SQL descriptions
- **Type safety**: pgtyped generates types for all queries
- **Async support**: Transition functions can be async for flexibility

### Separation of Concerns

1. **Grammar** (`packages/shared/data-types`): TypeBox validation
2. **Game Logic** (`packages/shared/game-logic`): Pure, deterministic game rules
3. **Transition Functions** (`packages/client/node/src/state-machine/v1/transition.ts`): Async functions returning SQL updates
4. **State Machine** (`packages/client/node/src/state-machine.ts`): Generator-based orchestration
5. **Database** (`packages/client/database`): Type-safe queries with pgtyped
6. **API** (`packages/client/node/src/api.ts`): REST endpoints
7. **Frontend** (`packages/frontend`): Phaser.js game interface

## Use Cases and Extensions

This template can be extended for various game types:

### Card Games
- Replace RPS with card battle mechanics
- Add deck building and card drawing
- Implement mana or energy systems

### Turn-Based Strategy
- Extend to grid-based tactical combat
- Add unit types and abilities
- Implement fog of war and line of sight

### Puzzle Battles
- Replace moves with puzzle solutions
- Add combo systems
- Implement time-based scoring

### Tournament Systems
- Add bracket tournaments
- Implement ranked matchmaking
- Create seasonal leaderboards

## Troubleshooting

### Port Conflicts
```sh
lsof -i :8545  # Check EVM node port
lsof -i :9999  # Check API port
lsof -i :8080  # Check frontend port
```

### Frontend Bundle Outdated
```sh
cd packages/frontend
node esbuild.js  # Regenerate bundle
```

### Database Query Types Out of Sync
After modifying SQL files or converting functions to async:
```sh
cd packages/client/database
deno task pgtyped:update
```

### Lobby Not Creating
Check that:
1. MetaMask is connected to Localhost 8545
2. You have test ETH in your account
3. The EffectStream node is running (`deno task dev`)
4. Check browser console for errors
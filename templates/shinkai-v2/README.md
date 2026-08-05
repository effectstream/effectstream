# Shinkai Quest

> An AI-judged RPG where an off-chain LLM writes the story but never touches the token ledger, which stays deterministic on an EVM L2.

Four animal courtiers guard the Panda King's treasury. Each asks the player a question; a Shinkai AI
node reads the answer, replies in character, and grades it 0-100. The Panda King settles up at the
end. Every question and answer arrives on-chain as an
`EffectstreamL2` game input, so the ordering of play is consensus-decided even though the judging
is not.

That combination is the point of the template. Most "AI + blockchain" examples put the model behind
an API and let it hand results to the chain on trust. This one runs the model call *inside* a state
transition, and then draws an explicit line around which database columns the model is allowed to
influence. Read it if you want to attach any non-deterministic off-chain service — an LLM, a price
oracle, a content moderator — to an Effectstream state machine and need a concrete answer to
"what happens when two nodes get different results?".

## What this template shows

**An off-chain AI call inside a state transition, with a hard boundary around what it can move.**

`@effectstream/coroutine` exposes `World.promise`, which suspends a state transition, lets the
runtime await a real `Promise`, and resumes with the value. The runtime implements it in
`executeGeneratorStepByStep` — it awaits the promise and feeds the result straight back into the
generator. It does **not** record the result for replay. So anything you pull in through
`World.promise` is fresh on every execution, on every node. The `ai` transition in
`packages/node/state-machine.ts` uses it to call Shinkai:

```ts
const shinkai = new ShinkaiClient();
const [textResult, scoreResult] = yield* World.promise(
  Promise.all([
    shinkai.askQuestion(promptFn(response, "text")),
    shinkai.askQuestion(promptFn(response, "score")),
  ]),
);
ai = textResult.response;
score = parseInt(scoreResult.response, 10) || 0;
```

Two calls per turn: one asks the NPC to answer in character, one asks for a number. The prompt
builders in `packages/node/prompts.ts` are pure functions of the player's on-chain text, so every
node that replays the block builds the *identical* prompt — the inputs to the model are
deterministic even though its outputs are not.

**What the AI is allowed to write.** Trace every write in the `ai` transition and the model's
output reaches exactly three places: `question_answer.answer`, `question_answer.score`, and
`game.prize`. Those are narrative and scoreboard fields.

**What the AI is not allowed to write.** The token ledger. When the player reaches the Panda King,
the amount that actually moves is computed before the model is consulted:

```ts
const [worldStats] = yield* World.resolve(getWorldStats, undefined);
const maxTokens = Math.max(100, Math.min(worldStats?.tokens ?? 1000, 1000));
```

`maxTokens` is a pure function of the world pool already in the database, and it is `maxTokens` —
not `score`, not `prize` — that is passed to `updateUserGlobalPosition` and `updateTokens`. Two
nodes whose Shinkai instances disagree about how eloquent a player was will still hold identical
`global_user_state.tokens` and `global_world_state.tokens`. The disagreement is confined to text
and a display number.

**The unreachable-node case is a value, not an error.** The call sits in a `try`/`catch` whose
fallback is a fixed constant rather than a rethrow:

```ts
} catch {
  // Shinkai not configured — use stub so the game still advances
  ai = "The court acknowledges your answer.";
  score = 50;
}
```

A node with no `SHINKAI_URL` configured advances the game deterministically instead of rolling the
input back. That is what makes `bun run dev` work out of the box with no AI credentials, and it is
the same trick you want for any optional off-chain dependency: fail into a constant, not into an
exception.

**The honest caveat.** Because `World.promise` results are not journalled, this design does not give
you byte-identical replicas of the *narrative* columns. Effectstream's block hash
(`generateEffectstreamBlockHash`) is computed over the source-chain block hashes, not over
application state, so such a divergence is not detected for you. If your game needs the AI's verdict
itself to be consensus-critical, the model output has to become an on-chain input — signed and
submitted like any other — rather than something the STF fetches. This template deliberately takes
the simpler route and keeps the consensus-critical arithmetic away from the model.

## Effectstream features used

| Feature | Where | Used for |
| --- | --- | --- |
| `Stm` state machine (`@effectstream/sm`) | `packages/node/state-machine.ts` | The `newGame`, `ai` and `tick` transitions |
| Concise grammar (`@effectstream/concise`) | `packages/node/grammar.ts` | Typebox-validated input shapes for the three commands |
| `World.promise` (`@effectstream/coroutine`) | `packages/node/state-machine.ts` | Awaiting the Shinkai HTTP call from inside a transition |
| `World.resolve` (`@effectstream/coroutine`) | `packages/node/state-machine.ts` | Running pgtyped queries as part of the transition stream |
| EVM sync via `PrimitiveTypeEVMEffectstreamL2` | `packages/node/config.dev.ts` | Reading batched game inputs off the L2 contract |
| NTP main sync protocol | `packages/node/config.dev.ts` | 2-second block clock (`ConfigSyncProtocolType.NTP_MAIN`) |
| Scheduled inputs (`createScheduledData`) | `packages/node/state-machine.ts` | `tick` re-queues itself ~30 blocks ahead |
| Batcher (`@effectstream/batcher-sdk`) | `packages/batcher/batcher.dev.ts` | Time-windowed batching, `wait-effectstream-processed` |
| `EffectstreamL2DefaultAdapter` | `packages/batcher/effectstream-l2.ts` | Posting batches to the deployed L2 contract |
| Multi-ecosystem wallet login (`@effectstream/wallets`) | `packages/frontend/client/src/wallet-picker.ts` | EVM injected, Cardano CIP-30, and a social/passkey wallet |
| `sendTransaction(..., "wait-effectstream-processed")` | `packages/frontend/client/src/screens.ts` | Submitting game inputs and waiting for the STF to run |
| Custom API routes (`StartConfigApiRouter`) | `packages/node/api.ts` | Four read endpoints served by the node's Fastify server |
| Migrations + pgtyped queries (`@effectstream/db`) | `packages/database/sql/queries.sql` | Typed SQL for game, world and per-user state |
| `EffectstreamL2Contract` (`@effectstream/evm-contracts`) | `packages/contracts-evm/src/contracts/MyEffectstreamL2.sol` | The deployed L2 input contract |
| Orchestrator (`@effectstream/orchestrator`) | `start.dev.ts` | PGLite + Hardhat + sync + batcher + frontend as one stack |

## Quick start

Only Bun is required. The Shinkai node is optional — without it the `ai` transition falls back to
its stub answer (see above) and everything else works unchanged.

```sh
bun install
bun run dev
```

To enable real AI judging, set the Shinkai variables before `bun run dev` (see `.env.example`):

```sh
SHINKAI_URL=http://localhost:9550
SHINKAI_API_KEY=your-api-key-here
SHINKAI_LLM_PROVIDER=shinkai_free_trial
```

Local services, from `start.dev.ts` and the orchestrator's `launchPglite` / `launchEvm` helpers:

| Service | URL |
| --- | --- |
| Game frontend (PixiJS) | http://localhost:10599 |
| Sync node API | http://localhost:9999 |
| Batcher | http://localhost:3334 |
| Hardhat EVM RPC | http://localhost:8545 |
| PGLite (Postgres wire protocol) | `postgres://localhost:5432` |
| Orchestrator API | http://localhost:4747 |

## Project structure

```
packages/
  node/              Sync-node entrypoints, config, grammar, state machine, API, Shinkai client
  database/          Migrations, pgtyped queries, migration order
  contracts-evm/     MyEffectstreamL2.sol, Hardhat build, Ignition deployment
  batcher/           Batcher process and its EffectstreamL2 adapter
  frontend/          PixiJS client (client/) and a Fastify static server (server/)
  tests/             Orchestrator-driven end-to-end suite
```

## How it works

### Grammar

Three commands, defined in `packages/node/grammar.ts`:

```ts
export const grammar = {
  newGame: [],
  ai: [
    ["target", Type.String({ maxLength: 100 })],
    ["id", Type.Number({ minimum: 1 })],
    ["response", Type.String({ maxLength: 1000 })],
  ],
  tick: [
    ["n", Type.Number({ minimum: 0 })],
  ],
} as const satisfies GrammarDefinition;
```

The frontend submits them positionally — `["newGame"]` and `["ai", animal, gameId, value]` — and the
grammar turns each into a typed `parsedInput` for the transition.

### One turn, end to end

1. The player types an answer and presses **Speak** in `packages/frontend/client/src/screens.ts`.
   `sendTransaction(GameState.walletObj!, ["ai", animal, GameState.gameId, value], paimaConfig,
   "wait-effectstream-processed")` signs the input with the connected wallet and, because
   `paimaConfig` is constructed with `preferBatchedMode` set, posts it to the batcher rather than
   sending an EVM transaction from the user's account.
2. The batcher (`packages/batcher/batcher.dev.ts`) collects inputs on a 1-second time window and
   submits the batch through `EffectstreamL2DefaultAdapter` to `MyEffectstreamL2`.
3. The sync node's `EffectstreamL2` primitive (`packages/node/config.dev.ts`) reads the batch back
   off Hardhat, re-verifies each signature, and hands the decoded inputs to the state machine.
4. `stm.addStateTransition("ai", ...)` validates the turn — the game must exist, belong to the
   signer, and not already have an answer for this NPC — then calls Shinkai and writes the result.
5. `sendTransaction` returns once the node reports the input processed, and the frontend fetches the
   NPC's reply from `GET /api/game/round`.

Steps 1-3 make the *ordering and content of play* consensus-decided; step 4 is where the model's
opinion enters, bounded as described above.

### Guards in the transition

The `ai` transition returns early rather than throwing on every rejection path:

```ts
const [game] = yield* World.resolve(getGameById, { id });
if (!game) return;
if (game.wallet !== user) return;

const [existingQa] = yield* World.resolve(getQuestionAnswer, { game_id: id, stage: target });
if (existingQa) return;
```

That is what stops a player from re-answering an NPC to reroll a bad score, and from answering on
someone else's game. `target` is validated by a `switch` that picks the prompt builder and `return`s
on an unknown animal, so an arbitrary string in the on-chain input cannot reach the model.

### The world pool and `tick`

`packages/database/migrations/000-init.sql` seeds the treasury:

```sql
INSERT INTO global_world_state (tokens) VALUES (10000);
```

The `tick` transition adds 20 tokens to that pool and schedules its own successor:

```ts
yield* World.resolve(updateTokens, { change: 20 });
yield* World.promise(
  createScheduledData(
    JSON.stringify(["tick", parsedInput.n + 1]),
    blockHeight + Math.ceil(60 / BLOCK_TIME),
  ),
);
```

With `BLOCK_TIME = 2` and a 2000 ms NTP block clock that is 30 blocks, roughly 60 seconds. Nothing
in the template seeds the first `tick` — it is submitted like any other input, and from then on each
execution queues the next one.

### Wallets

`packages/frontend/client/src/wallet-picker.ts` builds its list from
`allInjectedWallets()` and offers three kinds of login:

- **EVM injected** — `walletLogin({ mode: WalletMode.EvmInjected, preferBatchedMode: true, ... })`.
- **Cardano CIP-30** — `walletLogin({ mode: WalletMode.Cardano, preference: { name } })`. Any
  installed CIP-30 extension is listed.
- **Social / biometric** — an embedded wallet loaded from `VITE_SOCIAL_WALLET_URL`, implemented as a
  custom `IProvider` in `packages/frontend/client/src/social-wallet-provider.ts`.

**Cardano here is login and signing only.** `packages/node/config.dev.ts` and
`packages/node/config.mainnet.ts` declare two networks — an NTP clock and one EVM chain — and no
Cardano network, sync protocol or primitive. A Cardano player's signature is verified by the
batcher and by the L2 primitive on the way in; nothing is ever read from or written to Cardano. This
is worth internalising before copying the pattern: Effectstream's wallet layer lets a chain
authenticate users without that chain being part of your sync configuration at all.

The Cardano path also needs a small piece of session repair, in
`packages/frontend/client/src/main.ts`. CIP-30 sessions die on wallet auto-lock, and
`@effectstream/wallets` caches the provider per wallet name, so a second `walletLogin` returns the
same object with a dead `conn.api`. `refreshCardanoSession()` calls `window.cardano[name].enable()`
and swaps the fresh API into the cached provider; `screens.ts` retries the action once when it sees
an `APIError`.

### Namespace

The batcher, the frontend and the sync-side primitive must agree on the security namespace used when
reconstructing a signed message. The template sets it to the empty string in both
`packages/batcher/batcher.dev.ts` (`namespace: ""`) and
`packages/frontend/client/src/config.ts` (`NAMESPACE`), with comments explaining that the SDK's L2
primitive currently reconstructs with `namespace = null`. The `ConfigBuilder` still sets
`setSecurityNamespace("shinkai-v2")` for the app itself.

### API

`packages/node/api.ts` registers four read-only routes on the node's Fastify server. Each uses
`runPreparedQuery` with the same pgtyped queries the state machine uses:

| Endpoint | Returns |
| --- | --- |
| `GET /api/game?game_id=N` | One `game` row |
| `GET /api/game/new?wallet=ADDR` | The newest `stage = 'new'` game for a wallet |
| `GET /api/game/round?game_id=N&stage=ANIMAL` | The question/answer/score for one NPC |
| `GET /api/game/tokens?wallet=ADDR` | `{ tokens, global }` — the player's balance and the world pool |

### Database

Four tables in `packages/database/migrations/000-init.sql`: `global_world_state` (the single-row
treasury), `global_user_state` (per-wallet token balance), `game` (one row per session, with
`stage`, `prize` and `block_height`), and `question_answer` (keyed on `(game_id, stage)` — the
primary key is what makes the "already answered" guard cheap).

## Configuration

The template ships two environments. Dev needs nothing; mainnet is entirely env-driven.

| | Dev | Mainnet |
| --- | --- | --- |
| EVM chain | Hardhat (31337) | Arbitrum One (42161) |
| Node entry | `packages/node/main.dev.ts` | `packages/node/main.mainnet.ts` |
| Node config | `packages/node/config.dev.ts` | `packages/node/config.mainnet.ts` |
| Batcher entry | `packages/batcher/batcher.dev.ts` | `packages/batcher/batcher.mainnet.ts` |
| Start command | `bun run dev` | `bun run start:mainnet` |

Variables read by `packages/node/config.mainnet.ts` and the batcher:

| Variable | Required | Description |
| --- | --- | --- |
| `EVM_RPC_URL` | Yes (mainnet) | Arbitrum One RPC endpoint |
| `EVM_START_BLOCK` | Yes (mainnet) | Block height to begin syncing and to anchor the primitive |
| `EFFECTSTREAM_L2_ADDRESS` | Yes (mainnet) | Address of the deployed `MyEffectstreamL2` |
| `EVM_PRIVATE_KEY` | Yes (mainnet) | Key the batcher signs L2 submissions with; dev falls back to a Hardhat account |
| `NTP_START_TIME` | No | NTP epoch in ms. Falls back to the `mainNtp` pagination row in the database, then `Date.now()` |
| `SHINKAI_URL` | No | Shinkai node base URL. Unset means the stub answer |
| `SHINKAI_API_KEY` | No | Bearer token for the Shinkai node |
| `SHINKAI_LLM_PROVIDER` | No | Defaults to `shinkai_free_trial` |
| `BATCHER_PORT` | No | Defaults to `3334` |

Frontend build-time variables live in `packages/frontend/.env.dev` and
`packages/frontend/.env.mainnet` (`VITE_API_URL`, `VITE_BATCHER_URL`, `VITE_L2_ADDRESS`,
`VITE_NAMESPACE`), plus `VITE_SOCIAL_WALLET_URL` in `packages/frontend/client/.env.dev`.

`link.sh` in the template root rewires the `@effectstream/*` dependencies to a local checkout of the
monorepo, which is what the repository's `LINK_LOCAL=1` test mode uses.

## Testing

```sh
bun run test
```

`packages/tests/run-tests.ts` drives the whole thing: it starts a second orchestrator stack from
`packages/tests/start.test.ts` (PGLite, Hardhat, sync node with
`ENABLE_DEV_AND_DEBUG_ENDPOINTS=true`, batcher), waits on the orchestrator's `/health` and
`/processes` endpoints, then runs two phases.

- **Phase A — infrastructure.** `packages/tests/infra/chain-ready.test.ts` and
  `packages/tests/infra/deploy.test.ts` confirm Hardhat is answering and the L2 contract deployed.
- **Phase B — state machine and API.** `packages/tests/stm/new-game.test.ts` writes
  `effectstreamSubmitGameInput(toHex(JSON.stringify(["newGame"])))` directly to the contract with
  viem and then asserts, over a real Postgres connection, that a `game` row and a
  `global_user_state` row appeared. `packages/tests/stm/api.test.ts` checks that
  `GET /api/game/tokens` reports a non-zero world pool.

The suite tears the stack down through the orchestrator's `/shutdown` endpoint and exits non-zero if
any assertion failed. It deliberately does not exercise the `ai` transition, which would require a
live Shinkai node.

## Where to go next

- [State machine](https://effectstream.io/home/components/state-machine) — transitions, the
  coroutine stream, and where `World.promise` fits
- [Wallets](https://effectstream.io/home/components/wallets) — `walletLogin`, `sendTransaction` and
  what `preferBatchedMode` changes
- [Batcher overview](https://effectstream.io/home/components/batcher/overview) — adapters, batching
  criteria and confirmation levels
- [Cardano integration](https://effectstream.io/home/chains/cardano) — CIP-30 and CIP-8 signature
  verification, including the login-only case this template uses
- [`evm-cardano` template](https://effectstream.io/home/templates/evm-cardano) — the sibling that
  *does* sync Cardano rather than only authenticating with it

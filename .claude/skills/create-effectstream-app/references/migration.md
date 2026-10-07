# Migration Guide

Use this only when porting an existing project. For new templates, follow the build order in `SKILL.md` — this file does not apply.

> **See also (concept docs).**
> - "What is Effectstream" (currently self-flagged as V1-era): `docs/site/docs/home/0-intro/1-what-is-effectstream.md`
> - Authoritative new-name list (per-package): `docs/site/docs/home/500-packages/500-packages.md`
> - `Stm` class (renamed from `PaimaSTM`): `docs/site/docs/home/500-packages/520-node/sm.md`
> - L2 contract rename `PaimaL2Contract.sol` → `EffectstreamL2Contract.sol`: `docs/site/docs/home/100-components/104-l2-contract.md`, `docs/site/docs/home/200-chains/212-contracts.md`

There are two migration paths:

1. **`@paimaexample/*` (effectstream-v1, Deno/Bun era)** — see [Migrating from `@paimaexample/*`](#migrating-from-paimaexample-templates).
2. **`@paima/*` (paima-engine-v1, Node.js era)** — see [Migrating from `@paima/*`](#migrating-from-paimaexample-templates). This is older and requires additional steps (eliminate middleware, TSOA, document.Paima global, PaimaParser grammar).

## Version lineage

| Era | SDK prefix | Runtime | Workspace pattern |
|---|---|---|---|
| paima-engine-v1 | `@paima/sdk`, `@paima/node-sdk` | Node.js | flat top-level (`api/`, `db/`, etc.) |
| effectstream-v1 | `@paimaexample/*` | Deno/Bun | nested (`packages/client/`, `packages/shared/`) |
| effectstream-v2 | `@effectstream/*` | Bun | flat `packages/*` |

Template-specific package scopes (e.g. `@chess/*`, `@my-template/*`) are an orthogonal naming choice — they evolve as templates get renamed, so they aren't a reliable era marker. Use the SDK prefix + runtime + workspace pattern to identify which migration you're doing.

After the structural migration, **everything in SKILL.md and the other reference files applies** — the layout, invariants, and gotchas are the same as for new templates.

---

## Migrating from `@paimaexample/*` Templates

Three templates still use the old `@paimaexample/*` SDK with a nested directory structure: **dice, rock-paper-scissors, multi-chain-token-transfer**. `world-map-2d` and `minimal` are already migrated to `@effectstream/*`; chess, night-bitcoin, and evm-midnight exist only as migrated `-v2` templates (`chess-v2`, `night-bitcoin-v2`, `evm-midnight-v2`). Resolve the target `@effectstream/*` version from npm instead of copying any template's pin.

### Step 1: Package namespace rename

Replace all `@paimaexample/*` imports with `@effectstream/*`:

| Old | New |
|---|---|
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

Also update internal template package names: `@chess/*`, `@dice/*`, etc. → `@my-template/*`.

### Step 2: Flatten directory structure

```
OLD:                                       NEW:
packages/client/node/                  →   packages/node/
packages/client/node/src/main.ts       →   packages/node/main.dev.ts
packages/client/node/src/state-machine.ts → packages/node/state-machine.ts
packages/client/node/src/api.ts        →   packages/node/api.ts
packages/client/node/scripts/start.ts  →   start.dev.ts (project root)
packages/client/database/              →   packages/database/
packages/client/batcher/               →   packages/batcher/
packages/shared/data-types/src/grammar.ts → packages/node/grammar.ts
packages/shared/data-types/src/localhostConfig.ts → packages/node/config.dev.ts
packages/shared/contracts/evm/         →   packages/contracts-evm/
packages/shared/contracts/midnight/    →   packages/contracts-midnight/
packages/shared/contracts/bitcoin/     →   packages/contracts-bitcoin/
packages/frontend/                     →   packages/frontend/
```

After flattening: delete `packages/client/`, `packages/shared/`, `packages/shared/data-types/`, `packages/shared/utils/` (merge needed utilities into node).

### Step 3: Remove round/match/tick executor abstraction

Templates chess, dice, and rock-paper-scissors have a layered abstraction in `packages/shared/game-logic/`:

```
OLD (delete entirely):
  tick.ts              → processTick(): applies one move to matchState, returns TickEvents
  round_executor.ts    → wraps processTick into a round-level loop
  match_executor.ts    → wraps round_executor into multi-round matches
  mod.ts               → initRoundExecutor(), extractMatchEnvironment(), buildMatchState()
```

In the new SDK, **the STM transition owns deterministic orchestration and database effects** — no round executors, tick events, or match executors. Pure domain rules may be called from a local module or a purpose-named package when multiple runtimes consume them.

```ts
// NEW: game logic inline in the transition
stm.addStateTransition("submitMoves", function* (data) {
  const { parsedInput, signerAddress: player, blockHeight, randomGenerator } = data;
  const { lobbyID, pgnMove, roundNumber } = parsedInput;

  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: lobbyID });
  if (!lobby || lobby.lobby_state !== "active") return;

  const chess = new Chess();
  chess.load(lobby.latest_match_state);
  try { chess.move(pgnMove); } catch { return; }

  const newFen = chess.fen();
  yield* World.resolve(insertMove, { lobby_id: lobbyID, round: roundNumber, wallet: player, move_pgn: pgnMove });
  yield* World.resolve(updateMatchState, { lobby_id: lobbyID, latest_match_state: newFen });

  if (chess.isGameOver()) {
    yield* World.resolve(endMatch, { lobby_id: lobbyID });
    yield* World.resolve(createScheduledData, { /* … */ });
  } else {
    yield* World.resolve(insertNewRound, { /* … */ });
    yield* World.resolve(createScheduledData, { block_height: blockHeight + lobby.round_length, /* … */ });
  }
});
```

**What to keep vs remove:**

| Keep (move to `packages/node/`, or a specific package such as `packages/chess-rules` when genuinely multi-consumer) | Remove entirely |
|---|---|
| Pure chess logic: `isValidMove`, `gameOver`, `updateBoard` | `round_executor.ts` |
| Rating calculation: `calculateRatingChange` | `match_executor.ts` |
| Helper types: `MatchState`, `MatchEnvironment` | `tick.ts` / `processTick` |
| Validation: `validateSubmittedMove` | `initRoundExecutor` / `buildMatchState` |
| | The `[PreparedQuery, params]` tuple pattern |

**Remove the `[PreparedQuery, params]` tuple pattern.** Old transitions return `SQLUpdate[]` (arrays of tuples) which the state-machine iterates and resolves. In the new SDK, yield directly:

```ts
// OLD: returns tuples
const result: SQLUpdate[] = await createdLobby(user, blockHeight, input, prando);
for (const [query, params] of result) yield* World.resolve(query, params);

// NEW: yield inline
yield* World.resolve(insertLobby, { lobby_id: id, creator: user, /* … */ });
yield* World.resolve(insertRound, { lobby_id: id, round: 1, /* … */ });
```

### Step 4: Merge remaining game-logic helpers

After removing the executor abstraction, keep single-consumer helpers beside the STM with a responsibility-based filename such as `chess-rules.ts`. If node and frontend both execute the same deterministic rules, create a purpose-named package such as `packages/chess-rules`. Delete `packages/shared/game-logic/` entirely; never replace it with another generic `shared`, `utils`, or `common` bucket.

### Step 5: Rename `PaimaSTM` → `Stm`

```ts
// OLD
import { PaimaSTM } from "@paimaexample/sm";
const stm = new PaimaSTM(grammar);

// NEW
import { Stm } from "@effectstream/sm";
const stm = new Stm<typeof grammar, {}>(grammar);
```

### Step 6: Update ConfigBuilder + split per env

- Update imports (`@paimaexample/config` → `@effectstream/config`).
- Move config from `packages/shared/data-types/src/localhostConfig.ts` → `packages/node/config.dev.ts`.
- Add `config.mainnet.ts` with env var validation (see `multi-env.md`).
- `addViemNetwork` helper replaces manual EVM network config objects.

### Step 7: Move start script to root

```ts
// OLD: packages/client/node/scripts/start.ts (programmatic start())
// NEW: start.dev.ts (project root, export default { ... } satisfies OrchestratorConfig)
```

### Step 8: Update entry point

```ts
// NEW: packages/node/main.dev.ts
import { init, start } from "@effectstream/runtime";
import { config } from "./config.dev.ts";
import { grammar } from "./grammar.ts";
import { appStateTransitions } from "./state-machine.ts";
```

All local imports within `packages/node/` — no cross-package grammar/config imports.

### Step 9: Update `package.json` workspaces

```json
// OLD
"workspaces": ["packages/client/*", "packages/shared/*", "packages/shared/**/*", "packages/frontend"]

// NEW
"workspaces": ["packages/*"]
```

Add `effectstream.default` and the new scripts (`dev`, `start:mainnet`, `test`, `build:pgtypes`, etc.).

### Step 10: Frontend server migration

Replace Oak / http-server / Express with Fastify + `@fastify/static` — see `references/frontend.md` for the canonical static server.

> ### Preserve user-facing UX during migration — don't redesign
>
> The migration's job at the frontend layer is **mechanical** (swap the wallet/transaction surface from the old SDK to `@effectstream/wallets`, swap the static server, retarget the bundler) — **not** to redesign the app. A template's interactive UI (chess board, dice game lobby, world grid, etc.) IS the template — losing the gameplay surface during migration changes the template's identity and is almost certainly a regression even when tests pass.
>
> **Rules:**
> 1. **Read the original `index.html` / React tree before touching it.** Identify every interactive element (grid cells, game pieces, lobby cards, etc.) and the on-click handlers that drove them. Preserve all of them.
> 2. **The wallet UI is *additive*.** Add a `Connect Browser Wallet` / `Connect Local Wallet` selector at the top (per template invariant), but don't strip the existing gameplay UI to make room. The existing UI stays; the wallet selector is the new neighbor.
> 3. **The only file-level rewrites you should make are at the API/SDK boundary.** Replace `import endpoints, { WalletMode } from './paimaMiddleware.js'` with direct `@effectstream/wallets` imports and a thin `window.<template>` namespace; keep every DOM operation, every game-state render call, every adjacency check, every CTA the user could click.
> 4. **Verify visually after migration.** Before declaring Phase C "passing", load the dev server (`bun run dev`, then visit `http://localhost:10599`) and confirm the gameplay surface still renders — grid cells visible, move buttons in the right places, color coding, auto-refresh, etc. A Playwright `[data-testid="world-grid"]`-style assertion catches gross loss of the gameplay surface; a manual visual check catches subtle regressions (cells unstyled, buttons missing on adjacent cells, etc.).
> 5. **If you genuinely need to rewrite the UI** (e.g. moving from raw DOM to React, or migrating off a deprecated game engine), do it in a **separate commit/PR after the migration is green** so the migration diff stays mechanical and reviewable.
>
> Failing this is the silent-quality killer of these migrations: the test suite goes green because Phase A/B still pass and Phase C only checks "the page mounts", while the actual interactive experience is gone. Add per-template-specific `data-testid` selectors for the load-bearing gameplay elements (grid, game pieces, lobby list) so Phase C catches their absence.

> ### Wallet UI: always expose both an injected and a local-JS wallet per chain
>
> Every migrated frontend that ships **any** wallet interaction must expose BOTH:
>
> 1. **An injected wallet** for production users — `WalletMode.EvmInjected` (MetaMask, Brave, Coinbase, …), `WalletMode.Cardano` (CIP-30: Nami, Eternl, …), `WalletMode.Midnight` (Lace).
> 2. **A local-JS wallet** for dev + headless e2e — `WalletMode.EvmViem`, `WalletMode.CardanoLocal`, `WalletMode.MidnightLocal`. These are pure-JS implementations in `@effectstream/wallets` — no browser extension required.
>
> **Prefer `WalletMode.EvmViem` over `WalletMode.EvmEthers`.** EvmViem takes a private key + RPC URL directly and builds the viem WalletClient in-process; EvmEthers requires a pre-built `ActiveConnection<EthersApi>` that the frontend must provide externally, which is a frontend-side implementation burden that doesn't add capability. For Cardano + Midnight, the `…Local` variants are the only local-JS choice.
>
> Two reasons this is non-negotiable:
> 1. **Headless e2e becomes possible.** A Playwright-driven Chromium can't install MetaMask, so the injected path is unreachable headless. The local-JS path runs entirely in-process — the headless browser can connect, sign, and submit, letting Phase C drive the full user flow (connect → grid render → submit move → API reflects move) instead of stopping at "the page mounts". `templates/world-map-2d/packages/tests/frontend/e2e.test.ts` is the reference.
> 2. **Dev ergonomics.** The local-JS wallet is the one a dev can click through repeatedly during development without funding accounts in a real extension. The injected option stays for users on real wallets.
>
> Reference UI: `templates/world-map-2d/packages/frontend/index.html` (vanilla JS, dual buttons) and `templates/evm-midnight-v2/packages/frontend/client/src/components/WalletModal.tsx` (MUI). The pattern is two clearly-labelled buttons (`Connect Browser Wallet` / `Connect Local Wallet (dev)`), each calling `walletLogin({ mode, … })` with the appropriate `LoginInfo`. Tag both with `data-testid` (`connect-browser-wallet` / `connect-local-wallet`) so the Phase C interaction tests can exercise both branches.
>
> **EvmViem `sendTransaction` works end-to-end** (a previously-documented engine gap is now closed). The EvmViem provider self-sequences writes through its viem `walletClient`, so a headless Playwright e2e can drive the *full* flow — connect → render → **submit a write** → API reflects it. Do NOT leave a `// TODO when EvmViem implements sendTransaction` stub or skip the write assertion; assert the write lands. (Caveat: a freshly-generated EvmViem private key has 0 gas on Hardhat — fund it from a known pre-funded Hardhat account before the first write. A hardcoded Hardhat key works too; the funding step is only needed if you generate keys.)

> ### Wallet connect gotchas (these bit *every* migrated template; the local-JS e2e MASKS them)
>
> - **`EvmInjected` requires a `preference`.** `walletLogin({ mode: WalletMode.EvmInjected, preferBatchedMode })` with no `preference` has no wallet to connect → returns `{ success: false }` ("Wallet login failed") for real users. Discover first with `allInjectedWallets({ signatureSupport, transactionSupport })`, then pass `preference: { name }`. The discovery entries are `ConnectionOption[]`, so read **`opt.metadata.name`** — NOT a top-level `opt.name` (that returns `undefined` and silently fails to connect). Always propagate `result.errorMessage` so the failure is legible.
> - **Local-JS e2e masks the browser path.** Phase C connects via `EvmViem`, which never exercises the `EvmInjected` discovery/preference path — so a broken browser-connect ships green. Add a Phase C interaction test that at least clicks the injected-connect CTA (it can't fully connect headless, but it catches the missing-`preference` / wrong-shape class of bug).
> - **Write-then-read is racy.** After a self-sequenced write (createLobby/join/…), the sync node indexes the new row a block or two AFTER the tx receipt resolves. A read that fires once immediately ("submitted but not found yet") will miss it — **poll** the indexed read for a few seconds.
> - **Dev wallet identity must be per-tab.** For local multi-player testing (two tabs = two players), persist the dev wallet in `sessionStorage` (per-tab). `localStorage` is shared across tabs → both tabs become the same player; URL params (`?account=`) get dropped/rewritten by redirects. Per-tab `sessionStorage` (or, cleanest, a freshly-generated funded key per tab) gives each tab a distinct identity.

> ### Game templates: rebuild client state from the server's exported state — never from a seed
>
> If the template reconstructs interactive game state in the browser (board, units, whose-turn), build it from the server's **exported game state** (`Game.import(gameState)` — the node API already serves it), NOT by re-running world-generation from a stored `seed` + replaying moves. The STM's per-block `randomGenerator` is **not reproducible** from a stored seed on the client, so a seed-based rebuild yields a *different* board than the server has. Then every player move is computed against the wrong state and silently rejected by the STM's move handler — the tx still returns `{ success: true }`, but no state changes; only engine-scheduled timeout ("zombie") skips advance the game, so moves appear to "do nothing" and a refresh shows the prior state. Importing the authoritative state keeps client == server; core engine ops (move/place/combat) are deterministic (no RNG), so incremental opponent-move replay then stays in sync. Reference fix: hex-battle `packages/frontend/src/frontend/pregame_screen.ts` `moveToGame`.

### Step 11: Remove `@ts-rest`

Chess uses `@ts-rest/core`. Replace with plain Fastify routes in `packages/node/api.ts` (see `grammar-stm.md` §4).

### Step 12: Batcher migration

Adopt the **fluent pattern (Pattern B)** for new code — see `references/batcher.md` for details. Old config-object pattern still works but mixes config and adapter wiring.

### Step 13: Custom primitives

`multi-chain-token-transfer` has `packages/shared/custom-primitive-mct-erc1155/`. In the new layout, custom primitives live inline in `packages/node/` (in `state-machine.ts` or a dedicated `primitives.ts`) and register via `userDefinedPrimitives` in `start()`. Delete the standalone package.

### Step 14: Add tests package

Old templates have no tests. Scaffold `packages/tests/` per `references/tests.md`.

### Migration Checklist (per template)

Verify each step before moving to the next:

- [ ] Rename all `@paimaexample/*` → `@effectstream/*`
- [ ] Flatten `packages/client/node/` → `packages/node/`
- [ ] Flatten `packages/client/database/` → `packages/database/`
- [ ] Flatten `packages/shared/contracts/{chain}/` → `packages/contracts-{chain}/`
- [ ] Each contract package compiles (`bun run build:evm` / `build:midnight`)
- [ ] Merge `packages/shared/data-types/` into `packages/node/`
- [ ] Set database script to use `@effectstream/db/scripts/pgtyped-update.ts`
- [ ] `bun run build:pgtypes` succeeds and `.queries.ts` files committed
- [ ] No SQL text outside `packages/database/sql/*.sql` and `packages/database/migrations/*.sql`; tests and recovery use generated typed queries
- [ ] Round/match/tick executor abstraction removed; STM owns orchestration and DB effects
- [ ] `[PreparedQuery, params]` tuple pattern removed
- [ ] Pure helpers moved beside their owner or into a purpose-named multi-consumer package
- [ ] `packages/shared/game-logic/`, `packages/shared/utils/`, `packages/shared/`, `packages/client/` deleted
- [ ] `PaimaSTM` → `Stm` with type parameters
- [ ] `scripts/start.ts` → root `start.dev.ts`
- [ ] `main.dev.ts` and `main.mainnet.ts` split out
- [ ] `config.dev.ts` and `config.mainnet.ts` split out
- [ ] Root `package.json` updated (workspaces, scripts, `effectstream.default`, `build:pgtypes`)
- [ ] Oak/http-server/Express replaced with Fastify
- [ ] `@ts-rest` removed
- [ ] Custom primitives migrated into `packages/node/`
- [ ] `packages/batcher/` with adapter factories + env-specific entry points
- [ ] `packages/tests/` with phases A, B, C
- [ ] **Frontend UX preserved** — original game grid / pieces / lobby UI is rendered, not replaced with placeholder inputs (see Step 10 banner). Add a `data-testid` on the load-bearing gameplay element (`world-grid`, `chess-board`, `lobby-list`, …) and assert it in Phase C `render.test.ts`.
- [ ] **Wallet UI is additive** — both `Connect Browser Wallet` (`WalletMode.EvmInjected`) and `Connect Local Wallet` (`WalletMode.EvmViem` for EVM — **not** `EvmEthers`; `CardanoLocal` / `MidnightLocal` per chain) are exposed in the frontend; the original gameplay UI is untouched (model: `templates/world-map-2d/packages/frontend/index.html`).
- [ ] **Headless e2e drives the local-JS wallet** — Phase C ships an `e2e.test.ts` that connects via `EvmViem` (or `CardanoLocal` / `MidnightLocal`) inside Playwright Chromium and asserts the gameplay surface renders correctly with the wallet's state (model: `templates/world-map-2d/packages/tests/frontend/e2e.test.ts`). This is the only Phase C tier that exercises the wallet path end-to-end.
- [ ] `bun run dev` works AND the gameplay surface is visibly rendered when you open the dev URL
- [ ] `bun run test` passes

---

## Migrating from `@paima/*` (paima-engine-v1)

The oldest template format uses `@paima/sdk` and `@paima/node-sdk` (Node.js runtime) with flat top-level workspaces (`api/`, `db/`, `middleware/`, `state-transition/`, etc.) and `@game/*` package prefixes.

### Key additional differences vs v1→v2

| Aspect | paima-engine-v1 | effectstream-v1 |
|---|---|---|
| Middleware | Full `@paima/sdk/mw-core` — bundled JS, `postConciseData`, `buildBackendQuery` | Thin wrapper (already being phased out) |
| Frontend integration | `document.Paima` injected global | Import-based |
| Parser | `PaimaParser` string grammar (`"ai = ai\|target\|id\|response"`) | Same but newer API |
| API layer | TSOA controllers with generated routes | `@ts-rest` or plain routes |
| Build | esbuild + tsc per workspace | Bun native |
| STF | `gameStateTransitionRouter(blockHeight)` returning async functions | Same pattern |

### Step 1: Eliminate middleware

Delete `@game/middleware` entirely. Replace:

**Write operations** → `sendTransaction` from `@effectstream/wallets` in the frontend:
```ts
// OLD
const conciseBuilder = builder.initialize(undefined);
conciseBuilder.setPrefix('ai');
conciseBuilder.addValue({ value: String(target) });
const result = await postConciseData(conciseBuilder.build(), errorFxn);

// NEW
import { sendTransaction } from "@effectstream/wallets";
await sendTransaction(wallet, ["ai", target, id, response], paimaConfig, "wait-effectstream-processed");
```

**Read operations** → Direct `fetch` to the sync node API:
```ts
// OLD
const query = buildBackendQuery('game/', { game_id: String(gameId) });
const res = await fetch(query);

// NEW
const res = await fetch(`http://localhost:9999/api/game?game_id=${gameId}`);
```

### Step 2: Remove TSOA → plain Fastify

Delete `api/`, `tsoa.json`, generated `routes.ts`. Write plain Fastify routes in `packages/node/api.ts`:

```ts
export const apiRouter: StartConfigApiRouter = async (server, dbConn) => {
  server.get("/api/game", async (request, reply) => {
    const { game_id } = request.query as { game_id: string };
    const result = await runPreparedQuery(
      getGameById.run({ id: parseInt(game_id, 10) }, dbConn),
      "/api/game",
    );
    reply.send({ stats: result[0] ?? null });
  });
};
```

### Step 3: Remove `document.Paima` global

```ts
// OLD: frontend/src/paima.ts
export const paima = (document as any).Paima as PaimaMW;

// NEW: direct imports
import { EffectstreamConfig, walletLogin, sendTransaction, WalletMode } from "@effectstream/wallets";
export const paimaConfig = new EffectstreamConfig("my-app", "mainEvmRPC", contractAddr, chain, undefined, batcherUrl, true);
```

### Step 4: PaimaParser grammar → Typebox grammar

```ts
// OLD
const myGrammar = `
    newGame = g|*x
    ai = ai|target|id|response
    tick = tick|n
`;
const parserCommands = {
  ai: { target: PaimaParser.NCharsParser(0, 100), id: PaimaParser.NumberParser(1, 100000), response: PaimaParser.NCharsParser(0, 1000) },
};

// NEW
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

In v2, the JSON array uses the full grammar key as the first element (no prefix aliases like `g`).

### Step 5: STF → Stm class

```ts
// OLD
export default async function (inputData, blockHeight, randomnessGenerator, dbConn): Promise<SQLUpdate[]> {
  const input = parse(inputData.inputData);
  switch (input.input) {
    case 'newGame': return await newGameCommand(input, user, userData);
    case 'ai': return await aiCommand(input, user, blockHeight, dbConn);
  }
}

// NEW
const stm = new Stm<typeof grammar, {}>(grammar);
stm.addStateTransition("newGame", function* (data) {
  const { signerAddress: user } = data;
  yield* World.resolve(createGlobalUserState, { wallet: user });
  yield* World.resolve(newGame, { wallet: user });
});
```

Key changes:
- No `Pool` parameter — use `yield* World.resolve(query, params)`
- No `SQLUpdate[]` return — yield directly inside the generator
- No `parse()` — `Stm` handles it via the grammar definition
- No `switch` — each grammar key gets its own `addStateTransition`
- Async ops: `yield* World.promise()` not `await`

### Step 6: Workspace layout migration

```
OLD                            NEW
api/                       →   (deleted — merged into packages/node/api.ts)
db/                        →   packages/database/
game-logic/                →   (deleted — inline into state-machine.ts)
middleware/                →   (deleted — replaced by @effectstream/wallets)
state-transition/          →   packages/node/state-machine.ts
utils/                     →   (deleted — merge constants into packages/node/)
frontend/                  →   packages/frontend/
contracts/evm/             →   packages/contracts-evm/
```

### Step 7: `@paima/sdk` subpath → `@effectstream/*`

| Old | New |
|---|---|
| `@paima/sdk/concise` | `@effectstream/concise` |
| `@paima/sdk/utils` | `@effectstream/utils` |
| `@paima/sdk/mw-core` | `@effectstream/wallets` (frontend) |
| `@paima/sdk/providers` | `@effectstream/wallets` |
| `@paima/sdk/prando` | Built-in via `data.randomGenerator` in STM transitions |
| `@paima/node-sdk/db` | `@effectstream/db` |
| `@paima/node-sdk` | `@effectstream/runtime` + `@effectstream/sm` |

### Paima-v1 migration checklist (delta from effectstream-v1 checklist)

- [ ] Delete `middleware/` (replaced by `@effectstream/wallets`)
- [ ] Delete `api/` + `tsoa.json` (replaced by plain Fastify in `packages/node/api.ts`)
- [ ] Delete `game-logic/` (inline helpers into state machine)
- [ ] Delete `utils/` (merge constants into node package)
- [ ] Move `db/` → `packages/database/` (update pgtyped config, paths)
- [ ] Move `state-transition/` → `packages/node/state-machine.ts`
- [ ] Move `contracts/evm/` → `packages/contracts-evm/`
- [ ] Move `frontend/` → `packages/frontend/` (modernize build to Vite)
- [ ] Remove `document.Paima` global; use direct `@effectstream/wallets` imports
- [ ] Convert PaimaParser string grammar → Typebox `GrammarDefinition`
- [ ] Convert `gameStateTransitionRouter` + `switch` → `Stm.addStateTransition` per key
- [ ] Convert `SQLUpdate[]` tuple returns → direct `yield* World.resolve()`
- [ ] Convert `createScheduledData(string, block)` → `createScheduledData(JSON.stringify([...]), block)`
- [ ] Replace esbuild + tsc with Bun native resolution
- [ ] Replace `axios` / `node-fetch` / custom HTTP clients with native `fetch`
- [ ] Add `packages/batcher/` with adapter factory pattern
- [ ] Add `packages/tests/` with phases A + B
- [ ] Create `start.dev.ts` at project root
- [ ] Update root `package.json` (workspaces, `effectstream.default`, scripts)
- [ ] Verify `bun run dev` + `bun run test`

---

## Module/class renames you'll hit across all migration paths

| Old name | New name | Package |
|---|---|---|
| `PaimaL2Contract.sol` | `EffectstreamL2Contract.sol` | `@effectstream/evm-contracts` |
| `PaimaEngineConfig` | `EffectstreamConfig` | `@effectstream/wallets` |
| `PaimaEventManager` | `EventManager` | `@effectstream/event-client` |
| `PaimaL2DefaultAdapter` | `EffectstreamL2DefaultAdapter` | `@effectstream/batcher-sdk` |
| `PaimaSTM` | `Stm` | `@effectstream/sm` |
| `@effectstream/orchestrator-v2` | `@effectstream/orchestrator` | (renamed) |
| `bunx orchestrator-v2 start` | `bunx orchestrator start` | (CLI renamed) |

Find remaining references with:
```
grep -r "PaimaL2\|PaimaEngine\|PaimaEvent\|PaimaSTM\|orchestrator-v2"
```

## After migration

Once structurally migrated, the rest of `SKILL.md` and the reference files apply to the codebase exactly as for new templates. In particular: run through the Verification checklist (compile contracts, build pgtypes, `bun run dev`, `bun run test`, `docker build`, `docker run … bun run test`) — old templates almost never have the Docker layer, the Phase C frontend test, or the workspace-symlink workaround in their Dockerfile if one exists.

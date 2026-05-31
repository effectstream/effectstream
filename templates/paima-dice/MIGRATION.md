# paima-dice — migration plan

This is a Group C migration: port from `@paima/*` (paima-engine-v1) at
`/home/eddie/paima-game-templates/paima-dice` to `@effectstream/*` (Bun 0.100.18).

## Source

- Repo: `/home/eddie/paima-game-templates/paima-dice` (`@paima/dice@1.0.0`)
- Top-level dirs: `api/`, `contracts/`, `db/`, `frontend/`, `game-logic/`,
  `middleware/`
- Dep scope: `@paima/build-utils@2.2.0`, `@paima/sdk@2.2.0`,
  `@paima/node-sdk@2.2.0`, `@paima/evm-contracts@1.1.0`
- Build: `npx tsc --build`, Jest tests, npm workspaces (not bun)

## Target shape (canonical reference: `templates/minimal/`)

```
templates/paima-dice/
├── packages/
│   ├── node/           ← state machine + sync entrypoint (was `game-logic/`, `state-transition/`)
│   ├── database/       ← pgtyped migrations  (was `db/`)
│   ├── contracts-evm/  ← Hardhat + Forge contracts (was `contracts/`)
│   ├── frontend/       ← Vite + @effectstream/wallets (was `frontend/`)
│   └── tests/          ← orchestrated test phases (NEW)
├── link.sh             ← model after `templates/minimal/link.sh`
├── start.dev.ts        ← model after `templates/minimal`
└── package.json        ← workspaces: ["packages/*"]
```

## Per the `create-effectstream-app` skill's migration delta for `@paima/*`

(See `.claude/skills/create-effectstream-app/references/migration.md`.)

- **Delete**: `middleware/` (paima-sdk middleware), `api/` (TSOA controllers + generated `routes.ts`), `tsoa.json`, `document.Paima` injected global, `game-logic/utils/` (use native `fetch`).
- **Convert**: `PaimaParser` string grammar (`"ai = ai|target|id"`) → Typebox `GrammarDefinition`.
- **Convert**: `gameStateTransitionRouter(blockHeight)` + `switch` + `SQLUpdate[]` → `Stm.addStateTransition()` per key with `yield* World.resolve()`.
- **Move**: `db/` → `packages/database/`; `state-transition/` (if present) → `packages/node/state-machine.ts`.
- **Replace**: `axios`/`node-fetch` → native `fetch`.
- **Add**: `packages/batcher/` (if needed) and `packages/tests/` modeled after `templates/cardano-delegation/packages/tests/`.
- **Wallet UI**: browser + local-js EVM via `@effectstream/wallets` (`evm-viem` / `EvmEthers`) — model after `templates/evm-midnight-v2/packages/frontend/client/src/components/WalletModal.tsx`.

## Verification (when complete)

1. `bun install` exit 0.
2. `bun run build:evm` (Hardhat + Forge artifacts).
3. `bun run build:pgtypes` (`.queries.ts` exists).
4. `bun run dev` boots cleanly.
5. `LINK_LOCAL=1 bun run templates/run-template-tests.ts paima-dice` exit 0.
6. Frontend wallet UI shows both browser + local-js EVM options.

## Status

WIP — branch created, mechanical scope rename + restructure not yet started.
Tracked in `/home/eddie/.claude/plans/rosy-sparking-parnas.md`.

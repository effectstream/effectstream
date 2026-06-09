# hex-battle — migration plan

Group C: port from `@paima/*` (paima-engine-v1) at
`/home/eddie/paima-game-templates/hex-battle` to `@effectstream/*` (Bun 0.100.18).

## Source
- Repo: `/home/eddie/paima-game-templates/hex-battle`
- Top-level dirs: `backend/`, `engine/`, `frontend/` (no root package.json; non-monorepo layout)
- Dep scope: **no root package.json** — inspect each sub-project's package.json (`backend/`, `engine/`, `frontend/`)
- Build: `npx tsc --build`, npm workspaces (not bun)
- **Sharp edge**: hex-battle does not have a top-level `package.json`, so the migration must first decide on a workspace shape (`packages/*`) before any dep wrangling is meaningful. Read `backend/package.json` and `engine/package.json` to determine actual deps + scope.

## Target (canonical: `templates/minimal/`)
- `packages/{node,database,contracts-evm,frontend,tests}`
- `link.sh` modeled after `templates/minimal/link.sh`
- `start.dev.ts` at template root

## Per-skill delta for `@paima/*` migrations
(See `.claude/skills/create-effectstream-app/references/migration.md`.)
- **Delete**: `middleware/`, `api/` (TSOA), `tsoa.json`, `document.Paima` global, `utils/`.
- **Convert**: `PaimaParser` grammar → Typebox `GrammarDefinition`; `gameStateTransitionRouter` → `Stm.addStateTransition()` with `yield* World.resolve()`.
- **Move**: `db/` → `packages/database/`; `state-transition/` → `packages/node/state-machine.ts`.
- **Replace**: `axios`/`node-fetch` → native `fetch`.
- **Add**: `packages/batcher/` (if needed); `packages/tests/` modeled on `templates/cardano-delegation/packages/tests/`.
- **Wallet UI**: browser + local-js EVM via `@effectstream/wallets` (`evm-viem` / `EvmEthers`) — pattern: `templates/evm-midnight-v2/packages/frontend/client/src/components/WalletModal.tsx`.

## Verification (when complete)
1. `bun install` exit 0
2. `bun run build:evm` ok
3. `bun run build:pgtypes` ok
4. `bun run dev` boots cleanly
5. `LINK_LOCAL=1 bun run templates/run-template-tests.ts hex-battle` exit 0
6. Frontend wallet UI shows both browser + local-js EVM options

## Status
WIP — branch created, semantic port not started. Tracked in `/home/eddie/.claude/plans/rosy-sparking-parnas.md`.

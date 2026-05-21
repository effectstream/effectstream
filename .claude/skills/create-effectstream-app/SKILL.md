---
name: create-effectstream-app
description: Scaffold a new Effectstream template (a multi-chain blockchain app — sync node + state machine + on-chain contracts + optional batcher/frontend/tests/Docker) following the canonical Bun-monorepo layout. Also handles migrating older templates from `@paimaexample/*` or `@paima/*` (paima-engine-v1) layouts into the current `@effectstream/*` shape. Use this skill whenever the user wants to create, scaffold, generate, bootstrap, or start a new Effectstream / Paima app, dApp, game template, or multi-chain template — even if they don't say "template" — and whenever they want to upgrade, modernize, port, or migrate an existing Paima or Effectstream project to the v2 layout.
---

# create-effectstream-app

Effectstream templates are standalone Bun monorepos that wire together: on-chain contracts, a sync node with a state machine, a typed database, an orchestrator that runs the whole local stack with `bun run dev`, and (optionally) a batcher / frontend / test suite / Dockerfile. Every template uses the same flat `packages/*` layout — complexity is additive (more packages), not structural (deeper nesting).

This skill exists because there are ~80 sharp edges (Bun workspace symlinking, Midnight version pinning, pgtyped working-dir, Foundry-vs-Hardhat artifact split, MQTT broker on Bun, contract address resolution timing, batcher namespace matching, …) that an agent will not discover from reading the repo alone. Most of them only blow up at runtime, in Docker, or when the user actually opens the page in a browser — i.e. after the agent has already declared success.

**Workflow choice — make this decision first:**
- **Create a new template (95% case)** → start with [Discovery](#discovery-confirm-scope-with-the-user-before-scaffolding) below, then follow [Build order](#build-order).
- **Migrate an existing Paima/Effectstream-v1 project** → jump to `references/migration.md`. The rest of this file still applies after the structural migration.

> ## Verification is mandatory — read this before you write any code
>
> A scaffold that hasn't been run is not a scaffold; it's a draft. Half the sharp edges this skill exists to avoid only surface at runtime, in Docker, or when the user opens the page in a browser. Static review of the generated files will not catch them.
>
> **The rules:**
>
> 1. **`bun run dev` MUST run at least once before you report completion.** Not `tsc`, not `vite build`, not "looks right to me" — the actual full-stack boot. If you can't get to it, the task is not done.
> 2. **Verify incrementally, one step at a time.** Don't batch `bun install && bun run build:evm && bun run build:midnight && bun run dev` into one command — when something breaks you won't know which step. Run each separately and check the exit code / output before moving to the next.
> 3. **Stop on the first failure.** Fix the actual problem before continuing. Don't paper over it with `|| true`, don't skip ahead and hope a later step fixes it, don't add a TODO and move on.
> 4. **Probe the environment before scaffolding.** Run `which bun 2>&1` always; then run the `which` check from the **Tools** section of each chain reference the template will use (`references/chains/<chain>.md`). Add `docker --version` if Docker was requested. If a tool needed by the template is missing, tell the user **before** writing 60+ files you can't verify. Do NOT default to "the user probably doesn't have these installed" — check.
> 5. **When reporting, quote the verification trail.** Default assumption in your final message is "I ran it and here's what happened" — not "you should run this." If a step genuinely failed and you couldn't fix it, name the exact command, the exact error, and what you tried. See [What to give the user when you're done](#what-to-give-the-user-when-youre-done).
>
> Full per-step acceptance criteria in [Verification — mandatory, incremental, stop on error](#verification--mandatory-incremental-stop-on-error).

## Discovery — confirm scope with the user before scaffolding

**Don't pick chains, contracts, or primitives by default — these are user decisions with real production consequences.** Suggest options, present trade-offs, then wait for explicit confirmation before writing any code.

This phase looks like a short interview, not a code change. Run it even if the user's prompt sounds complete — the prompt almost never spells out cost or deployment implications, and the wrong default is much more expensive than a thirty-second clarifying conversation.

### 1. Which chain(s)?

Each chain a template indexes costs **real money in production** — an RPC provider or self-hosted node, an indexer process per chain, monitoring per chain. Each chain also doubles the local-dev orchestrator surface (more processes to boot, more failure modes, longer `bun run test`). So:

- Confirm **the minimal chain set** that satisfies the use case. If the user says "I want a Cardano + Midnight game," push back: do both chains have a real role, or is one of them speculative? Single-chain templates are 2-3× simpler to operate.
- Surface the cost: "Each chain you target needs an indexer running 24/7 in production. Are you OK with that for `<chain>`?" — especially for Cardano (Dolos + UTxO-RPC) and Midnight (node + indexer + proof-server) which are heavier than EVM.
- Match the chain to the feature: if the only requirement is "watch ADA transfers to an address," that's Cardano-only; don't add EVM. If the user wants ZK private state, Midnight is the only choice. If the user just wants tokens, EVM is usually enough.

Don't proceed until the user has named the chains explicitly.

### 2. Which contract(s) — and does the use case even need contracts?

Contracts come with the highest cost: **the user has to deploy them**, audit them, manage upgrades, and pay deployment gas. The agent doesn't deploy contracts; the user does. So:

- Enumerate what the use case actually needs on-chain. For a "watch incoming ADA" template, **no contract** is needed — the engine reads native transfers via the `cardanoTransfer` primitive. Adding a contract here would be cost and complexity for nothing.
- If contracts are needed, propose the minimal interface (e.g. "a single ERC-721 contract extending OpenZeppelin's `ERC721`") and let the user accept, modify, or replace it.
- Mention deployment: "You'll need to deploy this to <chain> mainnet. Want me to scaffold a deploy script and a placeholder address that's env-var configurable?"
- Cross-check against the primitive surface (next step) — sometimes a built-in primitive removes the need for a custom contract entirely.

### 3. Which primitives?

**Primitives are how the engine sees on-chain events.** Many use cases don't need contracts at all — they need a built-in primitive that watches a chain-native event:

- `cardanoTransfer` / `cardanoMintBurn` / `cardanoPoolDelegation` — watch Cardano without deploying anything.
- `evmErc20` / `evmErc721` / `evmErc1155` — watch existing token contracts without deploying your own.
- `bitcoinAddress` — watch a Bitcoin address.
- `midnightGeneric` — read Midnight ledger contract state (still needs the Midnight contract deployed, but it might be an existing one).
- Midnight `nullifier` tracking — read NULLIFIERS without owning the contract.

These primitives **must still be explicitly confirmed with the user** — they shape the indexer's read pattern, the database schema, and the STM grammar. Ask: "I'm planning to use `<primitive>` to watch `<event>` on `<chain>`. That's a read-only watch — no contract deployment required. OK?"

The default-unless-asked rule: don't add primitives the user didn't sign off on. Several primitives are opt-in for cost reasons — see Core invariant §9 and the relevant `references/chains/{chain}.md` § **Sharp edges** for which primitives those are.

### 4. State machine design

Once chains, contracts, and primitives are confirmed, **design the STM with the user before writing transitions**. The STM is where every write to the DB happens; getting its shape wrong means rewriting all the dependent layers. Specifically:

- **All writes go through the STM.** The HTTP API is **GET-only by default** — `/api/*` routes read from the database but never write. This is what keeps the system deterministic (every replay produces the same state) and crash-safe (no double-writes on retry). Do not generate `POST` / `PATCH` / `DELETE` routes without an explicit user request, and even then, treat that as an escape hatch and document why determinism doesn't matter for that endpoint.
- **One transition per user-meaningful action.** For each grammar key, ask the user what the on-chain trigger is (a tx? a chain event? a scheduled tick?) and what the resulting DB writes should be. Sketch the input → state-transition → DB-write chain before scaffolding.
- **Ask clarifying questions.** If the user said "store ADA sent to my address," reasonable questions are: only `lovelace` amount, or full UTxO metadata? Do we care about the sender too? Should multiple incoming UTxOs in one tx be one row or several? What's the unique constraint — `(tx_hash, output_index)`? Asking up front is much cheaper than reshaping the schema later.
- **Echo back the design** in a short bullet list before scaffolding (`grammar.ts` keys, STM transitions, DB tables, API endpoints). Get the user's "yes" on that summary before writing code.

If anything is ambiguous, ASK. The skill assumes you'll do the interview; downstream steps are written for the case where chains + contracts + primitives + STM are already agreed.

## Core invariants (the rules that keep the template buildable)

These hold across every Effectstream template. Violating any of them produces errors that are slow to diagnose because they surface far from the cause.

1. **Flat `packages/*` layout, no `client/`, `shared/`, or `src/` wrapper dirs.** Grammar, config, STM, and API all live directly in `packages/node/`. The orchestrator config (`start.dev.ts`) lives at the project root, not inside the node package.
2. **No raw SQL outside `packages/database/sql/*.sql` and `packages/database/migrations/*.sql`.** Every other file (state machine, API routes, tests) must use pgtyped-generated `PreparedQuery` objects exported from `@my-template/database`. Use `World.resolve(query, params)` inside STM transitions and `runPreparedQuery(query.run(params, dbConn), label)` in API routes. The one exception is reading the engine's internal `effectstream.sync_protocol_pagination` table for NTP recovery — that schema isn't owned by the template.

   **NEVER hand-write `*.queries.ts` files.** These files contain byte-offset `locs` arrays that pgtyped uses to substitute parameters into the SQL string. A hand-written `locs` that's off by even one character produces malformed SQL → Postgres aborts the transaction → the sync node crashes mid-STM with `current transaction is aborted (code 25P02)`, hiding the original error. The bug is invisible to TypeScript (the `IQueryParams` interface still typechecks) and invisible to static review (the file looks plausible). It only surfaces at runtime under a real integration test. The file MUST be generated by running `bun run build:pgtypes` (which invokes `@effectstream/db/scripts/pgtyped-update.ts`). Commit the generated output — but if you find yourself typing `.queries.ts` content into a `Write` tool call, STOP and run the script instead. There is no "I'll just stub it out" shortcut here; the byte offsets cannot be eyeballed.
3. **All `@effectstream/*` packages share a single coordinated version.** Never mix `0.100.13` and `0.100.5` across `@effectstream/*` deps. To find the version to pin: (a) **query npm first** with `npm view @effectstream/orchestrator version` (any `@effectstream/*` package works; they're always co-versioned). (b) If npm returns nothing, **fall back to the `"version"` field of the engine monorepo's root `package.json`** — find it by walking up from the cwd looking for a `package.json` that has a `packages/effectstream-sdk/` sibling, or ask the user where the engine repo lives. (c) If neither works, **ask the user explicitly** rather than guessing. Never leave `<latest>` placeholders — `bun install` won't resolve them.
4. **Declare every sibling import as `workspace:*` in the importer's `package.json`.** Bun resolves these through the workspace graph (no `node_modules/<scope>/<pkg>` symlinks are needed on Mac). E.g. `packages/node/package.json` must include `"@my-template/database": "workspace:*"` and `"@my-template/contracts-evm": "workspace:*"`; without these declarations the import fails at runtime with `Cannot find module '@my-template/database'`. The reference templates use `workspace:*` everywhere — match that. Some chains have nested workspace subpackages that need to be listed explicitly in the root `workspaces` array because `packages/*` doesn't recurse (see the relevant `references/chains/{chain}.md`). Docker is the exception where workspace resolution doesn't "just work" — the Dockerfile creates the symlinks inline after `bun install` (see `references/docker.md`). `link.sh` is **not part of a normal template** — it's an advanced helper for engine+template co-iteration only; do not generate one by default.
5. **Always use `{ cwd: path.join(root, "packages/contracts-X") }`, never `{ resolveFrom }`, for chain launchers.** `resolveFrom` goes through `require.resolve` which lives in Bun's `.bun/` cache and breaks both locally (resolves the wrong path) and in Docker (no `node_modules/@my-template/*` symlinks). `cwd` uses direct filesystem paths and works everywhere.
6. **Compile every contract package before building anything that depends on it.** Each chain has its own build script (`bun run build:<chain>`); after SQL changes also run `bun run build:pgtypes`. Cascading failures from skipped compile steps are the #1 cause of "the node won't start" debugging sessions. Per-chain build commands live in `references/chains/{chain}.md`.
7. **Multi-environment uses file-name suffixes (`config.dev.ts` / `config.mainnet.ts`), not env-var switches.** Each environment has its own entry point (`main.dev.ts` / `main.mainnet.ts`) that imports its corresponding config. The orchestrator runs only in dev — mainnet runs the node directly.
8. **`BatcherConfig.namespace` and the frontend's `EffectstreamConfig` `appName` must match exactly.** A mismatch produces `401 Invalid signature` from the batcher's `/send-input` endpoint — the signed message contains `appName`, the batcher validates against `namespace`.
9. **Some chain primitives are opt-in because of indexing/runtime cost — confirm with the user before adding any of them.** Default-on primitives scan every block of every chain they target; adding one speculatively means the production indexer does extra RPC work forever. The per-chain reference files enumerate which primitives are opt-in vs default (e.g. EVM's `PrimitiveTypeEVMEffectstreamL2`, Cardano's `CARDANO_SUBMIT_TX` dev process, Midnight's nullifier tracking). When the user has confirmed a primitive is needed, the chain file has the wiring; when they haven't, leave it out — the symptoms of a missing-but-needed primitive are silent ("blocks finalize but the row never appears"), so the right time to confirm is during [Discovery](#discovery-confirm-scope-with-the-user-before-scaffolding), not later.

## Build order

Follow this order strictly. Each step depends on the previous one being verified-working. Don't try to scaffold everything in parallel and then debug — verify each layer in turn.

For each step the right-hand column tells you which reference file to load. Don't preload them; load on demand to keep context lean.

| # | Step | Reference to load | Concept docs (read on demand) |
|---|------|-------------------|-------------------------------|
| 0 | **Discovery is done** (chains, contracts, primitives, STM design confirmed with the user — see [Discovery](#discovery-confirm-scope-with-the-user-before-scaffolding)). Pick a template name → `@my-template/*` scope. | `references/architecture.md` | `docs/site/docs/home/0-intro/1-what-is-effectstream.md`, `docs/site/docs/home/100-components/100-components.md`, `docs/site/docs/home/200-chains/200-chains.md` (chain Feature Support Matrix) |
| 1 | Root `package.json` (workspaces, `effectstream.default`, scripts). | `references/architecture.md` | `docs/site/docs/home/500-packages/550-tools/orchestrator.md` (consumer of `effectstream.default`) |
| 2 | `start.dev.ts` at project root (orchestrator config — declares chains/services). | `references/orchestrator.md` | `docs/site/docs/home/100-components/106-processes.md`, `docs/site/docs/home/500-packages/550-tools/orchestrator.md` |
| 3 | For each chain: `packages/contracts-{chain}/`. **Compile and verify before moving on.** | `references/chains/{chain}.md` | `docs/site/docs/home/100-components/105-contracts.md`, `docs/site/docs/home/200-chains/211-contracts.md`, `docs/site/docs/home/200-chains/{201-evm,202-midnight,203-cardano,204-avail,205-bitcoin,209-celestia,210-near}.md` |
| 4 | `packages/database/` (migrations + pgtyped `.sql`). **Run `bun run build:pgtypes` to generate `sql/*.queries.ts` — never write the generated file by hand (see Core invariant §2). Verify the script exits 0 before moving on.** | `references/database.md` | `docs/site/docs/home/100-components/109-database.md`, `docs/site/docs/home/1000-effectstream-engine/1002-database.md` (three-schema split: `effectstream`/`primitives`/`public`), `docs/site/docs/home/500-packages/520-node/db.md` |
| 5 | `packages/node/` (grammar → config.dev.ts → state-machine.ts → api.ts → main.dev.ts). | `references/grammar-stm.md` | `docs/site/docs/home/100-components/102-state-machine.md`, `docs/site/docs/home/100-components/111-grammar.md` (incl. `&`-reserved keys + `mapPrimitivesToGrammar`), `docs/site/docs/home/100-components/103-api.md`, `docs/site/docs/home/100-components/117-node-startup.md`, `docs/site/docs/home/100-components/118-primitives.md`, `docs/site/docs/home/100-components/113-randomness.md`, `docs/site/docs/home/500-packages/520-node/{sm,runtime}.md` |
| 6 | (optional) `packages/batcher/` with adapter factories + `batcher.dev.ts`. | `references/batcher.md` | `docs/site/docs/home/100-components/108-batcher/{1200-overview,1220-core-concepts,1240-configuration}.md`, `docs/site/docs/home/500-packages/550-tools/batcher-sdk.md` |
| 7 | (optional) `packages/frontend/`. | `references/frontend.md` | `docs/site/docs/home/100-components/115-frontend.md`, `docs/site/docs/home/100-components/112-wallets.md`, `docs/site/docs/home/500-packages/{550-tools/frontend-sdk,510-sdk/wallets}.md` |
| 8 | `packages/tests/` — phases A (infra) and B (STM+DB+API) MANDATORY for every template; C (frontend) if a frontend exists. The test contents adapt to whichever chains the template targets — the structure is constant. Source of truth: `templates/evm-midnight-v2/packages/tests/`. **A template without tests is unfinished — the tests are how anyone (including you) knows the scaffold actually boots and indexes.** | `references/tests.md` | (skill-only; docs have no Phase A/B/C testing concept) |
| 9 | (optional) `config.mainnet.ts`, `main.mainnet.ts`, `batcher.mainnet.ts`, `"start:mainnet"` script. **Every `*.mainnet.ts` file MUST start with a "PLACEHOLDER FOR PRODUCTION" disclaimer comment** telling the user to replace hard-coded values and source secrets from env vars — see the multi-env reference for the exact block. | `references/multi-env.md` | `docs/site/docs/home/300-deployment/301-deploy-game.md`, `docs/site/docs/home/100-components/199-environment-variables.md` |
| 10 | (**optional, only if the user asks for containerization**) `Dockerfile` + `.dockerignore`. Most templates don't need Docker on day one — skip unless the user explicitly requests it. | `references/docker.md` | (skill-only; docs have no Docker section) |
| 11 | `README.md` at project root following the canonical structure. | `references/readme.md` | (skill-only style guide) |
| 12 | **Verify — MANDATORY, incremental, stop on error.** Run each command separately and check it succeeded before moving to the next: `bun install` → `bun run build:evm` (per chain) → `bun run build:midnight` → `bun run build:pgtypes` → `bun run dev` (must reach a known boot state) → `bun run test`. If Docker was requested, also `docker build` then `docker run <image> bun run test`. Don't report completion until at least `bun run dev` has booted. Full criteria: [Verification — mandatory, incremental, stop on error](#verification--mandatory-incremental-stop-on-error). | — | — |

### Why orchestrator before contracts

The orchestrator declares which chains the template targets, which fixes the set of contract packages you need to create and the npm scripts each one must expose for its launcher (`launchEvm` needs `hardhat:start`, `launchMidnight` needs `midnight-node:start`, etc.). Designing contracts first leads to mismatches with the launcher's expectations.

### Why grammar before state machine

The grammar (`grammar.ts`) is referenced via `typeof grammar` in `new Stm<typeof grammar, {}>(grammar)`, so the state machine's `addStateTransition("key", ...)` calls and `parsedInput` types come from it. Writing transitions before the grammar means rewriting them.

### Why compile + pgtypes before node

`packages/node/` imports `@my-template/contracts-evm` (for `contractAddressesEvmMain()`) and `@my-template/database` (for the `PreparedQuery` exports). Both are generated outputs — uncompiled contract artifacts produce `export {}`; missing `.queries.ts` files leave the imports unresolvable. The node won't even typecheck.

## Decision cheat sheet (for the Discovery interview)

Use these to frame trade-offs for the user — they don't override the rule that **the user makes the call**.

**Chains.** Suggest the smallest set: EVM if the use case is fungible-token / NFT / arbitrary contract logic. Midnight only when ZK / private state is required. Cardano when stake-pool, UTxO, or native-asset semantics matter. Bitcoin when watching addresses or ordinals. Multi-chain templates (EVM + Midnight, EVM + Cardano) are common but every additional chain doubles the orchestrator/test surface AND adds an indexer cost in production.

**Batcher.** Suggest yes if the frontend submits user transactions and you want gasless UX or time/size amortization. Suggest no if the frontend builds and submits transactions directly (e.g. Cardano via Lucid Evolution). A no-batcher app's node API stays GET-only.

**Frontend.** Suggest yes if the user wants a UI for wallet connection + on-chain writes via the batcher. Suggest no if the user just wants an indexer with an HTTP read API. Don't scaffold a frontend that does nothing.

**Mainnet support.** Suggest yes for anything shippable. Skip only for local-only experimentation. Mainnet implies a `*.mainnet.ts` set with env-var validation and a "PLACEHOLDER FOR PRODUCTION" disclaimer at the top of each file (see `references/multi-env.md`).

**Docker.** Suggest no unless the user asks for containerization. Most templates don't need Docker on day one.

## Verification — mandatory, incremental, stop on error

**Verification is not optional. The scaffold is not done until `bun run dev` has booted to a known state (success, or a specific recorded failure you couldn't fix).** See the banner at the top of this file for the rules. This section gives the per-step acceptance criteria.

### Ground rules

- **One step at a time.** Run each command separately. Do NOT chain them with `&&` or `;` — when something breaks, you need to know which step. The cost of running six commands instead of one is trivial compared to debugging a batched failure.
- **Stop on the first failure.** Don't continue with later steps hoping they'll mask the earlier one. Don't add `|| true`, `--ignore-scripts`, `--force`, or `--no-verify` to work around an error. Diagnose, fix, re-run the failed step, then move on.
- **Check, don't assume.** Look at the actual exit code and output before declaring success. `bun install` printing `error:` and exiting non-zero is a failure, even if it produced some `node_modules/`.
- **Tools may already be installed.** Before reporting "I couldn't run X because Y isn't available," actually try to run X. The engine monorepo and developer machines typically have `bun`, `forge`, `compact`, `docker` installed; assume they're there until a command actually fails.

### Step 0 — Environment probe (do this BEFORE scaffolding)

Run `which bun 2>&1` first — if `bun` is missing, stop immediately. You can't build or verify anything without it.

Then, for **each chain the template targets**, open the chain's reference file and run the `which` command from its **Tools (probe before scaffolding)** section. The chain reference is the source of truth for what binaries each chain needs and what to do if one is missing:

| Chain | Reference (Tools section) |
|---|---|
| EVM | `references/chains/evm.md` — needs `forge` |
| Midnight | `references/chains/midnight.md` — needs `compact` |
| Cardano | `references/chains/cardano.md` |
| Bitcoin | `references/chains/bitcoin.md` |
| Avail | `references/chains/avail.md` |
| Celestia | `references/chains/celestia.md` |
| NEAR | `references/chains/near.md` |

If Docker was requested, also run `docker --version 2>&1`.

If a chain's required tool is missing, surface this to the user **before** writing any code — don't scaffold something you can't verify. When adding a new chain to the skill, add its tool list to the chain's own reference (not here) so the entry-point remains a router.

### Step 1 — `bun install`

Run at the project root. **Accept only:** exit code 0, no `error:` lines in stderr. Workspace sibling deps declared as `workspace:*` resolve through Bun's workspace graph (no `node_modules/<scope>/<pkg>` symlinks expected or needed on Mac).

**Common failures:**
- `error: package "@effectstream/X" not found` → version pinned to a tag that doesn't exist on npm. Check `npm view @effectstream/orchestrator version` and re-pin.
- `Cannot find package @midnight-ntwrk/wallet-sdk-address-format` later at runtime → add it to the **root** `package.json` (phantom dep).

### Step 2 — `bun run build:<chain>` (per chain in the template)

Run the per-chain build script for every chain the template targets. Each one is `bun run build:<chain>` (e.g. `build:evm`, `build:midnight`, `build:near`).

**Accept only:** exit code 0 AND the chain's generated artifacts exist and are non-empty (not `export {}`). Until this passes, `packages/node/` can't import the chain's generated bindings and won't typecheck. Per-chain acceptance criteria (which artifact path to check, what counts as "non-empty") live in `references/chains/{chain}.md`. If a build fails with version-mismatch or toolchain errors, the chain file's **Sharp edges** is the first place to look.

### Step 3 — `bun run build:pgtypes`

**Accept only:** exit code 0 AND `packages/database/sql/*.queries.ts` files exist AND are non-empty AND contain `PreparedQuery` instances (not `export {}`). Empty output means the script ran from the wrong cwd — use the root script, not raw pgtyped.

### Step 4 — `bun run dev` (MANDATORY — every template must reach this)

**This step is required before reporting completion.** It's the only verification that catches runtime issues like missing `workspace:*` declarations, `Cannot find module` errors, port collisions, and orchestrator-config bugs that all earlier static checks miss.

**Accept only one of:**
- **Success path:** Orchestrator boots, chain nodes are up on expected ports (8545 / 9944 / 8088 / etc.), sync node logs `indexing block N`, no `Cannot find module` or `current transaction is aborted` errors. Then `Ctrl-C` cleanly. Record the highest block height observed.
- **Recorded-failure path:** A specific command failed with a specific error message. Quote both verbatim in your final report. Do NOT round "didn't reach a stable state" off to "looks fine."

**The wrong outcomes:**
- "I didn't run it because the user probably doesn't have `<tool>`" — check before assuming, see Step 0 and the chain file's **Tools** section.
- "I ran `tsc` and it typechecked" — typechecking does not verify boot.
- "It ran for 30 seconds, looked OK, I killed it" — record what state it reached. "Looked OK" is not an acceptance criterion.

If `bun run dev` doesn't terminate on its own (which it shouldn't — it's a long-running process), let it run until you see the sync node indexing AND any chain-specific deployment processes complete, then stop it cleanly. Use the orchestrator's `stop` command or `Ctrl-C`, not `kill -9`.

### Step 5 — `bun run test`

**Accept only:** Phase A passes (chains up), Phase B passes (tx → DB → API round trip), and Phase C passes if a frontend exists. The Playwright render test in Phase C catches Vite/browser-only bugs that `vite build` succeeds on (e.g., `node-fetch` polyfill blowing up at mount). If any phase fails, fix the underlying issue — don't skip the phase.

### Step 6 — `docker build` *(only if Docker was opted in)*

**Accept only:** exit code 0. Catches missing chain-specific system deps and the workspace-symlink workaround. Bun on Linux does NOT resolve workspace siblings the way it does on Mac, so the Dockerfile MUST create `node_modules/<scope>/<pkg>` symlinks inline after `bun install`. Per-chain Docker requirements (system deps to install, binaries to vendor) are in `references/docker.md` and the relevant `references/chains/{chain}.md`.

### Step 7 — `docker run <image> bun run test` *(only if Docker)*

**Accept only:** the in-container test run passes. Catches `cwd` vs `resolveFrom` issues in the orchestrator config that only fail on Linux/Docker.

## Sharp edges you will hit if you skip the references

These are the **chain-agnostic** failure modes that have wasted the most engineering time. Each one has full context in the linked reference file — flagging them here so the agent recognizes the cryptic error when it happens.

- **`Cannot find module '@my-template/database'`** at runtime, despite `bun install` succeeding → the importer's `package.json` is missing `"@my-template/database": "workspace:*"`. Bun resolves siblings through the workspace graph but only for declared deps. In Docker, also confirm the Dockerfile creates the inline workspace symlinks (Linux doesn't resolve them automatically). → `references/architecture.md`, `references/docker.md`
- **`Cannot find module '@midnight-ntwrk/wallet-sdk-address-format'`** → it's a phantom dependency (declared by no one but required at runtime). Every template must add it to the root `package.json`. → `references/multi-env.md`
- **`401 Invalid signature` from batcher `/send-input`** → `BatcherConfig.namespace` ≠ frontend `EffectstreamConfig.appName`. Both must equal the same string (often `""` or the template name). → `references/batcher.md`
- **pgtyped generates empty `.queries.ts`** → script was run from the wrong working directory. Always run via `bun run build:pgtypes`. → `references/database.md`
- **Sync node crashes with `current transaction is aborted (code 25P02)` after submitting a tx** → the `.queries.ts` byte-offset `locs` are wrong, almost always because someone hand-wrote the file. Run `bun run build:pgtypes` to regenerate. The 25P02 is a cascade error; the real error is whatever pgtyped's malformed substitution produced one statement earlier. → Core invariant §2, `references/database.md`
- **Frontend builds fine but blank page in browser** → `node-fetch` in the bundle calls `require("fs").promises` at module init. Alias it to a native-fetch shim in `vite.config.ts`. The Playwright render test catches this; `vite build` doesn't. → `references/frontend.md`
- **MQTT BlockWatcher silently never fires** → Bun's `ws` module is missing `createWebSocketStream`. Frontend must set `VITE_IS_BUN=true` to fall back to HTTP `/block-heights` polling. → `references/frontend.md`
- **Orchestrator works locally but `Cannot find module @my-template/contracts-X` in Docker** → the orchestrator launcher uses `resolveFrom` instead of `cwd`. → `references/orchestrator.md`

**Chain-specific sharp edges** (Midnight version matrix, Cardano `CARDANO_SUBMIT_TX` filter, EVM `PrimitiveTypeEVMEffectstreamL2` opt-in, NEAR Rust toolchain, …) live in each chain's reference file under its **Sharp edges** section. Always read `references/chains/{chain}.md` for every chain the template targets before scaffolding it.

## What to give the user when you're done

**Do not report completion until `bun run dev` has booted to a known state.** See [Verification — mandatory, incremental, stop on error](#verification--mandatory-incremental-stop-on-error). Once it has, report:

1. **Where it is** — full path to the template directory.
2. **What chains/features it includes** — e.g. "EVM (Hardhat) + batcher + Vite/React frontend + Phase A/B/C tests + Dockerfile + mainnet config".
3. **How to run it** — `bun install && bun run dev`, plus the frontend URL (default `http://localhost:10599`).
4. **Verification trail — quote what you actually ran, in order.** Default framing is "I ran it and here's what happened," not "you should run this." For each step in [Verification](#verification--mandatory-incremental-stop-on-error), name the command, the exit code or key output (highest block height, contract address, test count), and any errors. Example: `bun install` → exit 0; `bun run build:evm` → `Erc1155DevModule#MCT_ERC1155` deployed to `0x5FbD…`; `bun run dev` → orchestrator booted, sync node at block 14, frontend responding at http://localhost:10599. If a step failed and you couldn't fix it, name the **exact** command and **exact** error verbatim, plus what you tried — don't paraphrase. Speculating "the tools are probably not installed" without checking is not an acceptable failure mode.
5. **Next steps that the user must do** — e.g. fill in real RPC URLs for `config.mainnet.ts`, customize the grammar/STM for actual app logic (the scaffold ships with a placeholder `createRoom` example).

## Engine features to know about (don't reinvent these)

Before adding custom code, check whether the engine already ships the feature. The docs (under `docs/site/docs/home/`) are the source of truth for concepts; this skill is the source of truth for operational gotchas. Specifically:

- **`&`-prefixed grammar keys are reserved for engine system commands.** Built-ins include `&B` (batched inputs), `&createAccount`, `&linkAddress`, `&unlinkAddress`. Never define a custom grammar key starting with `&`. See `docs/site/docs/home/100-components/104-l2-contract.md` and `docs/site/docs/home/100-components/111-grammar.md`.
- **EffectStream Accounts** (multi-wallet linking, primary address). If the user needs "the same user across multiple wallets," wire up `&createAccount` / `&linkAddress` rather than rolling your own. See `docs/site/docs/home/100-components/116-accounts.md`.
- **Deterministic randomness** via `data.randomGenerator` (Prando-based, seeded by block hash). Calls are stateful — call order matters for determinism. See `docs/site/docs/home/100-components/113-randomness.md`.
- **PRC-1 Achievements** — built-in HTTP surface for leaderboards and achievement metadata. If the user mentions achievements or leaderboards, use `export const achievements` instead of bespoke endpoints. See `docs/site/docs/home/100-components/114-achievements.md` and `docs/site/docs/home/400-paima-standards/prc1.md`.
- **`mapPrimitivesToGrammar` helper** auto-derives grammar entries from primitives — shrinks `grammar.ts` substantially when you have many chain primitives. See `docs/site/docs/home/100-components/111-grammar.md`.
- **Three database schemas** — `effectstream` (engine internals like `sync_protocol_pagination`), `primitives` (per-primitive tracking), `public` (your tables). See `docs/site/docs/home/1000-effectstream-engine/1002-database.md`. Knowing the split disambiguates "engine table vs my table" when writing custom queries.
- **`/api/*` built-in endpoints** — `/health`, `/block-heights`, `/addresses`, `/scheduled-data`, `/tables/:name`, `/primitives/:name`, `/rpc/evm`, `/grammar`, and an OpenAPI explorer at `/documentation`. Don't add a redundant custom `/health`. See `docs/site/docs/home/100-components/103-api.md`.
- **Orchestrator CLI** is more than just `start` and `stop`: `status`, `restart <name>`, `logs <name>`, `silence/unsilence`, `list`. Useful for README and operations guidance. See `docs/site/docs/home/500-packages/550-tools/orchestrator.md`.
- **PRCs (Paima/Effectstream standards)** — PRC-1 achievements, PRC-6 Midnight dApp metrics, etc. If the user is building a discoverable or interoperable app, reference the relevant PRC. See `docs/site/docs/home/400-paima-standards/`.
- **`db-emulator`** for in-memory unit tests (no real PGLite). Skill's `references/tests.md` uses real PGLite; emulator is a faster alternative for narrow unit tests. See `docs/site/docs/home/500-packages/520-node/db-emulator.md`.
- **`@effectstream/precompile`** — for compiling Compact/zkir at build time. See `docs/site/docs/home/500-packages/510-sdk/precompile.md`.
- **`config.dev.resetPublicData`** — development flag that truncates the `public` schema on each boot. Useful in templates with a "reset" command. See `docs/site/docs/home/100-components/117-node-startup.md` and `docs/site/docs/home/1000-effectstream-engine/1002-database.md`.

## When NOT to use this skill

This skill scaffolds the **structure**. It does not write the application's actual game/business logic — the grammar, STM transitions, and DB schema you'll generate are placeholders meant to be replaced. If the user is asking to add a new action to an existing template, edit a state-machine transition, fix a bug, or modify game rules, just edit the relevant file directly; you don't need this skill's full workflow.

Likewise, if the user is asking conceptual questions about Effectstream architecture without intending to create a new project, answer directly — don't trigger this skill to dump references. Point them at the right doc under `docs/site/docs/home/` instead.

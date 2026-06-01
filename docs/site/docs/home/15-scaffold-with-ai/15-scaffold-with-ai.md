---
sidebar_position: 15
slug: /scaffold-with-ai
---

# Scaffold with AI

EffectStream ships a Claude Code skill - **`create-effectstream-app`** - that scaffolds new templates end-to-end (orchestrator, sync node, state machine, database, optional batcher / frontend / tests / Docker) from a single English prompt. It encodes the canonical Bun monorepo layout, the per-chain operational gotchas, and the verification trail you'd otherwise have to learn by hitting each pitfall once.

This page is a quick guide. The source of truth is the skill itself at [`.claude/skills/create-effectstream-app/`](https://github.com/effectstream/effectstream/tree/v-next/.claude/skills/create-effectstream-app) in this repository (`SKILL.md` + 14 reference files).

## When to use it

- **Use it** to bootstrap a new app: the agent runs a short interview about chains/contracts/primitives/batchers, generates the full file tree, and verifies the result with `bun install && bun run dev && bun run test` before reporting back.
- **Don't use it** to add a feature to an existing template, fix a bug, or explain a concept. For incremental edits, just describe the change and Claude will edit the relevant file directly. The skill's full workflow is overkill for a one-file change.

## How to invoke it

The skill is installed automatically when you open this repository in [Claude Code](https://www.anthropic.com/claude-code) - Claude discovers it from `.claude/skills/`. You don't need to manually run anything; just describe what you want:

> Create a new template called `payment-tracker` that watches an ERC-20 contract on Arbitrum and exposes a leaderboard API.

The agent will recognize the intent ("create / scaffold / bootstrap a new Effectstream template"), load the skill, and start with the Discovery interview.

## What the Discovery interview asks

Before writing any code, the skill makes the agent confirm six things with you. **Each one has ongoing production cost, so the agent suggests and you decide** - defaults are never silent.

| Axis | What you're picking | Why it matters |
|---|---|---|
| **Chains** | The exact chain list | Each chain = indexer + RPC + monitoring running 24/7 in production |
| **Sync protocols** | `startBlockHeight`, `pollingInterval`, `confirmationDepth` per chain | RPC calls per block; reorg safety vs latency |
| **Primitives** | Which built-in primitives watch which events | Per-block scan work - adds up across chains |
| **Contracts** | What you'll deploy (or nothing, if a primitive covers it) | You deploy them, audit them, manage upgrades |
| **Batchers** | Per-chain yes/no, with criteria | Long-running process + custodial key + namespace coordination |
| **State machine** | Grammar keys + transitions + DB tables | Shape of the rewrite if it changes later |

If your initial prompt doesn't answer all six, the agent will ask. Quick prompts get a quick interview; detailed prompts skip past confirmed items.

## Keep the initial prompt simple - iterate from there

The cheapest path is **architecture first, features incrementally**. A successful scaffolding session looks like:

1. **First prompt** - focus on the *core* shape. Name the chains, the contracts (or "none - read-only via primitive X"), and whether you need a frontend. Don't try to nail down the API surface, frontend design, or state-machine details in the first message. Example: *"Create a Cardano-only template that watches ADA transfers to a configurable address and exposes a GET API. Include a minimal Lucid frontend."*
2. **Second prompt** - once the agent reports `bun run dev` and `bun run test` green, **iterate on one layer at a time.** Don't ask for "frontend + advanced contract management + custom STM grammar + extra API routes" in a single follow-up; each one wants different reference material.

Good follow-up cadence:

| Layer | Typical follow-up prompt |
|---|---|
| **Frontend** | "Add a Send 5 ADA button using Lucid that pulls the YACI test key for dev." |
| **Contracts** | "Add a second EVM contract for the burn flow; the existing NFT contract stays." |
| **State machine** | "Add a `claim` transition that requires a prior `mint` row in the DB." |
| **API** | "Add a `/leaderboard` endpoint joining the existing `transfers` table with addresses." |
| **Mainnet / deployment** | "Generate `config.mainnet.ts` with env-var validation. Use Arbitrum One." |

This pattern works because the skill's references are organized by layer (`grammar-stm.md`, `frontend.md`, `database.md`, `batcher.md`, …) - the agent loads only what each step needs and verifies each layer in turn. Trying to do everything in one prompt makes the agent context-juggle six concerns at once and write more code than it can verify.

## What verification looks like

The skill is strict about not declaring success until things have actually been run. After scaffolding, the agent runs (and reports the result of) each step:

1. `bun install` - exit 0
2. `bun run build:<chain>` per chain - exit 0 + artifacts present
3. `bun run build:pgtypes` - exit 0 + non-empty `.queries.ts`
4. `bun run dev` - orchestrator boots, sync node indexes blocks, no `Cannot find module` errors
5. `bun run test` - Phase A (infra) + Phase B (submit-tx → DB → API round trip) + Phase C (frontend build + render + click-flow)
6. Optional: `docker build` + `docker run <image> bun run test` - only if you asked for Docker

If any step fails, the agent stops and reports the exact command + exact error. It won't paper over runtime issues with `|| true` or `// TODO`. If `bun run dev` couldn't reach a stable state, the task isn't done - that's by design.

## Common starting points

If you don't know what to ask for, these are good first prompts. Each one results in a runnable template after the Discovery interview:

- **EVM-only NFT indexer**: *"Watch an ERC-721 contract's Transfer events and expose them via a GET API."*
- **Cardano ADA watcher**: *"Index incoming ADA transfers to a configurable wallet and surface them in a React frontend with a 'Send 5 ADA' demo."*
- **Bitcoin address watcher**: *"Track Bitcoin payments to a regtest address. Read-only API and a simple list view."*
- **NEAR fungible-token tracker**: *"Deploy a NEP-141 token and index its transfer events into a leaderboard."*
- **Midnight counter**: *"A Compact counter contract whose state increments are indexed and displayed in a React app."*
- **Avail blob watcher**: *"Index data-availability blobs for a configurable app-id."*
- **Celestia blob watcher**: *"Subscribe to a Celestia namespace and store incoming blobs in Postgres."*

For multi-chain (EVM + Midnight, etc.), the same pattern applies - name both chains and the bridge logic between them, but start with the indexer scaffold and add the bridge in a follow-up.

## When things go wrong

Real-world prompts surface real-world bugs. The skill's been hardened across two full eval iterations (all seven supported chains × backend + frontend + integration tests, 152/152 assertions in both runs) and several real-use generations on top of that. Most operational gotchas are documented. If you hit something that's NOT in the chain reference files, that's a skill bug - file an issue or PR against `.claude/skills/create-effectstream-app/`.

## Further reading

- The skill's [`SKILL.md`](https://github.com/effectstream/effectstream/blob/v-next/.claude/skills/create-effectstream-app/SKILL.md) - the canonical workflow + core invariants.
- Per-chain references under [`.claude/skills/create-effectstream-app/references/chains/`](https://github.com/effectstream/effectstream/tree/v-next/.claude/skills/create-effectstream-app/references/chains) - every sharp edge per chain.
- [Anthropic Claude Code](https://www.anthropic.com/claude-code) - the AI coding tool that runs the skill.
- [Anthropic Skills documentation](https://docs.claude.com/en/docs/agents/skills) - how Claude Skills work in general.

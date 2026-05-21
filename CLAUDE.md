# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Effectstream (formerly Paima Engine) is a multi-chain blockchain application framework. It's a Bun-based monorepo with 38 publishable packages. Full sync + batcher support: EVM, Midnight, Bitcoin, Cardano, Avail, Celestia, NEAR. Wallet-connect + signature-verify only (no L1 sync yet): Polkadot, Mina, Algorand.

## Common Commands

```bash
# Unit tests
bun test ./packages

# E2E tests (runs all chain suites serially)
cd e2e && bun run runner.ts

# Run a single test file
bun test packages/path/to/file.test.ts

# Publish packages (dry-run by default, add --publish for real)
bun run publish-bun.effectstream.ts
bun run publish-bun.effectstream.ts --publish --allow-uncommitted

# Unpublish/deprecate bad versions (dry-run by default)
bun run unpublish-bun.effectstream.ts

# Local multi-chain dev environment (orchestrator CLI)
# --background runs as a daemon and exposes an HTTP API.
# status, logs, and restart require the daemon to be running (i.e. start with --background first).
bun packages/build-tools/orchestrator/src/cli.ts start --background
bun packages/build-tools/orchestrator/src/cli.ts status
bun packages/build-tools/orchestrator/src/cli.ts logs [name]      # follow daemon logs; omit name to follow all
bun packages/build-tools/orchestrator/src/cli.ts restart <name>   # restart a single process
bun packages/build-tools/orchestrator/src/cli.ts stop             # stop everything (frees up ports)

# IMPORTANT: always run `stop` before launching the orchestrator again or
# starting tests, so ports from the previous run are cleaned up.

# Select e2e suites (see e2e/runner.ts):
bun run e2e/runner.ts celestia                       # run only celestia
bun run e2e/runner.ts evm bitcoin                    # run a subset
DISABLE_EVM=1 DISABLE_AVAIL=1 bun run e2e/runner.ts  # exclude by env var (older form, still works)

# Docs (from docs/site/)
bun install
bun run start                # dev server with live reload (syncs READMEs + docusaurus start)
bun run build                # production build
```

## Architecture

### Workspace Layout

- **`packages/effectstream-sdk/`** — Core SDK split into 10 modules: config, events, crypto, wallets, log, precompile, concise (type-safe schemas), chain-types, coroutine, utils
- **`packages/node-sdk/`** — Runtime engine: db (PostgreSQL/PgLite), db-emulator (in-memory for tests), events (MQTT broker / event server), runtime, sm (state machine DSL + builtin primitives), sync (per-chain fetchers + sync protocols), node (main entrypoint that re-exports everything)
- **`packages/chains/`** — Per-chain smart contract interfaces: evm-contracts, evm-hardhat, bitcoin-contracts, cardano-contracts, midnight-contracts, avail-contracts
- **`packages/binaries/`** — NPM-wrapped blockchain node binaries (midnight-node, bitcoin-core, near-sandbox, etc.)
- **`packages/batcher/`** — Cross-chain transaction batching: core SDK, adapters, batch-data-builder, Fastify server
- **`packages/build-tools/`** — orchestrator (multi-chain local env), explorer (deprecated). `tui/` is internal sources only, not a publishable package.
- **`packages/frontend/`** — React frontend SDK
- **`e2e/`** — Integration test suites per chain, run serially via `runner.ts`
- **`templates/`** — 16 starter project templates (minimal, evm-midnight-v2, chess-v2, preorder, etc.). Five legacy templates (dice, rock-paper-scissors, world-map-2d, night-bitcoin, multi-chain-token-transfer) still use `@paimaexample/*` 0.3.x and have not been migrated to `@effectstream/*`.
- **`docs/site/`** — Docusaurus 3 documentation site (built with Bun). Package READMEs are the source of truth and are auto-synced into `docs/site/docs/home/500-packages/**` by `docs/site/scripts/sync-package-readmes.ts`.

### Module System

Packages use dual exports — `exports.bun` points to `.ts` source for development, `exports.import` for published JS. Internal dependencies use `workspace:*` protocol, which the publish script replaces with concrete versions before publishing and restores after.

### Key Patterns

- All packages share a coordinated version (currently 0.100.x), bumped together during publish
- Only `@effectstream/frontend-sdk` requires a build step before publishing
- The orchestrator manages local blockchain nodes with a dependency graph (e.g., deploy-contracts depends on hardhat being ready)
- E2E tests run serially because chain processes share ports
- Chain support can be toggled via `DISABLE_*` env vars

### Docs Site

Located in `docs/site/`, uses Docusaurus 3 with Bun. Has a swizzled `src/theme/Mermaid/` component wrapping the default with `BrowserOnly` to fix SSG crashes. Content lives in `docs/site/docs/home/` with numbered directory prefixes for ordering. English-only (no `i18n/` directory).

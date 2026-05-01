# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Effectstream (formerly Paima Engine) is a multi-chain blockchain application framework. It's a Bun-based monorepo with ~40+ publishable packages supporting EVM, Midnight, Bitcoin, Cardano, Avail, Celestia, and NEAR chains.

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

# Local multi-chain dev environment
bun packages/build-tools/orchestrator/src/cli.ts start
bun packages/build-tools/orchestrator/src/cli.ts status

# Disable specific chains in orchestrator/e2e
DISABLE_EVM=true DISABLE_BITCOIN=true bun run ...

# Docs (from docs/site/)
deno install --allow-scripts
npx docusaurus start        # dev server with live reload
npx docusaurus build         # production build
```

## Architecture

### Workspace Layout

- **`packages/effectstream-sdk/`** — Core SDK split into 10 modules: config, events, crypto, wallets, log, precompile, concise (type-safe schemas), chain-types, coroutine, utils
- **`packages/node-sdk/`** — Runtime engine: db (PostgreSQL/PgLite), db-emulator (in-memory for tests), runtime, sm (state machine DSL), node (main entrypoint that re-exports everything)
- **`packages/chains/`** — Per-chain smart contract interfaces: evm-contracts, evm-hardhat, bitcoin-contracts, cardano-contracts, midnight-contracts, avail-contracts
- **`packages/binaries/`** — NPM-wrapped blockchain node binaries (midnight-node, bitcoin-core, near-sandbox, etc.)
- **`packages/batcher/`** — Cross-chain transaction batching: core SDK, adapters, batch-data-builder, Fastify server
- **`packages/build-tools/`** — orchestrator (multi-chain local env), explorer, tui
- **`packages/frontend/`** — React frontend SDK
- **`e2e/`** — Integration test suites per chain, run serially via `runner.ts`
- **`templates/`** — 8 starter project templates (minimal, chess, dice, evm-midnight, etc.)
- **`docs/site/`** — Docusaurus 3 documentation site (built with Deno)

### Module System

Packages use dual exports — `exports.bun` points to `.ts` source for development, `exports.import` for published JS. Internal dependencies use `workspace:*` protocol, which the publish script replaces with concrete versions before publishing and restores after.

### Key Patterns

- All packages share a coordinated version (currently 0.100.x), bumped together during publish
- Only `@effectstream/frontend-sdk` requires a build step before publishing
- The orchestrator manages local blockchain nodes with a dependency graph (e.g., deploy-contracts depends on hardhat being ready)
- E2E tests run serially because chain processes share ports
- Chain support can be toggled via `DISABLE_*` env vars

### Docs Site

Located in `docs/site/`, uses Docusaurus 3 with Deno. Has a swizzled `src/theme/Mermaid/` component wrapping the default with `BrowserOnly` to fix SSG crashes. Content lives in `docs/site/docs/home/` with numbered directory prefixes for ordering. Supports English and Japanese locales.

# Multi-Environment Pattern

Templates support multiple deployment environments through **file-name suffixes**, not runtime env-var switches. Each env-aware component has a `*.dev.ts` (local) and optionally a `*.mainnet.ts` (production).

> **See also (concept docs).**
> - Environment variables reference (`EFFECTSTREAM_ENV` and friends): `docs/site/docs/home/100-components/199-environment-variables.md`
> - Deployment guidance (stub today; will be the canonical home as it's expanded): `docs/site/docs/home/300-deployment/301-deploy-game.md`
> - System database schema (`effectstream.sync_protocol_pagination` for NTP recovery): `docs/site/docs/home/1000-effectstream-engine/1002-database.md`

```
packages/node/config.dev.ts            # Local chains (Hardhat, local Midnight, etc.)
packages/node/config.mainnet.ts        # Real chains (Arbitrum, Midnight mainnet, etc.)
packages/node/main.dev.ts              # Imports config.dev.ts
packages/node/main.mainnet.ts          # Imports config.mainnet.ts
packages/batcher/effectstream-l2.ts    # Adapter factory (env-agnostic)
packages/batcher/batcher.dev.ts        # Entry (dev) — hard-coded dev defaults
packages/batcher/batcher.mainnet.ts    # Entry (mainnet) — validates env vars
start.dev.ts                           # Orchestrator: all local services
start.mainnet.ts                       # (optional) Orchestrator: production services
```

## How the scripts wire up

```json
{
  "scripts": {
    "dev": "NODE_ENV=development bunx orchestrator start",
    "start:mainnet": "bun run packages/node/main.mainnet.ts"
  },
  "effectstream": { "default": "start.dev.ts" }
}
```

- Dev uses the orchestrator (manages local chain nodes, contracts deploy, etc.).
- Mainnet runs the node **directly** — there's no local infrastructure to orchestrate. Real chains are remote.

## Every `*.mainnet.ts` file MUST start with a placeholder disclaimer

The mainnet configs you scaffold are starting points, not production-ready code. Always prepend this comment block (or equivalent) so users don't accidentally ship the scaffold's defaults:

```ts
// ⚠️ PLACEHOLDER FOR PRODUCTION — review every value before deploying.
//
// This file is a starting point only. Before going to production:
//   • Replace every hard-coded chain ID, contract address, and start block
//     with values for YOUR deployment.
//   • Source ALL secrets (private keys, RPC API keys) from environment
//     variables — never commit them. The env-var validation at the top of
//     this file should fail loudly if anything is missing.
//   • Tune `pollingInterval`, `stepSize`, `confirmationDepth` for the
//     specific chain you're targeting (mainnet finality assumptions differ).
//   • Pin the @effectstream/* version to the release tag you've tested
//     against, not just "latest".
```

## Mainnet configs MUST validate env vars at the top

```ts
const EVM_RPC_URL = process.env.EVM_RPC_URL;
if (!EVM_RPC_URL) throw new Error("EVM_RPC_URL is required for mainnet");

const EVM_START_BLOCK = process.env.EVM_START_BLOCK;
if (!EVM_START_BLOCK) throw new Error("EVM_START_BLOCK is required for mainnet");
```

Fail fast at startup, not 30 seconds later mid-sync.

Mainnet `config.mainnet.ts` also typically:
- Uses real chain definitions (e.g. `arbitrum` from `viem/chains` with custom RPC overridden)
- Sets production-appropriate `pollingInterval`, `stepSize`, `confirmationDepth`

## The disclaimer also belongs in:

Apply the same placeholder header (adapting the bullet list) to any file that ships with production-relevant defaults the user will need to overwrite:

- `packages/node/main.mainnet.ts`
- `packages/batcher/batcher.mainnet.ts`
- `start.mainnet.ts` (if you create one)
- Any `.env.example` you ship — make it clear every value is a placeholder

Do **not** ship a `.env` or `.env.mainnet` with real-looking defaults — only `.env.example` with comments like `EVM_RPC_URL=https://your-rpc-url` so the user has to fill it in deliberately.

## NTP start-time recovery (deterministic replay)

For deterministic replay across restarts, recover the NTP `startTime` with the engine's typed `getPage` prepared query. Do not inline SQL just because the table belongs to the engine schema.

```ts
import { getConnection, getPage, runPreparedQuery } from "@effectstream/db";

let launchStartTime = Date.now(); // default on first boot

const dbConn = getConnection();
try {
  const [firstPage] = await runPreparedQuery(
    getPage.run({ protocol_name: mainSyncProtocolName }, dbConn),
    "config:getInitialNtpPage",
  );
  if (firstPage) {
    const page = firstPage.page as { root: number };
    launchStartTime = page.root - (firstPage.page_number * 1000);
  }
} catch { /* DB not initialized yet */ }
```

## Phantom dependency every template needs

`@midnight-ntwrk/midnight-js-utils` imports `@midnightntwrk/wallet-sdk-address-format` at runtime but does **not** declare it in its own `package.json`. The chain is: `@effectstream/orchestrator` → `@effectstream/db` → `@effectstream/sync` → `@midnight-ntwrk/midnight-js-indexer-public-data-provider` → `@midnight-ntwrk/midnight-js-utils` → (undeclared) `@midnightntwrk/wallet-sdk-address-format`.

In the engine monorepo this works because the package is hoisted. Standalone templates fail at runtime with `Cannot find module '@midnightntwrk/wallet-sdk-address-format'`. **Every template** (even non-Midnight ones) must add it to the root `package.json`:

```json
"dependencies": {
  "@midnightntwrk/wallet-sdk-address-format": "3.1.2"
}
```

## Environment variables templates actually use

The orchestrator CLI does **not** interpret `DISABLE_*` chain toggles. The engine repository implements selected flags in its own root config and e2e runner, but generated templates should not copy that machinery unless the user explicitly requests it. Environment selection is the file split above (`config.dev.ts` / `config.mainnet.ts`, `main.dev.ts` / `main.mainnet.ts`), plus a few engine env vars (registry: `packages/effectstream-sdk/utils/src/config.ts`):

- `NODE_ENV=development` — set by the `dev` script
- `EFFECTSTREAM_ENV` — if set, the engine loads `.env.${EFFECTSTREAM_ENV}` via dotenv
- `PGLITE=true` — use embedded PGLite instead of PostgreSQL (set on the sync process in `start.dev.ts`); `PGLITE_DATA_DIR` overrides its data directory

## WASM runtime workaround (Midnight)

`@midnight-ntwrk/onchain-runtime` must be imported **at the top of `main.ts` before any other Midnight imports**, otherwise the WASM module fails to initialize at runtime:

```ts
import "@midnight-ntwrk/onchain-runtime";
```

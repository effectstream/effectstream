# Multi-Environment Pattern

Templates support multiple deployment environments through **file-name suffixes**, not runtime env-var switches. Each env-aware component has a `*.dev.ts` (local) and optionally a `*.mainnet.ts` (production).

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

## NTP start-time recovery (deterministic replay)

For deterministic replay across restarts, the NTP `startTime` should be recovered from the database. This is one of the few places **raw SQL is acceptable** because it reads the engine's internal `effectstream.sync_protocol_pagination` table — not the application schema, so no pgtyped binding exists.

```ts
import { getConnection } from "@effectstream/db";

let launchStartTime = Date.now(); // default on first boot

const dbConn = getConnection();
try {
  const result = await dbConn.query(`
    SELECT * FROM effectstream.sync_protocol_pagination
    WHERE protocol_name = '${mainSyncProtocolName}'
    ORDER BY page_number ASC LIMIT 1
  `);
  if (result?.rows.length) {
    launchStartTime = result.rows[0].page.root - (result.rows[0].page_number * 1000);
  }
} catch { /* DB not initialized yet */ }
```

## Phantom dependency every template needs

`@midnight-ntwrk/midnight-js-utils` imports `@midnight-ntwrk/wallet-sdk-address-format` at runtime but does **not** declare it in its own `package.json`. The chain is: `@effectstream/orchestrator` → `@effectstream/db` → `@effectstream/sync` → `@midnight-ntwrk/midnight-js-indexer-public-data-provider` → `@midnight-ntwrk/midnight-js-utils` → (undeclared) `@midnight-ntwrk/wallet-sdk-address-format`.

In the engine monorepo this works because the package is hoisted. Standalone templates fail at runtime with `Cannot find module '@midnight-ntwrk/wallet-sdk-address-format'`. **Every template** (even non-Midnight ones) must add it to the root `package.json`:

```json
"dependencies": {
  "@midnight-ntwrk/wallet-sdk-address-format": "3.1.0"
}
```

## `DISABLE_*` env vars for optional chains

Multi-chain templates should support running without optional chain toolchains. Wrap top-level imports from optional packages in dynamic imports:

```ts
const midnightEnabled = !isEnvTrue("DISABLE_MIDNIGHT");
const midnight = midnightEnabled
  ? await (async () => {
      const { readMidnightContract } = await import("@effectstream/midnight-contracts/read-contract");
      const { midnightNetworkConfig } = await import("@effectstream/midnight-contracts/midnight-env");
      const CounterContract = await import("@my-template/midnight-contract/contract");
      return { readMidnightContract, midnightNetworkConfig, CounterContract };
    })()
  : null;
```

Apply this in `config.ts`, `main.ts`, and batcher configs. Use `critical: midnightEnabled` on frontend/batcher processes so a missing Midnight toolchain doesn't take the orchestrator down.

### Managed-directory stubs for `DISABLE_MIDNIGHT` mode

The Midnight contract package's `_index.ts` re-exports from `./managed/contract/index.js` (Compact compiler output). For the frontend to build without the compiler:

- `src/managed/contract/index.js` — minimal `Contract` class + `ledger` function that throw "not compiled" errors
- `src/managed/contract/index.d.ts` — type stubs matching the generated interface
- `src/managed/keys/.gitkeep` and `src/managed/zkir/.gitkeep` — empty directories for `viteStaticCopy`

These are overwritten when `bun run build:midnight` runs the real Compact compiler.

## WASM runtime workaround (Midnight)

`@midnight-ntwrk/onchain-runtime` must be imported **at the top of `main.ts` before any other Midnight imports**, otherwise the WASM module fails to initialize at runtime. With `DISABLE_MIDNIGHT=true`, guard the import:

```ts
if (!isEnvTrue("DISABLE_MIDNIGHT")) {
  await import("@midnight-ntwrk/onchain-runtime");
}
```
